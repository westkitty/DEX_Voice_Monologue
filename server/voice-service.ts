import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const VOICE_FILE = path.resolve(process.cwd(), "data/dexter-voice.json");

export const DEXTER_VOICE_CONFIG = {
  model: "gemini-3.8-flash-tts",
  gender: "male",
  language_code: "en-GB",
  display_name: "Dexter — Victorian Gentleman",
  description:
    "An elderly Victorian-era English aristocratic gentleman with a deep, aged masculine baritone, dry gravelly chest resonance, crisp consonants, clipped syllables, cultivated nineteenth-century-style British Received Pronunciation, precise enunciation, non-breathy vocal texture, narrow controlled inflection, stern authority, dry sarcasm, exceptional intelligence and profoundly impatient contempt. Unmistakably elderly, formal, aristocratic and male. Not cartoonish, theatrical, melodramatic, youthful, American or an audiobook announcer.",
  style:
    "Extremely rapid, continuous, tightly articulated spoken narration, targeting approximately 300 words per minute; dry, stern, deadpan and sarcastic, with virtually no pauses, no audible breathing and no theatrical delivery.",
};

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

export class VoiceService {
  private ai: GoogleGenAI;
  private currentVoice: VoiceRecord | null = null;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    this.loadPersistedVoice();
  }

  private loadPersistedVoice(): void {
    try {
      if (fs.existsSync(VOICE_FILE)) {
        const raw = fs.readFileSync(VOICE_FILE, "utf-8");
        this.currentVoice = JSON.parse(raw);
        console.log(`[VoiceService] Loaded persisted Dexter voice ID: ${this.currentVoice?.id}`);
      }
    } catch (err) {
      console.error("[VoiceService] Failed reading voice file:", err);
    }
  }

  private persistVoice(voice: VoiceRecord): void {
    try {
      const dir = path.dirname(VOICE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(VOICE_FILE, JSON.stringify(voice, null, 2), "utf-8");
      this.currentVoice = voice;
      console.log(`[VoiceService] Persisted voice ID: ${voice.id}`);
    } catch (err) {
      console.error("[VoiceService] Failed saving voice file:", err);
    }
  }

  public async getVoice(): Promise<VoiceRecord> {
    if (this.currentVoice && this.currentVoice.id) {
      return this.currentVoice;
    }

    // Try finding in list or create new
    try {
      const list = await this.ai.voices.list();
      const existing = list?.voices?.find(
        (v) =>
          v.display_name?.includes("Dexter") ||
          v.description?.includes("Victorian-era English aristocratic")
      );

      if (existing && existing.id) {
        const rec: VoiceRecord = {
          id: existing.id,
          display_name: existing.display_name || DEXTER_VOICE_CONFIG.display_name,
          model: existing.model || DEXTER_VOICE_CONFIG.model,
          gender: existing.gender || DEXTER_VOICE_CONFIG.gender,
          language_code: existing.language_code || DEXTER_VOICE_CONFIG.language_code,
          description: existing.description || DEXTER_VOICE_CONFIG.description,
          style: DEXTER_VOICE_CONFIG.style,
          createdAt: new Date().toISOString(),
          expire_time: existing.expire_time,
        };
        this.persistVoice(rec);
        return rec;
      }
    } catch (err) {
      console.warn("[VoiceService] Failed listing voices, will attempt creation:", err);
    }

    // Create fresh voice if none found
    return this.createVoice();
  }

  public async createVoice(customPrompt?: string): Promise<VoiceRecord> {
    const promptText = customPrompt || DEXTER_VOICE_CONFIG.description;
    console.log("[VoiceService] Creating prompted Dexter voice via ai.voices.create...");

    try {
      const res = await this.ai.voices.create({
        store: true,
        voice: {
          type: "prompted",
          model: DEXTER_VOICE_CONFIG.model,
          gender: DEXTER_VOICE_CONFIG.gender,
          language_code: DEXTER_VOICE_CONFIG.language_code,
          display_name: DEXTER_VOICE_CONFIG.display_name,
          description: promptText,
          prompted: {
            input: promptText,
          },
        },
      });

      if (!res?.id) {
        throw new Error("Voice creation response did not contain a valid voice ID.");
      }

      const rec: VoiceRecord = {
        id: res.id,
        display_name: res.display_name || DEXTER_VOICE_CONFIG.display_name,
        model: res.model || DEXTER_VOICE_CONFIG.model,
        gender: res.gender || DEXTER_VOICE_CONFIG.gender,
        language_code: res.language_code || DEXTER_VOICE_CONFIG.language_code,
        description: res.description || promptText,
        style: DEXTER_VOICE_CONFIG.style,
        createdAt: new Date().toISOString(),
        expire_time: res.expire_time,
      };

      this.persistVoice(rec);
      return rec;
    } catch (err: any) {
      console.error("[VoiceService] Voice creation error:", err);
      throw new Error(`Failed to create Dexter voice: ${err.message || String(err)}`);
    }
  }

  public setVoiceId(id: string): VoiceRecord {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error("Voice ID cannot be empty");
    }

    const rec: VoiceRecord = {
      ...(this.currentVoice || {
        display_name: DEXTER_VOICE_CONFIG.display_name,
        model: DEXTER_VOICE_CONFIG.model,
        gender: DEXTER_VOICE_CONFIG.gender,
        language_code: DEXTER_VOICE_CONFIG.language_code,
        description: DEXTER_VOICE_CONFIG.description,
        style: DEXTER_VOICE_CONFIG.style,
        createdAt: new Date().toISOString(),
      }),
      id: trimmed,
    };

    this.persistVoice(rec);
    return rec;
  }

  public async audition(voiceId?: string): Promise<{ audioBase64: string; sampleRate: number }> {
    const activeVoice = voiceId ? voiceId : (await this.getVoice()).id;
    const auditionText =
      "Do pay attention. I shall not repeat myself, nor will I indulge your customary incompetence.";

    const interaction = await this.ai.interactions.create({
      model: DEXTER_VOICE_CONFIG.model,
      input: [
        {
          type: "text",
          text: auditionText,
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
            voice: activeVoice,
          },
        ],
      },
    });

    const audioData = interaction.output_audio?.data;
    if (!audioData) {
      throw new Error("No audio returned from audition synthesis.");
    }

    return {
      audioBase64: audioData,
      sampleRate: 24000,
    };
  }
}

export const voiceService = new VoiceService();
