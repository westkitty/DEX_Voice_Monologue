import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  AlertCircle,
  CheckCircle2,
  Volume2,
  RotateCcw,
  Sliders,
  ChevronRight,
  Info,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { Header } from "./components/Header";
import { ScriptEditor } from "./components/ScriptEditor";
import { GenerationProgress } from "./components/GenerationProgress";
import { AudioPlayerSection } from "./components/AudioPlayerSection";
import { AdvancedSettingsModal } from "./components/AdvancedSettingsModal";
import { SAMPLE_MONOLOGUES } from "./sample-scripts";
import { VoiceRecord, ScriptAnalysis, JobState, QuotaStatus } from "./types";

export default function App() {
  const [script, setScript] = useState<string>(SAMPLE_MONOLOGUES[0].text);
  const [voice, setVoice] = useState<VoiceRecord | null>(null);
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [targetWpm, setTargetWpm] = useState<number>(300);
  const [trimSilence, setTrimSilence] = useState<boolean>(true);
  const [normalizePeak, setNormalizePeak] = useState<boolean>(true);

  // Job & Processing State
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);

  // Audition State
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCreatingVoice, setIsCreatingVoice] = useState<boolean>(false);

  // EventSource reference for SSE
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load Voice on Mount
  useEffect(() => {
    fetch("/api/voice/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.voice) {
          setVoice(data.voice);
        }
      })
      .catch((err) => {
        console.warn("Could not load initial voice status:", err);
      });

    fetch("/api/quota/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.quota) {
          setQuotaStatus(data.quota);
        }
      })
      .catch((err) => console.warn("Could not load quota status:", err));
  }, []);

  // Analyze script whenever script or targetWpm changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!script.trim()) {
        setAnalysis(null);
        return;
      }

      fetch("/api/script/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, targetWpm }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.analysis) {
            setAnalysis(data.analysis);
          }
        })
        .catch((err) => console.warn("Script analyze error:", err));
    }, 250);

    return () => clearTimeout(timer);
  }, [script, targetWpm]);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Voice Audition Handler
  const handleAudition = async (voiceIdToTest?: string) => {
    setIsAuditioning(true);
    setErrorBanner(null);

    try {
      const res = await fetch("/api/voice/audition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voiceIdToTest || voice?.id }),
      });

      const data = await res.json();
      if (!data.success || !data.audioBase64) {
        throw new Error(data.error || "Audition failed to return audio.");
      }

      const audioSrc = `data:audio/wav;base64,${data.audioBase64}`;
      if (auditionAudioRef.current) {
        auditionAudioRef.current.src = audioSrc;
        await auditionAudioRef.current.play();
      } else {
        const audio = new Audio(audioSrc);
        auditionAudioRef.current = audio;
        await audio.play();
      }
    } catch (err: any) {
      console.error("Audition failed:", err);
      setErrorBanner(`Audition error: ${err.message || String(err)}`);
    } finally {
      setIsAuditioning(false);
    }
  };

  // Custom Voice ID Update
  const handleSetVoiceId = async (newId: string) => {
    const res = await fetch("/api/voice/set-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: newId }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to update voice ID");
    }

    setVoice(data.voice);
  };

  // Create Fresh Voice
  const handleCreateNewVoice = async () => {
    setIsCreatingVoice(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/voice/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed creating fresh voice.");
      }
      setVoice(data.voice);
    } catch (err: any) {
      setErrorBanner(`Voice Creation error: ${err.message || String(err)}`);
    } finally {
      setIsCreatingVoice(false);
    }
  };

  // Start Generation: ONE CLICK INVARIANT
  const handleGenerate = async () => {
    if (!script.trim()) {
      setErrorBanner("Please paste or type a script before generating.");
      return;
    }

    setErrorBanner(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          targetWpm,
          voiceId: voice?.id,
          trimSilence,
          normalizePeak,
        }),
      });

      const data = await res.json();
      if (!data.success || !data.jobId) {
        throw new Error(data.error || "Failed to create synthesis job.");
      }

      setActiveJob(data.job);

      // Connect to SSE stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/jobs/${data.jobId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const updatedJob: JobState = JSON.parse(event.data);
          setActiveJob(updatedJob);

          if (
            updatedJob.status === "completed" ||
            updatedJob.status === "failed" ||
            updatedJob.status === "cancelled"
          ) {
            setIsGenerating(false);
            es.close();
          }
        } catch (e) {
          console.error("SSE parsing error:", e);
        }
      };

      es.onerror = () => {
        // SSE connection closed or interrupted; fallback to manual poll
        es.close();
        fetch(`/api/jobs/${data.jobId}/status`)
          .then((r) => r.json())
          .then((pollData) => {
            if (pollData.success && pollData.job) {
              setActiveJob(pollData.job);
              if (
                pollData.job.status === "completed" ||
                pollData.job.status === "failed" ||
                pollData.job.status === "cancelled"
              ) {
                setIsGenerating(false);
              }
            }
          })
          .catch(() => setIsGenerating(false));
      };
    } catch (err: any) {
      console.error("Generate error:", err);
      setIsGenerating(false);
      setErrorBanner(err.message || "Failed to start generation.");
    }
  };

  // Cancel in-flight job
  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await fetch(`/api/jobs/${activeJob.id}/cancel`, { method: "POST" });
      setIsGenerating(false);
      if (eventSourceRef.current) eventSourceRef.current.close();
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  // Retry failed chunks
  const handleRetryJob = async () => {
    if (!activeJob) return;
    setIsGenerating(true);
    setErrorBanner(null);

    try {
      await fetch(`/api/jobs/${activeJob.id}/retry`, { method: "POST" });

      // Reconnect SSE
      if (eventSourceRef.current) eventSourceRef.current.close();
      const es = new EventSource(`/api/jobs/${activeJob.id}/events`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const updatedJob: JobState = JSON.parse(event.data);
        setActiveJob(updatedJob);
        if (
          updatedJob.status === "completed" ||
          updatedJob.status === "failed" ||
          updatedJob.status === "cancelled"
        ) {
          setIsGenerating(false);
          es.close();
        }
      };
    } catch (err: any) {
      setIsGenerating(false);
      setErrorBanner(`Retry failed: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#090b10] text-[#f1f3f7] flex flex-col font-sans selection:bg-red-900/60 selection:text-white">
      {/* Header */}
      <Header
        voice={voice}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onAudition={() => handleAudition()}
        isAuditioning={isAuditioning}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Error Notification Banner */}
        {errorBanner && (
          <div className="p-4 bg-red-950/60 border border-red-700/80 rounded-2xl text-xs sm:text-sm text-red-200 flex items-start gap-3 shadow-xl">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold text-white">System Notice: </span>
              {errorBanner}
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-red-400 hover:text-white text-xs font-semibold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Free Tier Quota Advisory Banner */}
        {quotaStatus?.exhausted && (
          <div className="p-4 bg-amber-950/30 border border-amber-700/60 rounded-2xl text-xs sm:text-sm text-amber-200 flex items-start gap-3 shadow-lg">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-bold text-amber-100 flex items-center gap-2">
                <span>Free Tier TTS Daily Quota Active</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-900/60 text-amber-300 border border-amber-700/50">
                  10 requests/day limit
                </span>
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed">
                Google AI Studio has reached the daily limit of 10 speech generation requests for this project. The quota refreshes automatically in approximately{" "}
                <strong className="text-amber-200">{Math.ceil((quotaStatus.resetsInSeconds || 82800) / 3600)} hours</strong>.
              </p>
              <div className="text-[11px] text-zinc-400 font-mono pt-1">
                Your script, settings, and locked voice persona (<span className="text-zinc-300">{voice?.id || "Dexter"}</span>) are safely preserved.
              </div>
            </div>
          </div>
        )}

        {/* Script Input Editor Component */}
        <section>
          <ScriptEditor
            script={script}
            onChange={setScript}
            analysis={analysis}
            targetWpm={targetWpm}
            disabled={isGenerating}
          />
        </section>

        {/* Primary Action Button Bar */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#12151e] border border-[#242938] rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-500/80" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Single Invariant Generation
              </div>
              <div className="text-xs text-zinc-500">
                Full script synthesized in one locked British male voice & stitched to one master file.
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !script.trim()}
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-red-700 via-red-600 to-red-800 hover:from-red-600 hover:to-red-700 active:scale-[0.98] text-white shadow-xl shadow-red-950/70 border border-red-500/40 transition flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Synthesizing Master Track...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>GENERATE COMPLETE TRACK</span>
              </>
            )}
          </button>
        </section>

        {/* Active Generation Progress Section */}
        {activeJob && (isGenerating || activeJob.status === "failed" || activeJob.status === "cancelled" || activeJob.status === "stitching") && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-300">
            <GenerationProgress
              job={activeJob}
              onCancel={handleCancelJob}
              onRetry={handleRetryJob}
            />
          </section>
        )}

        {/* Finished Audio Player & Download Section (Only when complete track exists) */}
        {activeJob && activeJob.status === "completed" && (
          <section className="animate-in fade-in slide-in-from-top-6 duration-400">
            <AudioPlayerSection job={activeJob} />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e2230] py-6 text-center text-xs text-zinc-500 font-mono">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>DEX//VOICE • Gemini 3.8 Flash TTS Interactions Architecture</span>
          <span className="text-zinc-600">24 kHz Mono Master • Zero Gap Drift</span>
        </div>
      </footer>

      {/* Advanced Settings Modal */}
      <AdvancedSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        voice={voice}
        onSetVoiceId={handleSetVoiceId}
        onAudition={handleAudition}
        isAuditioning={isAuditioning}
        targetWpm={targetWpm}
        onTargetWpmChange={setTargetWpm}
        trimSilence={trimSilence}
        onTrimSilenceChange={setTrimSilence}
        normalizePeak={normalizePeak}
        onNormalizePeakChange={setNormalizePeak}
        onCreateNewVoice={handleCreateNewVoice}
        isCreatingVoice={isCreatingVoice}
      />
    </div>
  );
}
