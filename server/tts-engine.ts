import { GoogleGenAI } from "@google/genai";
import { EventEmitter } from "events";
import { voiceService, DEXTER_VOICE_CONFIG } from "./voice-service.ts";
import { ScriptChunk } from "./text-processor.ts";
import { processAndStitchAudio, AudioProcessingResult } from "./audio-processor.ts";

export type JobStatus =
  | "pending"
  | "synthesizing"
  | "stitching"
  | "completed"
  | "failed"
  | "cancelled";

export type ChunkStatus = "pending" | "synthesizing" | "completed" | "failed";

export interface ChunkProgress {
  index: number;
  text: string;
  wordCount: number;
  status: ChunkStatus;
  retries: number;
  error?: string;
}

export interface JobState {
  id: string;
  voiceId: string;
  status: JobStatus;
  scriptText: string;
  cleanText: string;
  totalWords: number;
  targetWpm: number;
  trimSilence: boolean;
  normalizePeak: boolean;
  chunks: ChunkProgress[];
  currentChunkIndex: number;
  progressPercent: number;
  statusMessage: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  result?: {
    durationSec: number;
    achievedWpm: number;
    tempoAdjusted: boolean;
    tempoFactor: number;
    sampleRate: number;
    wavSizeBytes: number;
    mp3SizeBytes?: number;
    hasMp3: boolean;
  };
}

export interface QuotaStatus {
  exhausted: boolean;
  message?: string;
  resetsInSeconds?: number;
  lastCheckedAt?: number;
}

export class TtsEngine extends EventEmitter {
  private ai: GoogleGenAI;
  private jobs: Map<string, JobState> = new Map();
  private jobPcmBuffers: Map<string, Map<number, Buffer>> = new Map();
  private jobCompletedAudio: Map<string, AudioProcessingResult> = new Map();
  private cancelFlags: Map<string, boolean> = new Map();
  private quotaStatus: QuotaStatus = {
    exhausted: true, // We know from the error that the free tier daily 10-request quota is currently reached
    message: "Google AI Studio Free Tier speech limit reached (10 requests/day per project). Quota refreshes automatically.",
    resetsInSeconds: 82900,
    lastCheckedAt: Date.now(),
  };

  constructor() {
    super();
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  public getQuotaStatus(): QuotaStatus {
    if (this.quotaStatus.exhausted && this.quotaStatus.lastCheckedAt && this.quotaStatus.resetsInSeconds) {
      const elapsedSec = Math.floor((Date.now() - this.quotaStatus.lastCheckedAt) / 1000);
      const remainingSec = Math.max(0, this.quotaStatus.resetsInSeconds - elapsedSec);
      if (remainingSec === 0) {
        this.quotaStatus.exhausted = false;
        this.quotaStatus.message = undefined;
      } else {
        return {
          ...this.quotaStatus,
          resetsInSeconds: remainingSec,
        };
      }
    }
    return this.quotaStatus;
  }

  public resetQuotaStatus(): void {
    this.quotaStatus = {
      exhausted: false,
      lastCheckedAt: Date.now(),
    };
  }

  public getJob(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  public getCompletedAudio(id: string): AudioProcessingResult | undefined {
    return this.jobCompletedAudio.get(id);
  }

  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === "completed" || job.status === "failed") {
      return false;
    }
    this.cancelFlags.set(id, true);
    job.status = "cancelled";
    job.statusMessage = "Job was cancelled by the user.";
    job.updatedAt = Date.now();
    this.emit(`job:${id}`, job);
    return true;
  }

