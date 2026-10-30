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
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { DownloadRecord, openMediaFileFolder } from "../lib/ipc";
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
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(record.duration_seconds || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  const videoSrc = convertFileSrc(record.file_path);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Autoplay failed:", err);
          setIsPlaying(false);
        });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekRelative = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const next = Math.max(
        0,
        Math.min(
          videoRef.current.duration || duration,
          videoRef.current.currentTime + seconds,
        ),
      );
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    },
    [duration],
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
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
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
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-zinc-100 truncate" title={record.title}>
                {record.title}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 font-mono">
                <span>{record.format.toUpperCase()}</span>
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
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
              title={translate("downloader.openFolder", language)}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{translate("downloader.openFolder", language)}</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all active:scale-95"
              title="Close Player (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Video Stage Area */}
        <div className="relative flex items-center justify-center bg-black min-h-[360px] max-h-[65vh] w-full overflow-hidden select-none">
          {videoError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-amber-500" />
              <h3 className="text-sm font-bold text-zinc-200">
                In-App Webview Video Codec Limitation
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                The video codec or audio container for this file requires external hardware decoding.
                The file is fully downloaded and safe on your disk.
              </p>
              <button
                onClick={handleOpenFolder}
                className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition-all active:scale-95"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open in Windows Media Player</span>
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                className="h-full w-full object-contain max-h-[65vh] cursor-pointer"
                onClick={togglePlay}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  setVideoError("Format playback failed inside webview");
                }}
                playsInline
              />

              {/* Central Play/Pause Watermark Button when paused */}
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

                {/* Fullscreen */}
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
