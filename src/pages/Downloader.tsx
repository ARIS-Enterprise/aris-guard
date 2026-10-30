import { useState, useEffect } from "react";
import {
  Download,
  Link as LinkIcon,
  Play,
  Trash2,
  FolderOpen,
  Loader2,
  CheckCircle2,
  FileVideo,
  ClipboardPaste,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  X,
  Radio,
  ExternalLink,
  Music,
  Film,
  VolumeX,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  probeMediaUrl,
  startMediaDownload,
  cancelMediaDownload,
  listDownloadsLibrary,
  deleteDownloadRecord,
  openMediaFileFolder,
  playMediaExternally,
  checkDownloaderEngineStatus,
  MediaMetadataResponse,
  MediaFormatOption,
  DownloadProgressPayload,
  DownloadRecord,
  EngineStatus,
} from "../lib/ipc";
import { translate } from "../lib/i18n";
import { useAppStore } from "../lib/store";
import CinemaPlayerModal from "../components/CinemaPlayerModal";

export default function Downloader() {
  const { language } = useAppStore();

  const [inputUrl, setInputUrl] = useState("");
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<MediaMetadataResponse | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormatOption | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [activeDownload, setActiveDownload] = useState<DownloadProgressPayload | null>(null);
  const [activeDownloadTitle, setActiveDownloadTitle] = useState("");
  const [library, setLibrary] = useState<DownloadRecord[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const [activePlayingRecord, setActivePlayingRecord] = useState<DownloadRecord | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  // Load initial engine status and library
  useEffect(() => {
    checkDownloaderEngineStatus()
      .then((st) => setEngineStatus(st))
      .catch((err) => console.error("Engine check failed:", err));

    loadLibrary();

    // Listen for progress events from backend
    const unlistenProgress = listen<DownloadProgressPayload>(
      "downloader://progress",
      (event) => {
        setActiveDownload(event.payload);
      },
    );

    // Listen for completed events
    const unlistenCompleted = listen<DownloadRecord>(
      "downloader://completed",
      (event) => {
        setActiveDownload(null);
        setActiveDownloadTitle("");
        loadLibrary();
        setStatusBanner({
          text: `Download completed: "${event.payload.title}" is ready and verified safe.`,
          isError: false,
        });
        setTimeout(() => setStatusBanner(null), 5000);
      },
    );

    // Listen for error events
    const unlistenError = listen<{ id: string; error: string }>(
      "downloader://error",
      (event) => {
        setActiveDownload(null);
        setActiveDownloadTitle("");
        setStatusBanner({
          text: `Download failed: ${event.payload.error}`,
          isError: true,
        });
        setTimeout(() => setStatusBanner(null), 6000);
      },
    );

    return () => {
      unlistenProgress.then((f) => f());
      unlistenCompleted.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, []);

  const loadLibrary = async () => {
    try {
      setIsLoadingLibrary(true);
      const items = await listDownloadsLibrary();
      setLibrary(items);
      setIsLoadingLibrary(false);
    } catch (err) {
      console.error("Failed to load downloads library:", err);
      setIsLoadingLibrary(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith("http")) {
        setInputUrl(text.trim());
        handleProbe(text.trim());
      } else if (text) {
        setInputUrl(text.trim());
      }
    } catch (err) {
      console.error("Clipboard read failed:", err);
    }
  };

  const handleProbe = async (urlToProbe?: string) => {
    const targetUrl = (urlToProbe || inputUrl).trim();
    if (!targetUrl) return;

    try {
      setIsProbing(true);
      setProbeError(null);
      setProbeResult(null);

      const metadata = await probeMediaUrl(targetUrl);
      setProbeResult(metadata);
      if (metadata.formats.length > 0) {
        setSelectedFormat(metadata.formats[0]);
      }
      setIsProbing(false);
    } catch (err) {
      console.error("Probe failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setProbeError(msg);
      setIsProbing(false);
    }
  };

  const handleStartDownload = async () => {
    if (!probeResult) return;

    try {
      const downloadId = "dl-" + Date.now();
      setActiveDownloadTitle(probeResult.title);
      setActiveDownload({
        id: downloadId,
        progress_percent: 0,
        speed_str: "Starting...",
        eta_str: "--:--",
        downloaded_bytes: 0,
        total_bytes: 0,
        downloaded_formatted: "0 B",
        total_formatted: "Estimating...",
        status: "starting",
      });

      setStatusBanner({
        text: `Starting download: ${probeResult.title}`,
        isError: false,
      });

      // Clear probe card to focus on download progress
      const currentProbe = probeResult;
      const formatId = selectedFormat?.format_id;
      setProbeResult(null);

      startMediaDownload({
        download_id: downloadId,
        url: currentProbe.url,
        title: currentProbe.title,
        thumbnail_url: currentProbe.thumbnail_url,
        duration_seconds: currentProbe.duration_seconds,
        format_id: formatId,
      }).catch((err) => {
        console.error("Download execution error:", err);
        setActiveDownload(null);
        setActiveDownloadTitle("");
        setStatusBanner({
          text: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        });
      });
    } catch (err) {
      console.error("Failed to start download:", err);
      setActiveDownload(null);
    }
  };

  const handleCancelDownload = async () => {
    if (!activeDownload) return;
    try {
      await cancelMediaDownload(activeDownload.id);
      setActiveDownload(null);
      setActiveDownloadTitle("");
      setStatusBanner({
        text: "Download was cancelled by user.",
        isError: false,
      });
      setTimeout(() => setStatusBanner(null), 3000);
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  const handleDeleteRecord = async (record: DownloadRecord, deleteFile: boolean) => {
    const confirmPrompt = deleteFile
      ? `Permanently delete "${record.title}" and wipe the file from your computer?`
      : `Remove "${record.title}" from downloads list? (File remains on disk)`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      await deleteDownloadRecord(record.id, deleteFile);
      setLibrary((prev) => prev.filter((r) => r.id !== record.id));
      if (activePlayingRecord?.id === record.id) {
        setActivePlayingRecord(null);
      }
      setStatusBanner({
        text: `Record removed ${deleteFile ? "and file wiped" : ""}.`,
        isError: false,
      });
      setTimeout(() => setStatusBanner(null), 3000);
    } catch (err) {
      console.error("Delete record failed:", err);
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    try {
      await openMediaFileFolder(filePath);
    } catch (err) {
      console.error("Open folder failed:", err);
    }
  };

  const handlePlayExternal = async (filePath: string) => {
    try {
      await playMediaExternally(filePath);
    } catch (err) {
      console.error("External play failed:", err);
      await handleOpenFolder(filePath);
    }
  };

  const filteredLibrary = library.filter((item) =>
    item.title.toLowerCase().includes(librarySearch.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text flex items-center gap-2.5">
            <Download className="h-6 w-6 text-primary" />
            <span>{translate("downloader.title", language)}</span>
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {translate("downloader.subtitle", language)}
          </p>
        </div>

        {/* Engine Status Pill */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-xs shrink-0 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              engineStatus?.is_available ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          <span className="font-medium text-text">
            {engineStatus?.is_available ? (
              <span className="font-mono text-emerald-400">
                Engine Active ({engineStatus.version ? `v${engineStatus.version}` : "yt-dlp"})
              </span>
            ) : (
              <span className="text-amber-400">Engine Initializing...</span>
            )}
          </span>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {statusBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs font-semibold animate-in fade-in ${
            statusBanner.isError
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusBanner.isError ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            onClick={() => setStatusBanner(null)}
            className="p-1 rounded-lg hover:bg-surface/50 text-current"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* URL Input & Inspector Section */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              placeholder={translate("downloader.inputPlaceholder", language)}
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleProbe()}
              className="w-full rounded-xl border border-border bg-surface-2 pl-10 pr-10 py-3 text-xs text-text placeholder:text-text-muted/70 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs font-mono"
            />
            {inputUrl && (
              <button
                onClick={() => setInputUrl("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteClipboard}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all shadow-xs"
              title="Paste URL from Clipboard"
            >
              <ClipboardPaste className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">{translate("downloader.pasteBtn", language)}</span>
            </button>

            <button
              onClick={() => handleProbe()}
              disabled={isProbing || !inputUrl.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isProbing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Radio className="h-4 w-4" />
              )}
              <span>{isProbing ? translate("downloader.probing", language) : translate("downloader.analyzeBtn", language)}</span>
            </button>
          </div>
        </div>

        {/* Supported Platform Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-text-muted font-medium mr-1">
            {translate("downloader.supportedPlatforms", language)}:
          </span>
          {["YouTube", "Facebook", "Instagram", "TikTok", "Twitter / X", "Reddit", "Vimeo", "Direct MP4/WebM"].map(
            (p) => (
              <span
                key={p}
                className="rounded-lg bg-surface-2/80 px-2 py-0.5 text-[10px] font-medium text-text-muted border border-border/50"
              >
                {p}
              </span>
            ),
          )}
        </div>

        {/* Probe Error Alert */}
        {probeError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-mono text-[11px]">{probeError}</div>
          </div>
        )}
      </div>

      {/* Probed Video Card */}
      {probeResult && (
        <div className="rounded-2xl border border-primary/30 bg-surface p-6 shadow-md space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col md:flex-row gap-5 items-start">
            {/* Thumbnail */}
            <div className="relative w-full md:w-56 aspect-video rounded-xl overflow-hidden bg-black/40 border border-border shrink-0">
              {probeResult.thumbnail_url ? (
                <img
                  src={probeResult.thumbnail_url}
                  alt={probeResult.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-muted">
                  <FileVideo className="h-10 w-10 opacity-40" />
                </div>
              )}
              {probeResult.duration_formatted && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white">
                  {probeResult.duration_formatted}
                </span>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="flex-1 space-y-2.5 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                  {probeResult.extractor}
                </span>
                <span className="text-xs text-text-muted truncate">
                  By {probeResult.author}
                </span>
              </div>

              <h2 className="text-sm font-bold text-text leading-snug line-clamp-2">
                {probeResult.title}
              </h2>

              {/* Format / Quality Selector */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-muted">
                    {translate("downloader.chooseQuality", language)}:
                  </span>
                  {selectedFormat && (
                    <span className="text-[11px] font-mono text-primary font-medium">
                      Selected: {selectedFormat.label} ({selectedFormat.ext.toUpperCase()})
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {probeResult.formats.map((fmt) => {
                    const isSelected = selectedFormat?.format_id === fmt.format_id;
                    const isAudio = fmt.is_audio_only;
                    const isVideoOnly = fmt.is_video_only;

                    return (
                      <button
                        key={fmt.format_id + fmt.label}
                        onClick={() => setSelectedFormat(fmt)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-white shadow-sm ring-2 ring-primary/30"
                            : "border-border bg-surface-2 text-text hover:border-primary/50 hover:bg-surface-2/80"
                        }`}
                      >
                        {isAudio ? (
                          <Music
                            className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-amber-400"}`}
                          />
                        ) : isVideoOnly ? (
                          <VolumeX
                            className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-purple-400"}`}
                          />
                        ) : (
                          <Film
                            className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-emerald-400"}`}
                          />
                        )}
                        <span>{fmt.label}</span>
                        <span
                          className={`text-[10px] font-mono rounded px-1.5 py-0.5 ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-black/20 text-text-muted"
                          }`}
                        >
                          {fmt.ext.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  onClick={handleStartDownload}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>{translate("downloader.downloadNow", language)}</span>
                </button>
                <button
                  onClick={() => setProbeResult(null)}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-text hover:bg-surface-2 transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Download Progress Card */}
      {activeDownload && (
        <div className="rounded-2xl border border-primary/40 bg-surface p-6 shadow-md space-y-3.5 animate-in fade-in">
          <div className="flex items-center justify-between gap-4">
            <div className="overflow-hidden">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                {translate("downloader.downloadingNow", language)}
              </span>
              <h3 className="text-sm font-bold text-text truncate mt-0.5">
                {activeDownloadTitle || "Downloading Media Stream..."}
              </h3>
            </div>
            <button
              onClick={handleCancelDownload}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-text">
                {activeDownload.progress_percent.toFixed(1)}%
              </span>
              <div className="flex items-center gap-3 text-text-muted font-mono text-[11px]">
                <span>Speed: {activeDownload.speed_str}</span>
                <span>•</span>
                <span>ETA: {activeDownload.eta_str}</span>
              </div>
            </div>

            <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, activeDownload.progress_percent)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Completed Downloads Library */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Library Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-text">
              {translate("downloader.libraryTitle", language)}
            </h2>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-text-muted">
              {library.length} {library.length === 1 ? "video" : "videos"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search library..."
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-primary w-48"
            />
            <button
              onClick={loadLibrary}
              disabled={isLoadingLibrary}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-muted hover:text-text hover:bg-border active:scale-95 transition-all"
              title="Refresh library"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLibrary ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Library List */}
        {library.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-muted">
              <FileVideo className="h-7 w-7 opacity-50" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">
                {translate("downloader.emptyLibraryTitle", language)}
              </h3>
              <p className="text-xs text-text-muted mt-1 max-w-sm">
                {translate("downloader.emptyLibrarySubtitle", language)}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredLibrary.map((record) => (
              <div
                key={record.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 hover:bg-surface-2/40 transition-colors"
              >
                {/* Media Meta */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Thumbnail / Icon */}
                  <div className="relative flex h-14 w-24 shrink-0 items-center justify-center rounded-xl bg-black/60 border border-border overflow-hidden">
                    {record.thumbnail_url ? (
                      <img
                        src={record.thumbnail_url}
                        alt={record.title}
                        className="h-full w-full object-cover"
                      />
                    ) : record.format === "m4a" || record.format === "mp3" ? (
                      <Music className="h-6 w-6 text-primary opacity-80" />
                    ) : (
                      <FileVideo className="h-6 w-6 text-text-muted opacity-50" />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9px] font-mono text-white">
                      {record.duration_formatted}
                    </span>
                  </div>

                  {/* Title & Specs */}
                  <div className="min-w-0 flex-1">
                    <h4
                      className="text-xs font-bold text-text truncate hover:text-primary cursor-pointer"
                      title={record.title}
                      onClick={() => setActivePlayingRecord(record)}
                    >
                      {record.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-text-muted font-mono">
                      <span className="rounded bg-surface-2 px-1.5 py-0.2 border border-border/80 uppercase">
                        {record.format}
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

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => setActivePlayingRecord(record)}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                    title={translate("downloader.playVideo", language)}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{translate("downloader.playBtn", language)}</span>
                  </button>

                  <button
                    onClick={() => handlePlayExternal(record.file_path)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-muted hover:text-primary hover:bg-border active:scale-95 transition-all"
                    title="Play in Windows Media Player or VLC"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => handleOpenFolder(record.file_path)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-muted hover:text-text hover:bg-border active:scale-95 transition-all"
                    title={translate("downloader.openFolder", language)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteRecord(record, false)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                    title="Remove from list"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteRecord(record, true)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all"
                    title="Delete permanently from disk"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* In-App Cinema Player Modal */}
      {activePlayingRecord && (
        <CinemaPlayerModal
          record={activePlayingRecord}
          onClose={() => setActivePlayingRecord(null)}
        />
      )}
    </div>
  );
}