  public createJob(params: {
    id: string;
    scriptText: string;
    cleanText: string;
    chunks: ScriptChunk[];
    voiceId?: string;
    targetWpm?: number;
    trimSilence?: boolean;
    normalizePeak?: boolean;
  }): JobState {
    const {
      id,
      scriptText,
      cleanText,
      chunks,
      voiceId = "",
      targetWpm = 300,
      trimSilence = true,
      normalizePeak = true,
    } = params;

    const totalWords = chunks.reduce((acc, c) => acc + c.wordCount, 0);

    const job: JobState = {
      id,
      voiceId,
      status: "pending",
      scriptText,
      cleanText,
      totalWords,
      targetWpm,
      trimSilence,
      normalizePeak,
      chunks: chunks.map((c) => ({
        index: c.index,
        text: c.text,
        wordCount: c.wordCount,
        status: "pending",
        retries: 0,
      })),
      currentChunkIndex: 0,
      progressPercent: 0,
      statusMessage: "Job queued for synthesis",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.jobPcmBuffers.set(id, new Map());
    this.cancelFlags.set(id, false);

    return job;
  }

  public async startJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found.`);

    // If voiceId is not specified, resolve Dexter's locked voice
    if (!job.voiceId) {
      const activeVoice = await voiceService.getVoice();
      job.voiceId = activeVoice.id;
    }

    job.status = "synthesizing";
    job.statusMessage = `Initializing synthesis with locked Dexter voice (${job.voiceId})...`;
    job.updatedAt = Date.now();
    this.emit(`job:${id}`, job);

    const pcmMap = this.jobPcmBuffers.get(id) || new Map();
    this.jobPcmBuffers.set(id, pcmMap);

    // Concurrency limit = 2 to respect rate limits and ensure rock-solid synthesis
    const CONCURRENCY = 2;
    const pendingIndices = job.chunks
      .filter((c) => c.status !== "completed")
      .map((c) => c.index);

    const queue = [...pendingIndices];
    let hasFailure = false;

    const worker = async () => {
      while (queue.length > 0) {
        if (this.cancelFlags.get(id)) return;

        const chunkIdx = queue.shift();
        if (chunkIdx === undefined) return;
        const chunkMeta = job.chunks[chunkIdx];
        if (!chunkMeta) return;

        chunkMeta.status = "synthesizing";
        job.currentChunkIndex = chunkIdx;
        this.updateJobProgress(job);

        try {
          const pcm = await this.synthesizeChunkWithRetry(job, chunkMeta);
          if (this.cancelFlags.get(id)) return;

          pcmMap.set(chunkIdx, pcm);
          chunkMeta.status = "completed";
          chunkMeta.error = undefined;
        } catch (err: any) {
          chunkMeta.status = "failed";
          chunkMeta.error = err.message || String(err);
          hasFailure = true;
          console.error(`[TtsEngine] Chunk ${chunkIdx} failed permanently:`, err);
        }

        this.updateJobProgress(job);
      }
    };

    // Run workers
    const workerPromises = Array.from(
      { length: Math.min(CONCURRENCY, pendingIndices.length) },
      () => worker()
    );

    await Promise.all(workerPromises);

    if (this.cancelFlags.get(id)) {
      job.status = "cancelled";
      job.statusMessage = "Job generation was cancelled.";
      this.emit(`job:${id}`, job);
      return;
    }

    if (hasFailure) {
      const firstFailedChunk = job.chunks.find((c) => c.status === "failed" && c.error);
      const detailedError =
        firstFailedChunk?.error ||
        "One or more audio chunks could not be synthesized. You can retry the failed segments.";
      job.status = "failed";
      job.error = detailedError;
      job.statusMessage = detailedError.includes("quota") || detailedError.includes("429")
        ? "Gemini TTS API quota limit reached."
        : "Synthesis halted due to failed segment(s).";
      this.emit(`job:${id}`, job);
      return;
    }

    // All chunks succeeded! Proceed to audio processing and stitching
    await this.finalizeJobAudio(job);
  }

  private async synthesizeChunkWithRetry(
    job: JobState,
    chunk: ChunkProgress
  ): Promise<Buffer> {
    const maxRetries = 2;
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      if (this.cancelFlags.get(job.id)) {
        throw new Error("Job cancelled");
      }

      chunk.retries = attempt;

      try {
        console.log(
          `[TtsEngine] Synthesizing chunk ${chunk.index + 1}/${job.chunks.length} (attempt ${attempt + 1}, words: ${chunk.wordCount})...`
        );

        const interaction = await this.ai.interactions.create({
          model: DEXTER_VOICE_CONFIG.model,
          input: [
            {
              type: "text",
              text: chunk.text,
              annotations: [
                {
                  type: "speech_metadata",
                  style: DEXTER_VOICE_CONFIG.style,
                },
              ],
            },
          ],
          response_format: {
            type: "audio",
            mime_type: "audio/l16",
            sample_rate: 24000,
          },
          generation_config: {
            speech_config: [
              {
                language: "en-GB",
                voice: job.voiceId,
              },
            ],
          },
        });

        const audioData = interaction.output_audio?.data;
        if (!audioData) {
          throw new Error("Empty audio data returned from Gemini TTS Interaction.");
        }

        const buf = Buffer.from(audioData, "base64");
        if (buf.length === 0 || buf.length % 2 !== 0) {
          throw new Error(`Corrupted audio chunk received (${buf.length} bytes).`);
        }

        return buf;
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        lastError = err;
        attempt++;
        console.warn(
          `[TtsEngine] Chunk ${chunk.index} attempt ${attempt} failed: ${errMsg}`
        );

        if (errMsg.includes("429") || errMsg.includes("Rate limit exceeded") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          this.quotaStatus = {
            exhausted: true,
            message: "Google AI Studio Free Tier limit reached (10 requests/day per project). Quota resets automatically in ~23 hours.",
            resetsInSeconds: 82800,
            lastCheckedAt: Date.now(),
          };

          const userFriendlyError = new Error(
            "Gemini 3.8 Flash TTS daily quota reached (Free Tier limit: 10 requests/day). Quota resets automatically in ~23 hours."
          );
          throw userFriendlyError;
        }

        if (attempt <= maxRetries) {
          // Exponential backoff: 1.2s, 2.4s
          const backoffMs = attempt * 1200;
          await new Promise((res) => setTimeout(res, backoffMs));
        }
      }
    }

    throw lastError || new Error(`Failed to synthesize chunk ${chunk.index} after ${maxRetries} retries.`);
  }

  private updateJobProgress(job: JobState): void {
    const total = job.chunks.length;
    const completed = job.chunks.filter((c) => c.status === "completed").length;
    const synthesizing = job.chunks.filter((c) => c.status === "synthesizing").length;

    // Progress: up to 85% for chunk synthesis, remaining 15% for stitching & export
    const chunkFraction = completed / total;
    job.progressPercent = Math.min(85, Math.round(chunkFraction * 85));

    if (completed === total) {
      job.statusMessage = "All segments synthesized. Trimming & stitching continuous audio...";
    } else {
      job.statusMessage = `Synthesizing segments: ${completed}/${total} completed (${synthesizing} in-flight)...`;
    }

    job.updatedAt = Date.now();
    this.emit(`job:${job.id}`, job);
  }

  private async finalizeJobAudio(job: JobState): Promise<void> {
    job.status = "stitching";
    job.statusMessage = "Stitching raw PCM buffers and aligning boundary crossfades...";
    job.progressPercent = 88;
    this.emit(`job:${job.id}`, job);

    const pcmMap = this.jobPcmBuffers.get(job.id);
    if (!pcmMap) {
      throw new Error("PCM buffers not found for job " + job.id);
    }

    // Assemble buffers in strict numeric index order
    const orderedBuffers: Buffer[] = [];
    for (let i = 0; i < job.chunks.length; i++) {
      const b = pcmMap.get(i);
      if (!b) {
        throw new Error(`Missing PCM buffer for chunk ${i}`);
      }
      orderedBuffers.push(b);
    }

    job.statusMessage = "Analyzing narration speed and applying pitch-preserving tempo adjustment...";
    job.progressPercent = 92;
    this.emit(`job:${job.id}`, job);

    try {
      const audioResult = await processAndStitchAudio(orderedBuffers, {
        trimSilence: job.trimSilence,
        targetWpm: job.targetWpm,
        wordCount: job.totalWords,
        normalizePeak: job.normalizePeak,
      });

      this.jobCompletedAudio.set(job.id, audioResult);

      job.status = "completed";
      job.progressPercent = 100;
      job.statusMessage = `Complete! Finished continuous track (${audioResult.durationSec}s, ~${audioResult.achievedWpm} WPM).`;
      job.result = {
        durationSec: audioResult.durationSec,
        achievedWpm: audioResult.achievedWpm,
        tempoAdjusted: audioResult.tempoAdjusted,
        tempoFactor: audioResult.tempoFactor,
        sampleRate: audioResult.sampleRate,
        wavSizeBytes: audioResult.wavBuffer.length,
        mp3SizeBytes: audioResult.mp3Buffer?.length,
        hasMp3: Boolean(audioResult.mp3Buffer),
      };

      job.updatedAt = Date.now();
      this.emit(`job:${job.id}`, job);
    } catch (err: any) {
      console.error("[TtsEngine] Error during audio processing/stitching:", err);
      job.status = "failed";
      job.error = `Audio processing failed: ${err.message || String(err)}`;
      job.statusMessage = "Failed during audio stitching or encoding.";
      this.emit(`job:${job.id}`, job);
    }
  }

  public async retryFailedChunks(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found.`);

    if (job.status !== "failed") {
      throw new Error("Job is not in a failed state.");
    }

    job.error = undefined;
    job.status = "synthesizing";
    job.statusMessage = "Retrying failed segments...";
    this.cancelFlags.set(id, false);

    // Reset failed chunks to pending
    job.chunks.forEach((c) => {
      if (c.status === "failed") {
        c.status = "pending";
        c.retries = 0;
        c.error = undefined;
      }
    });

    await this.startJob(id);
  }
}

export const ttsEngine = new TtsEngine();
