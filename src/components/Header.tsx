import React, { useState } from "react";
import { Mic, Volume2, Settings, ShieldCheck, Loader2 } from "lucide-react";
import { VoiceRecord } from "../types";

interface HeaderProps {
  voice: VoiceRecord | null;
  onOpenSettings: () => void;
  onAudition: () => Promise<void>;
  isAuditioning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  voice,
  onOpenSettings,
  onAudition,
  isAuditioning,
}) => {
  return (
    <header className="border-b border-[#222633] bg-[#0f1117]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-700 to-red-950 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-950/40">
            <span className="font-serif-title font-black text-lg text-red-100 tracking-wider">
              D
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-serif-title">
                DEX<span className="text-red-500">//</span>VOICE
              </h1>
              <span className="px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider font-semibold rounded bg-red-950/70 border border-red-800/60 text-red-300">
                Locked 300 WPM
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              One script. One voice. One finished track.
            </p>
          </div>
        </div>

        {/* Voice Badge & Actions */}
        <div className="flex items-center flex-wrap gap-2.5 sm:self-center">
          {/* Locked Voice Badge */}
          <div className="flex items-center gap-2 bg-[#171a24] border border-[#2c3245] rounded-lg px-3 py-1.5 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  {voice?.display_name || "Dexter — Victorian Gentleman"}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  (en-GB)
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[170px]">
                {voice?.id ? voice.id : "Loading ID..."}
              </span>
            </div>
          </div>

          {/* Quick Audition Button */}
          <button
            onClick={onAudition}
            disabled={isAuditioning}
            title="Audition Dexter's voice (plays a short sample)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1f2c] hover:bg-[#252b3d] text-zinc-300 hover:text-white border border-[#30384d] transition disabled:opacity-50"
          >
            {isAuditioning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                <span>Auditioning...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-red-400" />
                <span>Audition</span>
              </>
            )}
          </button>

          {/* Advanced Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Configure speaking pace, voice ID and audio settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#171a24] hover:bg-[#222633] text-zinc-300 hover:text-white border border-[#2b3042] transition"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
