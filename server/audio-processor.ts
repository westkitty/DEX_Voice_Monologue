import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export interface AudioProcessingOptions {
  trimSilence?: boolean;
  targetWpm?: number;
  wordCount?: number;
  normalizePeak?: boolean;
}

export interface AudioProcessingResult {
  rawPcm: Buffer;
  wavBuffer: Buffer;
  mp3Buffer?: Buffer;
  durationSec: number;
  sampleRate: number;
  channels: number;
  achievedWpm: number;
  tempoAdjusted: boolean;
  tempoFactor: number;
}

const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2; // 16-bit
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE; // 48,000 bytes/sec

/**
 * Creates a standard 44-byte RIFF WAV header for 16-bit mono PCM audio
 */
export function createWavHeader(pcmByteLength: number, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  const totalFileSize = pcmByteLength + 36;
  const byteRate = sampleRate * BYTES_PER_SAMPLE;
  const blockAlign = BYTES_PER_SAMPLE;

  // RIFF chunk descriptor
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(totalFileSize, 4);
  header.write("WAVE", 8, "ascii");

  // fmt sub-chunk
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat: 1 = PCM
  header.writeUInt16LE(1, 22); // NumChannels: 1 = Mono
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample: 16

  // data sub-chunk
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmByteLength, 40);

  return header;
}

/**
 * Creates a complete playable WAV file buffer from raw 16-bit mono PCM
 */
export function pcmToWav(pcmBuffer: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = createWavHeader(pcmBuffer.length, sampleRate);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Conservatively trims leading and trailing digital silence from a 16-bit mono PCM buffer.
 * Preserves 25ms of safety padding so consonants and plosives are never cut.
 */
export function trimBoundarySilence(
  pcm: Buffer,
  threshold = 180, // Noise floor threshold (out of 32767)
  padMs = 25
): Buffer {
  if (pcm.length < BYTES_PER_SAMPLE * 10) return pcm;

  const numSamples = Math.floor(pcm.length / BYTES_PER_SAMPLE);
  const padSamples = Math.floor((SAMPLE_RATE * padMs) / 1000);

  let firstActive = 0;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.abs(pcm.readInt16LE(i * BYTES_PER_SAMPLE));
    if (sample > threshold) {
      firstActive = i;
      break;
    }
  }

  let lastActive = numSamples - 1;
  for (let i = numSamples - 1; i >= 0; i--) {
    const sample = Math.abs(pcm.readInt16LE(i * BYTES_PER_SAMPLE));
    if (sample > threshold) {
      lastActive = i;
      break;
    }
  }

  if (firstActive >= lastActive) {
    // Pure silence buffer, return as is
    return pcm;
  }

  const startSample = Math.max(0, firstActive - padSamples);
  const endSample = Math.min(numSamples, lastActive + padSamples + 1);

  const startByte = startSample * BYTES_PER_SAMPLE;
  const endByte = endSample * BYTES_PER_SAMPLE;

  return pcm.subarray(startByte, endByte);
}

/**
 * Smooth boundary transition with a brief 4ms crossfade / cosine ramp between adjacent chunks
 */
export function stitchPcmChunks(chunks: Buffer[]): Buffer {
  if (chunks.length === 0) return Buffer.alloc(0);
  if (chunks.length === 1) return chunks[0];

  const rampMs = 4;
  const rampSamples = Math.floor((SAMPLE_RATE * rampMs) / 1000); // 96 samples
  const rampBytes = rampSamples * BYTES_PER_SAMPLE;

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = Buffer.alloc(totalLength);

  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const current = Buffer.from(chunks[i]);

    // Apply soft fade-in on start of subsequent chunks to prevent DC clicks
    if (i > 0 && current.length >= rampBytes) {
      for (let s = 0; s < rampSamples; s++) {
        const factor = s / rampSamples;
        const val = current.readInt16LE(s * BYTES_PER_SAMPLE);
        current.writeInt16LE(Math.round(val * factor), s * BYTES_PER_SAMPLE);
      }
    }

    // Apply soft fade-out on end of chunk if not the last
    if (i < chunks.length - 1 && current.length >= rampBytes) {
      const startS = Math.floor(current.length / BYTES_PER_SAMPLE) - rampSamples;
      for (let s = 0; s < rampSamples; s++) {
        const factor = 1 - s / rampSamples;
        const sampleIdx = (startS + s) * BYTES_PER_SAMPLE;
        const val = current.readInt16LE(sampleIdx);
        current.writeInt16LE(Math.round(val * factor), sampleIdx);
      }
    }

    current.copy(result, offset);
    offset += current.length;
  }

  return result;
}

/**
 * Normalizes peak audio amplitude conservatively to -0.8 dBFS (~30,000 / 32767)
 */
export function normalizePcm(pcm: Buffer, targetPeak = 30000): Buffer {
  const numSamples = Math.floor(pcm.length / BYTES_PER_SAMPLE);
  let maxAbs = 0;

  for (let i = 0; i < numSamples; i++) {
    const val = Math.abs(pcm.readInt16LE(i * BYTES_PER_SAMPLE));
    if (val > maxAbs) maxAbs = val;
  }

  if (maxAbs === 0 || maxAbs >= 32700) {
    // If already loud or near clipping, avoid unnecessary amplification
    return pcm;
  }

  const gain = Math.min(3.0, targetPeak / maxAbs);
  if (Math.abs(gain - 1.0) < 0.05) return pcm; // Negligible difference

  const normalized = Buffer.alloc(pcm.length);
  for (let i = 0; i < numSamples; i++) {
    const val = pcm.readInt16LE(i * BYTES_PER_SAMPLE);
    const scaled = Math.round(val * gain);
    const clamped = Math.max(-32768, Math.min(32767, scaled));
    normalized.writeInt16LE(clamped, i * BYTES_PER_SAMPLE);
  }

  return normalized;
}

