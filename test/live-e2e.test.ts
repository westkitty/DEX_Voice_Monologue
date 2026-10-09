import assert from "assert";
import { ttsEngine } from "../server/tts-engine.ts";
import { voiceService } from "../server/voice-service.ts";
import { analyzeScript } from "../server/text-processor.ts";

async function runLiveE2ETest() {
  console.log("=== Running DEX//VOICE Real TTS End-to-End Test ===");

  const voice = await voiceService.getVoice();
  console.log(`Using active Dexter voice: ${voice.id} (${voice.display_name})`);
  assert.ok(voice.id, "Voice ID must exist");

  const testScript = "Do pay attention. [Sigh] I shall not repeat myself. [Pause] Ensure the carriage is ready at four o'clock sharp.";
  const analysis = analyzeScript(testScript, 300);

  assert.ok(analysis.chunks.length > 0, "Must create chunks");
  console.log(`Chunks created: ${analysis.chunks.length}, spoken words: ${analysis.spokenWordCount}`);

  const jobId = "test-live-" + Date.now();
  const job = ttsEngine.createJob({
    id: jobId,
    scriptText: testScript,
    cleanText: analysis.cleanText,
    chunks: analysis.chunks,
    voiceId: voice.id,
    targetWpm: 300,
    trimSilence: true,
    normalizePeak: true,
  });

  console.log("Starting real TTS synthesis...");
  await ttsEngine.startJob(jobId);

  const finalJob = ttsEngine.getJob(jobId);
  assert.strictEqual(finalJob?.status, "completed", "Job must complete successfully");
  console.log(`Job status: ${finalJob.status}`);
  console.log(`Result duration: ${finalJob.result?.durationSec}s`);
  console.log(`Result WPM: ${finalJob.result?.achievedWpm}`);

  const completedAudio = ttsEngine.getCompletedAudio(jobId);
  assert.ok(completedAudio, "Completed audio must be stored");
  assert.ok(completedAudio.wavBuffer.length > 1000, "WAV buffer must be valid size");
  assert.strictEqual(completedAudio.wavBuffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.strictEqual(completedAudio.wavBuffer.subarray(8, 12).toString("ascii"), "WAVE");

  if (completedAudio.mp3Buffer) {
    console.log(`MP3 buffer size: ${completedAudio.mp3Buffer.length} bytes`);
  }

  console.log("\n✓ Real TTS End-to-End Test PASSED flawlessly!");
}

runLiveE2ETest().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
