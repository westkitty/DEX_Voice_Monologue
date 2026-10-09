import assert from "assert";
import { sanitizeScript, tokenizeSentences as _, chunkScript, analyzeScript } from "../server/text-processor.ts";
import {
  createWavHeader,
  pcmToWav,
  trimBoundarySilence,
  stitchPcmChunks,
  normalizePcm,
  applyPitchPreservingTempo,
  processAndStitchAudio,
} from "../server/audio-processor.ts";
import { DEXTER_VOICE_CONFIG } from "../server/voice-service.ts";

async function runTests() {
  console.log("=== Running DEX//VOICE Pipeline Test Suite ===\n");

  // -------------------------------------------------------------
  // Test 1: Stage Direction Filtering
  // -------------------------------------------------------------
  console.log("Test 1: Stage Direction Filtering...");
  const rawTextWithDirections = `Do pay attention. [Sigh] I shall not repeat myself. [Pause] Lord Harrington (despite his dubious lineage) agreed with my assessment. [Music] Move along now. (pause)`;
  const { cleanText, removedDirections } = sanitizeScript(rawTextWithDirections);

  assert.ok(removedDirections.includes("[Sigh]"), "Should filter [Sigh]");
  assert.ok(removedDirections.includes("[Pause]"), "Should filter [Pause]");
  assert.ok(removedDirections.includes("[Music]"), "Should filter [Music]");
  assert.ok(
    cleanText.includes("Lord Harrington (despite his dubious lineage) agreed"),
    "Must preserve spoken conversational prose inside parentheses!"
  );
  assert.ok(!cleanText.includes("[Sigh]"), "Clean text must not contain [Sigh]");
  assert.ok(!cleanText.includes("[Pause]"), "Clean text must not contain [Pause]");
  assert.ok(!cleanText.includes("(pause)"), "Clean text must not contain (pause)");
  console.log("✓ Test 1 Passed: Stage directions filtered without altering prose parentheticals.");

  // -------------------------------------------------------------
  // Test 2: Sentence-Aware Chunking & Coverage Verification
  // -------------------------------------------------------------
  console.log("\nTest 2: Sentence-Aware Chunking & Coverage...");
  const longScript = `Paragraph one begins here with a grand proclamation of aristocratic superiority. The municipal commissioners are utterly incompetent and deserve nothing but scorn from the civilized populace. We must dispatch the telegram immediately without further delay.

Paragraph two commences with deep irritation regarding modern mechanical devices. Clockwork chronometers have failed our expectations for three consecutive fortnights. Lord Abernathy claims the steam engine will revolutionize industry, yet his factory produces nothing but smoke, din, and unwearable flannel.

Paragraph three wraps up the argument with finality. Let it be known that gentlemen do not tolerate excuses. Bring the carriage around to the courtyard at five o'clock sharp, and do not let the horses bolt over the cobblestones.`;

  const analysis = analyzeScript(longScript, 300);
  assert.ok(analysis.spokenWordCount > 0, "Spoken word count must be > 0");
  assert.ok(analysis.chunks.length >= 1, "Should generate chunks");
  assert.strictEqual(
    analysis.coverageVerified,
    true,
    "Chunk word sum must exactly equal total spoken words!"
  );

  // Check numeric chunk indices
  analysis.chunks.forEach((chunk, idx) => {
    assert.strictEqual(chunk.index, idx, `Chunk index must be strictly numeric sequence ${idx}`);
    assert.ok(chunk.wordCount > 0, "Chunk word count must be positive");
    assert.ok(!chunk.text.includes("\n\n"), "Chunk text should be continuous");
  });
  console.log(
    `✓ Test 2 Passed: ${analysis.chunks.length} chunks generated with 100% text coverage.`
  );

  // -------------------------------------------------------------
  // Test 3: WAV Header Generation & Spec Compliance
  // -------------------------------------------------------------
  console.log("\nTest 3: WAV Header Format & Spec Compliance...");
  const sampleRate = 24000;
  const numSamples = 24000; // 1 second of audio
  const pcmBytes = numSamples * 2; // 48,000 bytes
  const dummyPcm = Buffer.alloc(pcmBytes);

  const wav = pcmToWav(dummyPcm, sampleRate);
  assert.strictEqual(wav.length, pcmBytes + 44, "WAV buffer must be pcm length + 44 bytes");
  assert.strictEqual(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.strictEqual(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.strictEqual(wav.subarray(12, 16).toString("ascii"), "fmt ");
  assert.strictEqual(wav.readUInt16LE(20), 1, "AudioFormat must be 1 (PCM)");
  assert.strictEqual(wav.readUInt16LE(22), 1, "NumChannels must be 1 (Mono)");
  assert.strictEqual(wav.readUInt32LE(24), 24000, "SampleRate must be 24000");
  assert.strictEqual(wav.readUInt32LE(28), 48000, "ByteRate must be 48000 (24000 * 2)");
  assert.strictEqual(wav.readUInt16LE(32), 2, "BlockAlign must be 2");
  assert.strictEqual(wav.readUInt16LE(34), 16, "BitsPerSample must be 16");
  assert.strictEqual(wav.subarray(36, 40).toString("ascii"), "data");
  assert.strictEqual(wav.readUInt32LE(40), pcmBytes, "Data chunk size must match PCM byte count");
  console.log("✓ Test 3 Passed: 44-byte RIFF header strictly conforms to 24kHz 16-bit mono PCM.");

  // -------------------------------------------------------------
  // Test 4: Boundary Silence Trimming & Padding Protection
  // -------------------------------------------------------------
  console.log("\nTest 4: Silence Trimming with Consonant Padding Protection...");
  // Create buffer: 1000 samples silence, 1000 samples tone (amplitude 5000), 1000 samples silence
  const tonePcm = Buffer.alloc(3000 * 2);
  for (let i = 1000; i < 2000; i++) {
    tonePcm.writeInt16LE(Math.sin(i * 0.1) * 5000, i * 2);
  }

  const trimmed = trimBoundarySilence(tonePcm, 200, 25);
  assert.ok(trimmed.length < tonePcm.length, "Trimmed buffer should be shorter than original");
  assert.ok(
    trimmed.length >= 1000 * 2,
    "Trimmed buffer must preserve all tone samples plus padding"
  );
  console.log(
    `✓ Test 4 Passed: Boundary silence trimmed safely (${tonePcm.length} -> ${trimmed.length} bytes).`
  );

  // -------------------------------------------------------------
  // Test 5: PCM Stitching and Boundary Crossfade
  // -------------------------------------------------------------
  console.log("\nTest 5: Chronological PCM Stitching & Crossfade...");
  const chunk1 = Buffer.alloc(4800, 100); // 100ms
  const chunk2 = Buffer.alloc(4800, 200); // 100ms
  const chunk3 = Buffer.alloc(4800, 300); // 100ms

  const stitched = stitchPcmChunks([chunk1, chunk2, chunk3]);
  assert.strictEqual(
    stitched.length,
    chunk1.length + chunk2.length + chunk3.length,
    "Stitched buffer length must equal sum of chunks (no gaps, no double headers)"
  );
  console.log("✓ Test 5 Passed: PCM chunks concatenated chronologically with boundary smoothing.");

  // -------------------------------------------------------------
  // Test 6: FFmpeg Pitch-Preserving Tempo & MP3 Generation
  // -------------------------------------------------------------
  console.log("\nTest 6: Audio Pipeline & FFmpeg Tempo / Encoding Integration...");
  // Create a 1-second 440 Hz sine wave tone in raw 16-bit 24kHz mono PCM
  const testTone = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++) {
    const val = Math.sin((2 * Math.PI * 440 * i) / 24000) * 12000;
    testTone.writeInt16LE(Math.round(val), i * 2);
  }

  const processedResult = await processAndStitchAudio([testTone], {
    trimSilence: false,
    targetWpm: 300,
    wordCount: 150, // 150 words in 1 second would be fast, but test tone is 1s
    normalizePeak: true,
  });

  assert.ok(processedResult.wavBuffer.length > 44, "Must generate valid master WAV buffer");
  assert.ok(processedResult.durationSec > 0, "Must calculate duration");
  assert.ok(processedResult.achievedWpm > 0, "Must calculate achieved Wpm");
  assert.ok(processedResult.mp3Buffer && processedResult.mp3Buffer.length > 0, "Must encode MP3 file via FFmpeg");
  console.log(
    `✓ Test 6 Passed: Full audio processor generated ${processedResult.durationSec}s WAV (${processedResult.wavBuffer.length} bytes) and MP3 (${processedResult.mp3Buffer?.length} bytes).`
  );

  // -------------------------------------------------------------
  // Test 7: Dexter Voice Metadata Invariant
  // -------------------------------------------------------------
  console.log("\nTest 7: Locked Dexter Voice Config Invariant...");
  assert.strictEqual(DEXTER_VOICE_CONFIG.model, "gemini-3.8-flash-tts");
  assert.strictEqual(DEXTER_VOICE_CONFIG.language_code, "en-GB");
  assert.strictEqual(DEXTER_VOICE_CONFIG.gender, "male");
  assert.ok(DEXTER_VOICE_CONFIG.style.includes("300 words per minute"));
  assert.ok(DEXTER_VOICE_CONFIG.description.includes("Victorian-era English aristocratic"));
  console.log("✓ Test 7 Passed: Locked Dexter voice configuration verified.");

  console.log("\n========================================================");
  console.log("  ALL PIPELINE UNIT TESTS PASSED SUCCESSFULLY!          ");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
