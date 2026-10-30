import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  FolderOpen,
  RotateCcw,
  FastForward,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Music,
  Disc,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  DownloadRecord,
  openMediaFileFolder,
  playMediaExternally,
} from "../lib/ipc";
import { translate } from "../lib/i18n";
import { useAppStore } from "../lib/store";

interface CinemaPlayerModalProps {
  record: DownloadRecord;
  onClose: () => void;
}

export default function CinemaPlayerModal({
  record,
  onClose,
}: CinemaPlayerModalProps) {
  const { language } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAudioFile =
    record.format.toLowerCase() === "m4a" ||
    record.format.toLowerCase() === "mp3" ||
    record.format.toLowerCase() === "opus" ||
    record.format.toLowerCase() === "aac" ||
    record.format.toLowerCase() === "flac" ||
    record.resolution.toLowerCase() === "audio";

  const getActiveElement = useCallback(() => {
    return isAudioFile ? audioRef.current : videoRef.current;
  }, [isAudioFile]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(record.duration_seconds || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  const mediaSrc = convertFileSrc(record.file_path);

  const togglePlay = useCallback(() => {
    const el = getActiveElement();
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Playback start failed:", err);
          setIsPlaying(false);
        });
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [getActiveElement]);

  const seekRelative = useCallback(
    (seconds: number) => {
      const el = getActiveElement();
      if (!el) return;
      const targetTime = el.currentTime + seconds;
      const totalDur = el.duration || duration || 0;
      const next = Math.max(0, Math.min(totalDur, targetTime));
      el.currentTime = next;
      setCurrentTime(next);
    },
    [duration, getActiveElement],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        seekRelative(-5);
      } else if (e.key === "ArrowRight") {
        seekRelative(5);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, seekRelative, togglePlay]);

  const handleTimeUpdate = () => {
    const el = getActiveElement();
    if (el) {
      setCurrentTime(el.currentTime);
      if (el.duration && !isNaN(el.duration)) {
        setDuration(el.duration);
      }
    }
  };

  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    const el = getActiveElement();
    if (el) {
      el.currentTime = time;
    }
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    const el = getActiveElement();
    if (el) {
      el.volume = val;
      el.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const el = getActiveElement();
    if (!el) return;
    const next = !isMuted;
    setIsMuted(next);
    el.muted = next;
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    const el = getActiveElement();
    if (el) {
      el.playbackRate = rate;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleOpenFolder = async () => {
    try {
      await openMediaFileFolder(record.file_path);
    } catch (err) {
      console.error("Open folder failed:", err);
    }
  };

  const handlePlayExternal = async () => {
    try {
      await playMediaExternally(record.file_path);
    } catch (err) {
      console.error("External play failed, falling back to folder:", err);
      await handleOpenFolder();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        ref={containerRef}
        className="relative flex flex-col w-full max-w-5xl rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden text-white"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-900/90 border-b border-zinc-800/80 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3 overflow-hidden pr-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
              {isAudioFile ? (
                <Music className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </div>
            <div className="overflow-hidden">
              <h2
                className="text-sm font-bold text-zinc-100 truncate"
                title={record.title}
              >
                {record.title}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 font-mono">
                <span className="font-semibold text-primary">
                  {record.format.toUpperCase()}
                </span>
                <span>•</span>
                <span>{record.file_size_formatted}</span>
                <span>•</span>
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <ShieldCheck className="h-3 w-3" />
                  {record.security_verdict}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Direct External Player button */}
            <button
              onClick={handlePlayExternal}
              className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 hover:text-white transition-all active:scale-95"
              title="Play in Windows Media Player or VLC"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">External Player</span>
            </button>

            {/* Open Folder button */}
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
              title={translate("downloader.openFolder", language)}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {translate("downloader.openFolder", language)}
              </span>
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all active:scale-95"
              title="Close Player (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Media Stage Area */}
        <div className="relative flex items-center justify-center bg-black min-h-[380px] max-h-[65vh] w-full overflow-hidden select-none">
          {videoError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                <AlertCircle className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-200">
                  In-App Webview Video Codec Limitation
                </h3>
                <p className="text-xs text-zinc-400 max-w-md">
                  This media container requires external decoding on this
                  system. The file is fully intact and verified safe on your
                  disk.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handlePlayExternal}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-primary/90 transition-all active:scale-95"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Play in Windows Media Player</span>
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Open Folder</span>
                </button>
              </div>
            </div>
          ) : isAudioFile ? (
            /* Dedicated Audio Player Stage */
            <div
              className="relative flex flex-col items-center justify-center w-full h-[380px] p-8 bg-gradient-to-b from-zinc-900 to-black cursor-pointer"
              onClick={togglePlay}
            >
              <audio
                ref={audioRef}
                src={mediaSrc}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  setVideoError("Audio format playback error");
                }}
              />

              {/* Vinyl Disc Container */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`relative flex h-48 w-48 items-center justify-center rounded-full bg-zinc-950 border-4 border-zinc-800 shadow-2xl transition-transform duration-700 ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "6s" }}
                >
                  {/* Vinyl Grooves */}
                  <div className="absolute inset-2 rounded-full border border-zinc-800/80" />
                  <div className="absolute inset-5 rounded-full border border-zinc-800/60" />
                  <div className="absolute inset-8 rounded-full border border-zinc-800/40" />

                  {/* Center Label / Thumbnail */}
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 border-2 border-primary/50 overflow-hidden shadow-inner">
                    {record.thumbnail_url ? (
                      <img
                        src={record.thumbnail_url}
                        alt={record.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Disc className="h-10 w-10 text-primary" />
                    )}
                    <div className="absolute h-4 w-4 rounded-full bg-zinc-950 border border-zinc-700" />
                  </div>
                </div>

                {/* Floating Play/Pause Indicator */}
                {!isPlaying && (
                  <div className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-primary/95 text-white shadow-2xl">
                    <Play className="h-6 w-6 translate-x-0.5 fill-current" />
                  </div>
                )}
              </div>

              {/* Track Title and Wave Equalizer */}
              <div className="mt-6 flex flex-col items-center gap-2 text-center pointer-events-none">
                <span className="text-xs font-bold text-zinc-200 max-w-md truncate">
                  {record.title}
                </span>

                {/* Animated Equalizer Bars */}
                <div className="flex items-center gap-1 h-5">
                  {[40, 75, 55, 90, 60, 85, 45, 100, 70, 50, 80, 65].map(
                    (height, idx) => (
                      <div
                        key={idx}
                        className="w-1 rounded-full bg-primary transition-all duration-200"
                        style={{
                          height: isPlaying ? `${height}%` : "20%",
                          opacity: isPlaying ? 0.9 : 0.4,
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Standard Cinema Video Stage */
            <>
              <video
                ref={videoRef}
                src={mediaSrc}
                className="h-full w-full object-contain max-h-[65vh] cursor-pointer"
                onClick={togglePlay}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  setVideoError("Format playback failed inside webview");
                }}
                playsInline
              />

              {/* Watermark Play Button when video is paused */}
              {!isPlaying && !videoError && (
                <button
                  onClick={togglePlay}
                  className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
                >
                  <Play className="h-8 w-8 translate-x-0.5 fill-current" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Bottom Control Bar */}
        {!videoError && (
          <div
            className={`flex flex-col gap-2 p-4 bg-zinc-900/95 border-t border-zinc-800/80 transition-opacity duration-200 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Scrubber Timeline */}
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs font-mono text-zinc-400 w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                className="flex-1 h-1.5 rounded-lg appearance-none bg-zinc-700 accent-primary cursor-pointer transition-all hover:h-2"
              />
              <span className="text-xs font-mono text-zinc-400 w-12">
                {formatTime(duration)}
              </span>
            </div>

            {/* Actions Row */}
            <div className="flex items-center justify-between pt-1">
              {/* Playback Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
                  title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current translate-x-0.5" />
                  )}
                </button>

                <button
                  onClick={() => seekRelative(-10)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Rewind 10s"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => seekRelative(10)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Forward 10s"
                >
                  <FastForward className="h-4 w-4" />
                </button>

                {/* Volume Control */}
                <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                  <button
                    onClick={toggleMute}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-4 w-4 text-red-400" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1.5 rounded-lg appearance-none bg-zinc-700 accent-primary cursor-pointer"
                  />
                </div>
              </div>

              {/* Speed & View Options */}
              <div className="flex items-center gap-2">
                {/* Speed buttons */}
                <div className="flex items-center gap-1 rounded-xl bg-zinc-800/80 p-1 border border-zinc-700/60">
                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-lg transition-all ${
                        playbackRate === rate
                          ? "bg-primary text-white shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Fullscreen (only for video or full container) */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
