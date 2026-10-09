import React, { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  XCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { JobState } from "../types";

interface GenerationProgressProps {
  job: JobState;
  onCancel: () => void;
  onRetry: () => void;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  job,
  onCancel,
  onRetry,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - job.createdAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [job.status, job.createdAt]);

  const completedCount = job.chunks.filter((c) => c.status === "completed").length;
  const failedCount = job.chunks.filter((c) => c.status === "failed").length;

  return (
    <div className="bg-[#12151e] border border-[#2b3042] rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      {/* Ambient background glow while generating */}
      {job.status === "synthesizing" || job.status === "stitching" ? (
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      ) : null}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#212636]">
        <div className="flex items-center gap-3">
          {job.status === "completed" ? (
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : job.status === "failed" ? (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-600/40 text-red-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          ) : job.status === "cancelled" ? (
            <div className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400">
              <XCircle className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-700/50 text-red-400 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif-title font-bold text-lg text-white">
                {job.status === "completed"
                  ? "Narration Assembled"
                  : job.status === "stitching"
                  ? "Stitching Continuous Master Track"
                  : job.status === "failed"
                  ? "Synthesis Incomplete"
                  : job.status === "cancelled"
                  ? "Synthesis Cancelled"
                  : "Synthesizing Dexter Monologue"}
              </h3>
              <span className="text-xs font-mono text-zinc-500">
                ({completedCount}/{job.chunks.length} segments)
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {job.statusMessage || "Processing narration..."}
            </p>
          </div>
        </div>

        {/* Action Controls & Timer */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0e1017] border border-[#222736] text-xs font-mono text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span>{elapsed}s elapsed</span>
          </div>

          {(job.status === "synthesizing" || job.status === "stitching" || job.status === "pending") && (
            <button
              onClick={onCancel}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition"
            >
              Abort Job
            </button>
          )}

          {job.status === "failed" && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-red-800 hover:bg-red-700 text-white shadow-md shadow-red-950 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Failed Segments</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-5">
        <div className="flex justify-between items-center text-xs font-mono mb-1.5">
          <span className="text-zinc-400">Pipeline Execution</span>
          <span className="text-red-400 font-bold">{job.progressPercent}%</span>
        </div>
        <div className="h-2.5 w-full bg-[#0d0e14] rounded-full overflow-hidden border border-[#232838] p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              job.status === "completed"
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                : job.status === "failed"
                ? "bg-red-600"
                : "bg-gradient-to-r from-red-700 via-red-500 to-amber-500"
            }`}
            style={{ width: `${Math.max(4, job.progressPercent)}%` }}
          />
        </div>
      </div>

      {/* Segments Live Checklist */}
      <div className="mt-5 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between pb-1">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            Segment Chronology
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            Ordered numeric indices
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
          {job.chunks.map((chunk) => (
            <div
              key={chunk.index}
              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition ${
                chunk.status === "completed"
                  ? "bg-[#11161d] border-emerald-950/80 text-zinc-300"
                  : chunk.status === "synthesizing"
                  ? "bg-red-950/30 border-red-800/60 text-red-200 animate-pulse"
                  : chunk.status === "failed"
                  ? "bg-red-950/40 border-red-700 text-red-300"
                  : "bg-[#0d0f16] border-[#1f2433] text-zinc-500"
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                {chunk.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : chunk.status === "synthesizing" ? (
                  <Loader2 className="w-4 h-4 text-red-400 animate-spin shrink-0" />
                ) : chunk.status === "failed" ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-zinc-700 shrink-0 flex items-center justify-center text-[9px] font-mono">
                    {chunk.index + 1}
                  </div>
                )}
                <div className="truncate">
                  <span className="font-mono font-semibold mr-1.5">
                    Seg #{chunk.index + 1}:
                  </span>
                  <span className="italic truncate">{chunk.text}</span>
                </div>
              </div>

              <div className="shrink-0 font-mono text-[11px] text-zinc-400">
                {chunk.status === "completed"
                  ? "Done"
                  : chunk.status === "synthesizing"
                  ? "Synthesizing"
                  : chunk.status === "failed"
                  ? "Failed"
                  : "Pending"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Banner if failed */}
      {job.error && (
        <div className="mt-4 p-4 bg-red-950/50 border border-red-800/80 rounded-2xl text-xs text-red-200 flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="font-bold text-red-100 text-sm">
              {job.error.includes("quota") || job.error.includes("429")
                ? "API Quota Limit Encountered (Free Tier)"
                : "Synthesis Warning:"}
            </div>
            <div className="text-zinc-300 leading-relaxed">{job.error}</div>
            {(job.error.includes("quota") || job.error.includes("429")) ? (
              <div className="mt-2 p-2.5 bg-black/40 border border-red-900/60 rounded-xl text-[11px] text-zinc-300 space-y-1">
                <div className="font-semibold text-amber-300">How to increase quota:</div>
                <div>
                  Google AI Studio Free Tier keys are subject to a strict 10 requests/day quota for Gemini 3.8 speech models.
                  To synthesize lengthy scripts and multi-segment monologues, select or add a billing-enabled API key in AI Studio under{" "}
                  <strong className="text-white font-mono">Settings &gt; Secrets &gt; GEMINI_API_KEY</strong>.
                </div>
              </div>
            ) : null}
            <div className="text-[11px] text-red-400 font-mono pt-1">
              Your input script has been preserved. You can click &quot;Retry Failed Segments&quot; without re-entering text.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
