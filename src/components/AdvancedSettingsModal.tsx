import React, { useState } from "react";
import {
  X,
  Volume2,
  Check,
  RotateCcw,
  Sliders,
  Shield,
  HelpCircle,
  Copy,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";
import { VoiceRecord } from "../types";

interface AdvancedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voice: VoiceRecord | null;
  onSetVoiceId: (id: string) => Promise<void>;
  onAudition: (voiceId?: string) => Promise<void>;
  isAuditioning: boolean;
  targetWpm: number;
  onTargetWpmChange: (wpm: number) => void;
  trimSilence: boolean;
  onTrimSilenceChange: (v: boolean) => void;
  normalizePeak: boolean;
  onNormalizePeakChange: (v: boolean) => void;
  onCreateNewVoice: () => Promise<void>;
  isCreatingVoice: boolean;
}

export const AdvancedSettingsModal: React.FC<AdvancedSettingsModalProps> = ({
  isOpen,
  onClose,
  voice,
  onSetVoiceId,
  onAudition,
  isAuditioning,
  targetWpm,
  onTargetWpmChange,
  trimSilence,
  onTrimSilenceChange,
  normalizePeak,
  onNormalizePeakChange,
  onCreateNewVoice,
  isCreatingVoice,
}) => {
  const [customVoiceId, setCustomVoiceId] = useState(voice?.id || "");
  const [isCopied, setIsCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveVoiceId = async () => {
    setErrorMsg(null);
    try {
      await onSetVoiceId(customVoiceId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update voice ID.");
    }
  };

  const handleCopyId = () => {
    if (voice?.id) {
      navigator.clipboard.writeText(voice.id);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#12151e] border border-[#2b3042] rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-7 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#212636]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/40 text-red-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-serif-title font-bold text-white">
                Engine & Voice Settings
              </h3>
              <p className="text-xs text-zinc-400">
                Pacing, speaker persistence and audio processing parameters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {/* Section 1: Locked Voice Persona */}
          <div className="p-4 bg-[#0c0e14] border border-[#1f2433] rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Persistent Speaker Identity
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/50 text-emerald-400">
                Locked Dexter Persona
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Synthesized with Gemini 3.8 Flash TTS. This custom voice ID is saved once and reused across all chunks to guarantee zero vocal drift.
            </p>

            {/* Current Voice ID */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#151924] border border-[#272e42] rounded-xl px-3 py-2 text-xs font-mono text-zinc-300 flex items-center justify-between truncate">
                <span className="truncate">{voice?.id || "None set"}</span>
                <button
                  onClick={handleCopyId}
                  title="Copy voice ID"
                  className="text-zinc-500 hover:text-zinc-300 p-1"
                >
                  {isCopied ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <button
                onClick={() => onAudition(voice?.id)}
                disabled={isAuditioning}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#1d2230] hover:bg-[#282f44] text-zinc-200 border border-[#2f374e] flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Volume2 className="w-3.5 h-3.5 text-red-400" />
                <span>Audition</span>
              </button>
            </div>

            {/* Paste or Override Voice ID */}
            <div className="pt-2 border-t border-[#1a1e2b] space-y-2">
              <label className="text-[11px] font-semibold text-zinc-400 block">
                Paste / Replace Custom Voice ID:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customVoiceId}
                  onChange={(e) => setCustomVoiceId(e.target.value)}
                  placeholder="e.g. voice_ly0vxtgwdelf"
                  className="flex-1 bg-[#12151e] border border-[#242a3c] rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-red-600"
                />
                <button
                  onClick={handleSaveVoiceId}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-700 hover:bg-red-600 text-white transition flex items-center gap-1"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <span>Set ID</span>
                  )}
                </button>
              </div>
            </div>

            {/* Re-prompt Voice Button */}
            <div className="pt-2 flex justify-between items-center text-xs">
              <span className="text-zinc-500 text-[11px]">
                Need a new generated Victorian speaker?
              </span>
              <button
                onClick={onCreateNewVoice}
                disabled={isCreatingVoice}
                className="text-[11px] text-red-400 hover:text-red-300 font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {isCreatingVoice ? "Prompting Voice API..." : "Create Fresh Dexter Speaker"}
              </button>
            </div>
          </div>

          {/* Section 2: Target Speaking Pace */}
          <div className="p-4 bg-[#0c0e14] border border-[#1f2433] rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Target Narration Pace
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {targetWpm} WPM
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Dexter’s hallmark is blisteringly fast, impatient Victorian articulation (approx. 2.0x conversational pace).
            </p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: "Deliberate", wpm: 260 },
                { label: "Standard (Locked)", wpm: 300 },
                { label: "Breakneck", wpm: 340 },
              ].map((preset) => (
                <button
                  key={preset.wpm}
                  onClick={() => onTargetWpmChange(preset.wpm)}
                  className={`p-2.5 rounded-xl text-xs font-mono transition border ${
                    targetWpm === preset.wpm
                      ? "bg-red-950/80 border-red-700 text-red-200 font-bold"
                      : "bg-[#141722] border-[#222838] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <div className="text-[10px] text-zinc-400">{preset.label}</div>
                  <div className="font-bold text-sm">{preset.wpm} WPM</div>
                </button>
              ))}
            </div>

            <div className="pt-2">
              <input
                type="range"
                min={220}
                max={380}
                step={10}
                value={targetWpm}
                onChange={(e) => onTargetWpmChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#1e2330] rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                <span>220 WPM (Slower)</span>
                <span>300 WPM (Ideal)</span>
                <span>380 WPM (Rapid)</span>
              </div>
            </div>
          </div>

          {/* Section 3: Audio Cleanup & Processing Controls */}
          <div className="p-4 bg-[#0c0e14] border border-[#1f2433] rounded-2xl space-y-3">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider block">
              Audio Pipeline Safeguards
            </span>

            <div className="space-y-3 pt-1">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-zinc-200">
                    Conservative Boundary Silence Trimming
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Trims digital silence while preserving 25ms padding to protect initial plosives and clipped endings.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={trimSilence}
                  onChange={(e) => onTrimSilenceChange(e.target.checked)}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-[#181d2a]">
                <div>
                  <div className="text-xs font-semibold text-zinc-200">
                    Studio Peak Normalization
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Normalizes master track to -0.8 dBFS without clipping or distortion.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={normalizePeak}
                  onChange={(e) => onNormalizePeakChange(e.target.checked)}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[#212636] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#1a1e2b] hover:bg-[#252b3d] text-zinc-200 border border-[#2d3448] transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
