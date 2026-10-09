export interface VoiceRecord {
  id: string;
  display_name: string;
  model: string;
  gender: string;
  language_code: string;
  description: string;
  style: string;
  createdAt: string;
  expire_time?: string;
}

export interface ScriptChunk {
  index: number;
  text: string;
  wordCount: number;
  charCount: number;
}

export interface ScriptAnalysis {
  rawWordCount: number;
  spokenWordCount: number;
  estimatedDurationSec: number;
  removedDirections: string[];
  cleanText: string;
  chunks: ScriptChunk[];
  coverageVerified: boolean;
}

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