/**
 * Applies pitch-preserving tempo scaling via FFmpeg's `atempo` filter
 */
export function applyPitchPreservingTempo(
  inputPcm: Buffer,
  tempoFactor: number,
  sampleRate = SAMPLE_RATE
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // FFmpeg atempo requires values between 0.5 and 2.0
    const clampedFactor = Math.max(0.5, Math.min(2.0, tempoFactor));

    const ffmpeg = spawn("/usr/bin/ffmpeg", [
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-filter:a",
      `atempo=${clampedFactor.toFixed(3)}`,
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "pipe:1",
    ]);

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => outChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    ffmpeg.on("close", (code) => {
      if (code === 0 && outChunks.length > 0) {
        resolve(Buffer.concat(outChunks));
      } else {
        const errStr = Buffer.concat(errChunks).toString("utf-8");
        console.warn(`[AudioProcessor] FFmpeg atempo failed (code ${code}):`, errStr);
        // Fallback to original buffer
        resolve(inputPcm);
      }
    });

    ffmpeg.on("error", (err) => {
      console.warn("[AudioProcessor] FFmpeg spawn error:", err);
      resolve(inputPcm);
    });

    ffmpeg.stdin.write(inputPcm);
    ffmpeg.stdin.end();
  });
}

/**
 * Encodes raw 16-bit PCM to high-quality MP3 (192 kbps) using FFmpeg
 */
export function encodeMp3(inputPcm: Buffer, sampleRate = SAMPLE_RATE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("/usr/bin/ffmpeg", [
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-f",
      "mp3",
      "pipe:1",
    ]);

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => outChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    ffmpeg.on("close", (code) => {
      if (code === 0 && outChunks.length > 0) {
        resolve(Buffer.concat(outChunks));
      } else {
        const errStr = Buffer.concat(errChunks).toString("utf-8");
        reject(new Error(`FFmpeg MP3 encoding failed: ${errStr}`));
      }
    });

    ffmpeg.on("error", (err) => reject(err));

    ffmpeg.stdin.write(inputPcm);
    ffmpeg.stdin.end();
  });
}

/**
 * Complete Audio Processing Pipeline:
 * 1. Trim boundary silence on each chunk
 * 2. Stitch chunks chronologically with smoothing
 * 3. Measure raw WPM vs target WPM (default 300)
 * 4. Apply pitch-preserving atempo if needed
 * 5. Normalize audio
 * 6. Generate final WAV container and MP3 container
 */
export async function processAndStitchAudio(
  rawPcmChunks: Buffer[],
  options: AudioProcessingOptions = {}
): Promise<AudioProcessingResult> {
  const {
    trimSilence = true,
    targetWpm = 300,
    wordCount = 0,
    normalizePeak = true,
  } = options;

  // 1. Process each chunk (silence trimming)
  const processedChunks = rawPcmChunks.map((chunk) => {
    return trimSilence ? trimBoundarySilence(chunk) : chunk;
  });

  // 2. Stitch together
  let stitchedPcm = stitchPcmChunks(processedChunks);

  // Calculate raw duration
  const rawDurationSec = stitchedPcm.length / BYTES_PER_SECOND;
  let rawWpm = wordCount > 0 && rawDurationSec > 0 ? (wordCount / rawDurationSec) * 60 : targetWpm;

  let tempoFactor = 1.0;
  let tempoAdjusted = false;

  // 3. Pacing check: if speech is slower than target WPM, speed up via FFmpeg atempo
  if (targetWpm > 0 && wordCount > 0 && rawWpm > 0) {
    const ratio = targetWpm / rawWpm;
    // Apply tempo adjustment if ratio deviates more than 8%
    if (ratio > 1.08 || ratio < 0.92) {
      // Protect intelligibility: clamp between 0.85x and 1.65x
      tempoFactor = Math.max(0.85, Math.min(1.65, ratio));
      console.log(
        `[AudioProcessor] Raw WPM: ${rawWpm.toFixed(1)}, Target WPM: ${targetWpm}. Applying pitch-preserving atempo: ${tempoFactor.toFixed(2)}x`
      );

      try {
        const adjustedPcm = await applyPitchPreservingTempo(stitchedPcm, tempoFactor);
        stitchedPcm = adjustedPcm;
        tempoAdjusted = true;
      } catch (err) {
        console.warn("[AudioProcessor] Tempo adjustment error:", err);
      }
    }
  }

  // 4. Normalize
  if (normalizePeak) {
    stitchedPcm = normalizePcm(stitchedPcm);
  }

  // 5. Final stats
  const finalDurationSec = stitchedPcm.length / BYTES_PER_SECOND;
  const achievedWpm =
    wordCount > 0 && finalDurationSec > 0
      ? Math.round((wordCount / finalDurationSec) * 60)
      : targetWpm;

  // 6. Generate WAV file
  const wavBuffer = pcmToWav(stitchedPcm, SAMPLE_RATE);

  // 7. Generate MP3 file
  let mp3Buffer: Buffer | undefined;
  try {
    mp3Buffer = await encodeMp3(stitchedPcm, SAMPLE_RATE);
  } catch (err) {
    console.warn("[AudioProcessor] MP3 encoding failed, WAV will be primary:", err);
  }

  return {
    rawPcm: stitchedPcm,
    wavBuffer,
    mp3Buffer,
    durationSec: Number(finalDurationSec.toFixed(2)),
    sampleRate: SAMPLE_RATE,
    channels: 1,
    achievedWpm,
    tempoAdjusted,
    tempoFactor,
  };
}
