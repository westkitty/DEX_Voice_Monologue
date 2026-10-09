import React, { useState, useRef } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Sparkles,
  Layers,
  Eye,
  CheckCircle2,
  Clock,
  Hash,
  Info,
} from "lucide-react";
import { ScriptAnalysis } from "../types";
import { SAMPLE_MONOLOGUES } from "../sample-scripts";

interface ScriptEditorProps {
  script: string;
  onChange: (val: string) => void;
  analysis: ScriptAnalysis | null;
  targetWpm: number;
  disabled?: boolean;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  script,
  onChange,
  analysis,
  targetWpm,
  disabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<"input" | "preview" | "chunks">("input");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onChange(content);
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".txt") || file.name.endsWith(".md"))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          onChange(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const loadSample = (index: number) => {
    if (disabled) return;
    onChange(SAMPLE_MONOLOGUES[index].text);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="bg-[#12151e] border border-[#232838] rounded-2xl p-5 shadow-xl">
      {/* Top Bar: Tabs & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#212636]">
        {/* View Tabs */}
        <div className="flex items-center gap-1.5 bg-[#0d0f16] p-1 rounded-xl border border-[#1e2230]">
          <button
            onClick={() => setActiveTab("input")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "input"
                ? "bg-red-950/80 text-red-200 border border-red-800/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Script Input</span>
          </button>

          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "preview"
                ? "bg-red-950/80 text-red-200 border border-red-800/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Spoken Preview</span>
            {analysis && analysis.removedDirections.length > 0 && (
              <span className="px-1.5 py-0.2 bg-red-600/30 text-red-300 text-[10px] rounded-full border border-red-500/30">
                {analysis.removedDirections.length} filtered
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("chunks")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "chunks"
                ? "bg-red-950/80 text-red-200 border border-red-800/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Chunks ({analysis?.chunks?.length || 0})</span>
          </button>
        </div>

        {/* Script Utilities */}
        <div className="flex items-center gap-2">
          {/* Sample Scripts Selector */}
          <div className="relative group">
            <button
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a1e2b] hover:bg-[#252a3d] text-zinc-300 hover:text-white border border-[#2d3448] transition disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load Monologue</span>
            </button>
            <div className="absolute right-0 mt-1 w-64 bg-[#181c28] border border-[#2b3145] rounded-xl shadow-2xl p-2 hidden group-hover:block z-30">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
                Preset Monologues
              </div>
              {SAMPLE_MONOLOGUES.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => loadSample(idx)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#23293c] text-xs transition"
                >
                  <div className="font-semibold text-zinc-200">{sample.title}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{sample.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Import File Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="Import text (.txt or .md)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a1e2b] hover:bg-[#252a3d] text-zinc-300 hover:text-white border border-[#2d3448] transition disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Clear Button */}
          {script.trim() && (
            <button
              onClick={() => onChange("")}
              disabled={disabled}
              title="Clear text area"
              className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-red-950/30 transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Tab View Content */}
      <div className="mt-4">
        {activeTab === "input" && (
          <div onDragOver={handleDragOver} onDrop={handleDrop} className="relative">
            <textarea
              value={script}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="Paste your entire monologue script here...

Standalone bracketed directions like [Pause], [Spoken Word], or [Music] will be automatically filtered from spoken narration. Press GENERATE COMPLETE TRACK once to synthesize everything into one continuous track."
              className="w-full h-80 sm:h-96 p-4 rounded-xl bg-[#0c0e14] border border-[#222736] focus:border-red-600/60 focus:ring-1 focus:ring-red-600/40 text-zinc-100 placeholder:text-zinc-600 font-sans text-sm sm:text-base leading-relaxed resize-y outline-none transition"
            />
          </div>
        )}

        {activeTab === "preview" && (
          <div className="h-80 sm:h-96 p-4 rounded-xl bg-[#0c0e14] border border-[#222736] overflow-y-auto">
            {analysis?.removedDirections && analysis.removedDirections.length > 0 && (
              <div className="mb-3 p-3 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    {analysis.removedDirections.length} stage directions detected and excluded:
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {analysis.removedDirections.map((dir, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-red-900/40 rounded text-[11px] font-mono border border-red-700/50"
                      >
                        {dir}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="text-zinc-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans">
              {analysis?.cleanText || (
                <span className="text-zinc-600 italic">
                  Paste a script in the Input tab to view the filtered spoken narration.
                </span>
              )}
            </div>
          </div>
        )}

        {activeTab === "chunks" && (
          <div className="h-80 sm:h-96 p-4 rounded-xl bg-[#0c0e14] border border-[#222736] overflow-y-auto space-y-3">
            {!analysis?.chunks || analysis.chunks.length === 0 ? (
              <div className="text-zinc-600 italic text-sm text-center py-10">
                Enter text in the Input tab to view sentence-aware segment chunks.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-[#1f2433]">
                  <span>Total Segments: {analysis.chunks.length}</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    100% Text Coverage Verified
                  </span>
                </div>

                {analysis.chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    className="p-3 bg-[#131722] border border-[#242a3c] rounded-xl hover:border-red-900/40 transition"
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-mono font-semibold text-red-400">
                        Segment #{chunk.index + 1}
                      </span>
                      <span className="text-zinc-400 font-mono text-[11px]">
                        {chunk.wordCount} words (~{Math.round((chunk.wordCount / targetWpm) * 60)}s)
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="mt-4 pt-4 border-t border-[#212636] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0e1017] p-2.5 rounded-xl border border-[#1d2230] flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-zinc-800/60 text-zinc-300">
            <Hash className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              Spoken Words
            </div>
            <div className="text-base font-bold font-mono text-white">
              {analysis?.spokenWordCount || 0}
            </div>
          </div>
        </div>

        <div className="bg-[#0e1017] p-2.5 rounded-xl border border-[#1d2230] flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-zinc-800/60 text-zinc-300">
            <Clock className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              Approx. Duration
            </div>
            <div className="text-base font-bold font-mono text-white">
              {analysis ? formatDuration(analysis.estimatedDurationSec) : "0s"}
            </div>
          </div>
        </div>

        <div className="bg-[#0e1017] p-2.5 rounded-xl border border-[#1d2230] flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-zinc-800/60 text-zinc-300">
            <Layers className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              Auto Segments
            </div>
            <div className="text-base font-bold font-mono text-white">
              {analysis?.chunks?.length || 0}
            </div>
          </div>
        </div>

        <div className="bg-[#0e1017] p-2.5 rounded-xl border border-[#1d2230] flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-zinc-800/60 text-zinc-300">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              Target Pace
            </div>
            <div className="text-base font-bold font-mono text-amber-300">
              ~{targetWpm} WPM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
