import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  RotateCcw,
  Sparkles,
  Radio,
  FileAudio,
  CheckCircle2,
  Gauge,
  Clock,
  HardDrive,
} from "lucide-react";
import { JobState } from "../types";

interface AudioPlayerSectionProps {
  job: JobState;
  onRegenerateNew?: () => void;
}

export const AudioPlayerSection: React.FC<AudioPlayerSectionProps> = ({
  job,
  onRegenerateNew,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(job.result?.durationSec || 0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  const wavDownloadUrl = `/api/jobs/${job.id}/audio/wav`;
  const mp3DownloadUrl = `/api/jobs/${job.id}/audio/mp3`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn("Playback error:", e));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const changeRate = (rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = parseFloat(e.target.value);
    audio.volume = v;
    setVolume(v);
    if (v === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    return Math.round(bytes / 1024) + " KB";
  };

  return (
    <div className="bg-[#12151e] border-2 border-red-900/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Decorative Aura */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hidden native audio element pointing to the finished master WAV */}
      <audio ref={audioRef} src={wavDownloadUrl} preload="auto" />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#242938]">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-950 border border-red-500/40 flex items-center justify-center shadow-lg shadow-red-950/60 text-white">
            <Radio className="w-6 h-6 text-red-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black font-serif-title tracking-tight text-white">
                Master Monologue Track
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-[11px] font-mono font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Stitched Continuous
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              One unbroken voice track • No gap clicks • Pitch-stabilized
            </p>
          </div>
        </div>

        {/* Downloads */}
        <div className="flex items-center flex-wrap gap-2.5 self-stretch sm:self-auto">
          {/* Primary WAV Download */}
          <a
            href={wavDownloadUrl}
            download="dexter_monologue.wav"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white shadow-lg shadow-red-950/60 border border-red-500/40 transition active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Download Master (.WAV)</span>
          </a>

          {/* Secondary MP3 Download */}
          {job.result?.hasMp3 && (
            <a
              href={mp3DownloadUrl}
              download="dexter_monologue.mp3"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-[#191d29] hover:bg-[#252b3d] text-zinc-200 hover:text-white border border-[#30384d] transition active:scale-95"
            >
              <FileAudio className="w-4 h-4 text-red-400" />
              <span>Download MP3</span>
            </a>
          )}
        </div>
      </div>

      {/* Audio Player Controls */}
      <div className="mt-6 bg-[#0c0e14] border border-[#222736] rounded-2xl p-5 shadow-inner">
        {/* Animated Waveform Visualizer Bars */}
        <div className="flex items-end justify-between gap-1 h-12 mb-4 px-2 overflow-hidden">
          {Array.from({ length: 48 }).map((_, idx) => {
            const height = isPlaying
              ? Math.sin(idx * 0.4 + currentTime * 5) * 40 +
                Math.cos(idx * 0.8 + currentTime * 3) * 30 +
                25
              : 12 + Math.sin(idx * 0.5) * 8;
            return (
              <div
                key={idx}
                className="w-full rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(6, Math.min(100, height))}%`,
                  backgroundColor: isPlaying
                    ? idx % 3 === 0
                      ? "#dc2626"
                      : idx % 2 === 0
                      ? "#ef4444"
                      : "#991b1b"
                    : "#2a3042",
                }}
              />
            );
          })}
        </div>

        {/* Scrubber Slider */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-[#1b1f2b] rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
          />
          <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Transport Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-3 border-t border-[#1b1f2b]">
          {/* Play/Pause Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-950/60 active:scale-95 transition"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Restart Button */}
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  setCurrentTime(0);
                }
              }}
              title="Restart from beginning"
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-zinc-500" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1.5 bg-[#1f2433] rounded-lg appearance-none cursor-pointer accent-red-500 hidden sm:inline"
              />
            </div>
          </div>

          {/* Speed Preset Selector */}
          <div className="flex items-center gap-1.5 bg-[#141722] p-1 rounded-xl border border-[#222736]">
            <span className="text-[10px] uppercase font-mono text-zinc-500 px-1.5">
              Player Speed:
            </span>
            {[0.8, 1.0, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                onClick={() => changeRate(rate)}
                className={`px-2 py-1 text-xs font-mono rounded-lg transition ${
                  playbackRate === rate
                    ? "bg-red-950/80 text-red-200 border border-red-800/60 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Finished Track Performance Metrics */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1f2433]">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase font-semibold">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Master Duration</span>
          </div>
          <div className="mt-1 text-base font-bold font-mono text-zinc-100">
            {job.result?.durationSec ? `${job.result.durationSec}s` : `${formatTime(duration)}`}
          </div>
        </div>

        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1f2433]">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase font-semibold">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span>Narration Pace</span>
          </div>
          <div className="mt-1 text-base font-bold font-mono text-amber-300">
            ~{job.result?.achievedWpm || 300} WPM
          </div>
        </div>

        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1f2433]">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-red-400" />
            <span>Tempo Control</span>
          </div>
          <div className="mt-1 text-xs font-bold font-mono text-zinc-200">
            {job.result?.tempoAdjusted
              ? `${job.result.tempoFactor.toFixed(2)}x (Pitch Preserved)`
              : "Raw 1.0x (Pace Met)"}
          </div>
        </div>

        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1f2433]">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] uppercase font-semibold">
            <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
            <span>Studio Master Size</span>
          </div>
          <div className="mt-1 text-base font-bold font-mono text-zinc-100">
            {formatBytes(job.result?.wavSizeBytes)}
          </div>
        </div>
      </div>
    </div>
  );
};
