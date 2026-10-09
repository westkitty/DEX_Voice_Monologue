import express, { Request, Response } from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { voiceService } from "./server/voice-service.ts";
import { analyzeScript } from "./server/text-processor.ts";
import { ttsEngine } from "./server/tts-engine.ts";
import { pcmToWav } from "./server/audio-processor.ts";

dotenv.config();

const app = express();
app.use(express.json({ limit: "15mb" }));

// -------------------------------------------------------------
// Voice Management Routes
// -------------------------------------------------------------

app.get("/api/voice/status", async (_req: Request, res: Response) => {
  try {
    const voice = await voiceService.getVoice();
    res.json({ success: true, voice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/voice/create", async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const voice = await voiceService.createVoice(prompt);
    res.json({ success: true, voice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/voice/set-id", (req: Request, res: Response) => {
  try {
    const { voiceId } = req.body;
    if (!voiceId) {
      return res.status(400).json({ success: false, error: "voiceId is required" });
    }
    const voice = voiceService.setVoiceId(voiceId);
    res.json({ success: true, voice });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/voice/audition", async (req: Request, res: Response) => {
  try {
    const { voiceId } = req.body;
    const audition = await voiceService.audition(voiceId);
    const rawPcm = Buffer.from(audition.audioBase64, "base64");
    const wav = pcmToWav(rawPcm, audition.sampleRate);
    res.json({
      success: true,
      audioBase64: wav.toString("base64"),
      mimeType: "audio/wav",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.get("/api/quota/status", (_req: Request, res: Response) => {
  const status = ttsEngine.getQuotaStatus();
  res.json({ success: true, quota: status });
});

app.post("/api/quota/reset", (_req: Request, res: Response) => {
  ttsEngine.resetQuotaStatus();
  res.json({ success: true, quota: ttsEngine.getQuotaStatus() });
});

// -------------------------------------------------------------
// Script Analysis Route
// -------------------------------------------------------------

app.post("/api/script/analyze", (req: Request, res: Response) => {
  try {
    const { script, targetWpm = 300 } = req.body;
    if (typeof script !== "string") {
      return res.status(400).json({ success: false, error: "Script must be a string." });
    }
    const analysis = analyzeScript(script, targetWpm);
    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// -------------------------------------------------------------
// TTS Generation Jobs Routes
// -------------------------------------------------------------

app.post("/api/jobs/create", async (req: Request, res: Response) => {
  try {
    const {
      script,
      targetWpm = 300,
      voiceId,
      trimSilence = true,
      normalizePeak = true,
    } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ success: false, error: "Script cannot be empty." });
    }

    const analysis = analyzeScript(script, targetWpm);
    if (analysis.chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Script contained no speakable text after filtering stage directions.",
      });
    }

    const activeVoice = voiceId ? voiceId : (await voiceService.getVoice()).id;
    const jobId = crypto.randomUUID();

    const job = ttsEngine.createJob({
      id: jobId,
      scriptText: script,
      cleanText: analysis.cleanText,
      chunks: analysis.chunks,
      voiceId: activeVoice,
      targetWpm,
      trimSilence,
      normalizePeak,
    });

    // Start in background
    ttsEngine.startJob(jobId).catch((err) => {
      console.error(`[Server] Background job ${jobId} failed uncaught:`, err);
    });

    res.json({
      success: true,
      jobId,
      job,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.get("/api/jobs/:id/status", (req: Request, res: Response) => {
  const job = ttsEngine.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }
  res.json({ success: true, job });
});

app.get("/api/jobs/:id/events", (req: Request, res: Response) => {
  const jobId = req.params.id;
  const job = ttsEngine.getJob(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }

  // Setup Server-Sent Events headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial state immediately
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  const onUpdate = (updatedJob: any) => {
    res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
    if (
      updatedJob.status === "completed" ||
      updatedJob.status === "failed" ||
      updatedJob.status === "cancelled"
    ) {
      res.end();
    }
  };

  ttsEngine.on(`job:${jobId}`, onUpdate);

  req.on("close", () => {
    ttsEngine.off(`job:${jobId}`, onUpdate);
  });
});

app.post("/api/jobs/:id/retry", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const job = ttsEngine.getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found." });
    }

    ttsEngine.retryFailedChunks(jobId).catch((err) => {
      console.error(`[Server] Retry job ${jobId} failed uncaught:`, err);
    });

    res.json({ success: true, message: "Retrying failed segments..." });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/jobs/:id/cancel", (req: Request, res: Response) => {
  const jobId = req.params.id;
  const ok = ttsEngine.cancelJob(jobId);
  if (!ok) {
    return res.status(400).json({ success: false, error: "Cannot cancel finished or non-existent job." });
  }
  res.json({ success: true, message: "Job cancellation requested." });
});

// Audio Download Endpoints
app.get("/api/jobs/:id/audio/wav", (req: Request, res: Response) => {
  const jobId = req.params.id;
  const audio = ttsEngine.getCompletedAudio(jobId);

  if (!audio || !audio.wavBuffer) {
    return res.status(404).json({
      success: false,
      error: "Complete audio file does not exist yet. Please wait for generation to finish.",
    });
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", 'attachment; filename="dexter_monologue.wav"');
  res.setHeader("Content-Length", audio.wavBuffer.length);
  res.send(audio.wavBuffer);
});

app.get("/api/jobs/:id/audio/mp3", (req: Request, res: Response) => {
  const jobId = req.params.id;
  const audio = ttsEngine.getCompletedAudio(jobId);

  if (!audio || !audio.mp3Buffer) {
    return res.status(404).json({
      success: false,
      error: "MP3 audio track is not available.",
    });
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", 'attachment; filename="dexter_monologue.mp3"');
  res.setHeader("Content-Length", audio.mp3Buffer.length);
  res.send(audio.mp3Buffer);
});

// -------------------------------------------------------------
// Vite Frontend Integration
// -------------------------------------------------------------

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`  DEX//VOICE — The Dexter Monologue Engine`);
    console.log(`  Dev server listening on http://0.0.0.0:${PORT}`);
    console.log(`======================================================\n`);
  });
}

startServer();
