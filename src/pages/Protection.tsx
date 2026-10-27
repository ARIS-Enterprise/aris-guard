import { useState, useRef, useEffect, useCallback, DragEvent } from "react";
import {
  FolderCheck,
  UploadCloud,
  CheckCircle,
  X,
  FileCheck,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  Plus,
  Trash2,
  Binary,
  Archive,
  FileCode,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  Lock,
  Unlock,
} from "lucide-react";
import Pill, { Verdict } from "../components/Pill";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import {
  ScanResultItem,
  scanFilePath,
  scanFilePayload,
  runBatchScan,
  BatchScanReport,
  quarantineFile,
  deleteScanResult,
  clearScanHistory,
  deleteThreatFile,
} from "../lib/ipc";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export default function Protection() {
  const {
    language,
    recentScans,
    addScanResult,
    removeScanResult,
    clearRecentScans,
    settings,
    updateSettings,
    refreshAllData,
  } = useAppStore();

  const [scanMode, setScanMode] = useState<"file" | "quick" | "full" | "custom">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningFileName, setScanningFileName] = useState("");
  const [selectedScan, setSelectedScan] = useState<ScanResultItem | null>(null);
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const [customPathInput, setCustomPathInput] = useState("");
  const [batchReport, setBatchReport] = useState<BatchScanReport | null>(null);
  const [isQuarantining, setIsQuarantining] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [actionScanId, setActionScanId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScanNativePath = useCallback(
    async (path: string) => {
      try {
        const fileName = path.split(/[\\/]/).pop() || path;
        setScanningFileName(fileName);
        setIsScanning(true);
        const result = await scanFilePath(path);
        addScanResult(result);
        setSelectedScan(result);
        setIsScanning(false);
      } catch (err) {
        console.error("Scan failed:", err);
        setIsScanning(false);
      }
    },
    [addScanResult],
  );

  // Hook up native Tauri drag-and-drop listener for OS-level file drops
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWebview()
        .onDragDropEvent(async (event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "leave") {
            setIsDragging(false);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              await handleScanNativePath(paths[0]);
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {
          // In web browser fallback mode
        });
    } catch {
      // Ignored in non-Tauri preview
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleScanNativePath]);

  const handleScanFileObject = async (file: File) => {
    try {
      setScanningFileName(file.name);
      setIsScanning(true);

      const nativePath = (file as unknown as { path?: string }).path;
      if (nativePath) {
        const result = await scanFilePath(nativePath);
        addScanResult(result);
        setSelectedScan(result);
      } else {
        const slice = file.slice(0, 16 * 1024 * 1024);
        const buffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))),
          );
        }
        const contentBase64 = btoa(binary);
        const result = await scanFilePayload(file.name, file.size, contentBase64);
        addScanResult(result);
        setSelectedScan(result);
      }
      setIsScanning(false);
    } catch (err) {
      console.error("Scan file failed:", err);
      setIsScanning(false);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleScanFileObject(file);
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleAddFolder = async () => {
    if (!newFolderInput.trim() || !settings) return;
    const updated = [...settings.watch_folders, newFolderInput.trim()];
    await updateSettings({ ...settings, watch_folders: updated });
    setNewFolderInput("");
  };

  const handleRemoveFolder = async (folder: string) => {
    if (!settings) return;
    const updated = settings.watch_folders.filter((f) => f !== folder);
    await updateSettings({ ...settings, watch_folders: updated });
  };

  const handleExecuteBatchScan = async (type: "quick" | "full" | "custom") => {
    try {
      setIsScanning(true);
      setScanningFileName(
        type === "quick"
          ? "Quick Scan (Downloads & Temp)..."
          : type === "full"
            ? "Full System Scan..."
            : customPathInput || "Custom folder...",
      );
      const report = await runBatchScan(
        type,
        type === "custom" ? customPathInput.trim() : undefined,
      );
      setBatchReport(report);
      for (const item of report.items) {
        addScanResult(item);
      }
      setIsScanning(false);
      await refreshAllData();
    } catch (err) {
      console.error("Batch scan failed:", err);
      setIsScanning(false);
    }
  };

  const handleQuarantineThreat = async (item: ScanResultItem) => {
    try {
      if (item.path.startsWith("Dropped://")) {
        setFeedbackBanner({
          text: "Dropped in-memory payload cannot be quarantined because it has no permanent disk location.",
          isError: true,
        });
        setTimeout(() => setFeedbackBanner(null), 5000);
        return;
      }
      setIsQuarantining(true);
      setActionScanId(item.id);
      const reasonStr =
        item.reasons.length > 0
          ? item.reasons.join("; ")
          : "Heuristic Risk Detained";
      await quarantineFile(item.path, reasonStr);
      setFeedbackBanner({
        text: `File "${item.file_name}" has been isolated into Quarantine Vault.`,
        isError: false,
      });
      setSelectedScan(null);
      await refreshAllData();
      setIsQuarantining(false);
      setActionScanId(null);
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err) {
      console.error("Quarantine threat failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackBanner({
        text: `Quarantine failed: ${msg}`,
        isError: true,
      });
      setIsQuarantining(false);
      setActionScanId(null);
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleDeleteScanResult = async (item: ScanResultItem) => {
    try {
      setActionScanId(item.id);
      await deleteScanResult(item.id);
      removeScanResult(item.id);
      if (selectedScan?.id === item.id) {
        setSelectedScan(null);
      }
      await refreshAllData();
      setActionScanId(null);
      setFeedbackBanner({
        text: translate("protection.recordDeletedSuccess", language),
        isError: false,
      });
      setTimeout(() => setFeedbackBanner(null), 3000);
    } catch (err) {
      console.error("Failed to delete scan record:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setActionScanId(null);
      setFeedbackBanner({
        text: `Failed to delete record: ${msg}`,
        isError: true,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleClearAllHistory = async () => {
    if (recentScans.length === 0) return;
    if (!window.confirm(translate("protection.clearHistoryConfirm", language))) {
      return;
    }
    try {
      setIsClearingHistory(true);
      await clearScanHistory();
      clearRecentScans();
      if (selectedScan) {
        setSelectedScan(null);
      }
      await refreshAllData();
      setIsClearingHistory(false);
      setFeedbackBanner({
        text: translate("protection.historyClearedSuccess", language),
        isError: false,
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err) {
      console.error("Failed to clear scan history:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setIsClearingHistory(false);
      setFeedbackBanner({
        text: `Failed to clear history: ${msg}`,
        isError: true,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleDeleteThreat = async (item: ScanResultItem) => {
    if (!window.confirm(translate("protection.deleteThreatConfirm", language))) {
      return;
    }
    try {
      setActionScanId(item.id);
      const msg = await deleteThreatFile(item.id, item.path);
      removeScanResult(item.id);
      if (selectedScan?.id === item.id) {
        setSelectedScan(null);
      }
      await refreshAllData();
      setActionScanId(null);
      setFeedbackBanner({
        text: msg || translate("protection.threatDeletedSuccess", language),
        isError: false,
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err) {
      console.error("Failed to delete threat:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setActionScanId(null);
      setFeedbackBanner({
        text: `Failed to delete threat: ${msg}`,
        isError: true,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const getFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z")) {
      return <Archive className="h-4 w-4 text-amber-400 shrink-0" />;
    }
    if (lower.endsWith(".exe") || lower.endsWith(".msi") || lower.endsWith(".dll")) {
      return <Binary className="h-4 w-4 text-primary shrink-0" />;
    }
    if (lower.endsWith(".bat") || lower.endsWith(".ps1") || lower.endsWith(".vbs")) {
      return <FileCode className="h-4 w-4 text-cyan-400 shrink-0" />;
    }
    return <FileCheck className="h-4 w-4 text-text-muted shrink-0" />;
  };

  const watchFolders = settings?.watch_folders ?? ["Downloads", "Desktop"];

  return (
    <div className="space-y-6">
      {/* Hidden file input for manual browse */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleScanFileObject(e.target.files[0]);
          }
          e.target.value = "";
        }}
      />

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("protection.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("protection.subtitle", language)}
        </p>
      </div>

      {/* Pre-Execution Sentinel Feature Card */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-surface to-surface p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-inner">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">
                  {translate("protection.preExecBannerTitle", language)}
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                  Advanced
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 max-w-xl">
                {translate("protection.preExecBannerDesc", language)}
              </p>
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all shrink-0"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{translate("protection.browseDeepScan", language)}</span>
          </button>
        </div>
      </div>

      {/* Sentinel Status Banner */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">
              {translate("protection.watching", language)}
            </div>
            <div className="text-xs text-text-muted">
              {translate("protection.engine", language)}
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsManageFoldersOpen(true)}
          className="rounded-lg border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all"
        >
          Manage Folders
        </button>
      </div>

      {/* Scan Mode Selection Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => {
            setScanMode("file");
            setBatchReport(null);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            scanMode === "file"
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-surface-2/60 text-text hover:bg-border"
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          <span>Single File & Drop</span>
        </button>

        <button
          onClick={() => {
            setScanMode("quick");
            setBatchReport(null);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            scanMode === "quick"
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-surface-2/60 text-text hover:bg-border"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Quick Scan</span>
        </button>

        <button
          onClick={() => {
            setScanMode("full");
            setBatchReport(null);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            scanMode === "full"
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-surface-2/60 text-text hover:bg-border"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Full System Scan</span>
        </button>

        <button
          onClick={() => {
            setScanMode("custom");
            setBatchReport(null);
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            scanMode === "custom"
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-surface-2/60 text-text hover:bg-border"
          }`}
        >
          <FolderCheck className="h-4 w-4" />
          <span>Custom Folder</span>
        </button>
      </div>

      {/* Batch Scan Summary Banner (if active) */}
      {batchReport && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-2 text-xs animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-text">
              Scan Completed: {batchReport.target_path}
            </span>
            <span className="font-mono text-text-muted">
              {batchReport.duration_ms} ms
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text">
              Total Scanned: <strong>{batchReport.total_scanned}</strong>
            </span>
            <span className="text-success">
              Clean: <strong>{batchReport.clean_count}</strong>
            </span>
            <span className="text-warning">
              Suspicious: <strong>{batchReport.suspicious_count}</strong>
            </span>
            <span className="text-danger">
              Malicious Threats: <strong>{batchReport.threats_found}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Scan Mode Active Body */}
      {scanMode === "file" && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-primary bg-primary/10 scale-[1.01] shadow-lg shadow-primary/10"
              : "border-border/80 bg-surface/60 hover:border-primary/50 hover:bg-surface/90"
          }`}
        >
          {isScanning ? (
            <div className="flex flex-col items-center space-y-3 py-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div>
                <span className="text-sm font-semibold text-text">
                  Inspecting {scanningFileName}...
                </span>
                <p className="text-xs text-text-muted mt-1">
                  Decompressing archive, verifying Authenticode signatures, and checking PE entropy
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 border border-border text-primary mb-3 shadow-inner">
                <UploadCloud className="h-6 w-6" />
              </div>
              <span className="text-sm font-semibold text-text">
                {isDragging
                  ? "Drop payload here for deep analysis"
                  : translate("protection.dropTitle", language)}
              </span>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                {translate("protection.dropSubtitle", language)}
              </p>

              {/* Supported Format Pills */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
                {[".EXE", ".ZIP", ".MSI", ".BAT", ".SCR", ".PS1", ".RAR", ".7Z"].map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-md bg-surface-2/80 px-2 py-0.5 text-[10px] font-mono font-medium text-text-muted border border-border/50"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {scanMode === "quick" && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-text">Quick Security Scan</h3>
              <p className="text-xs text-text-muted mt-1">
                Scans downloads, desktop, temporary files, and autorun startup entries for active threats.
              </p>
            </div>
            <button
              onClick={() => handleExecuteBatchScan("quick")}
              disabled={isScanning}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{isScanning ? "Scanning Targets..." : "Run Quick Scan"}</span>
            </button>
          </div>
        </div>
      )}

      {scanMode === "full" && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-text">Full System Scan</h3>
              <p className="text-xs text-text-muted mt-1">
                Deep analysis across all user libraries, documents, downloads, and execution paths.
              </p>
            </div>
            <button
              onClick={() => handleExecuteBatchScan("full")}
              disabled={isScanning}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              <span>{isScanning ? "Scanning Deep..." : "Run Full Scan"}</span>
            </button>
          </div>
        </div>
      )}

      {scanMode === "custom" && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-text">Custom Directory Scan</h3>
            <p className="text-xs text-text-muted mt-1">
              Select or enter any specific folder path on your computer to recursively inspect.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. C:\Users\Downloads or D:\Projects"
              value={customPathInput}
              onChange={(e) => setCustomPathInput(e.target.value)}
              className="flex-1 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => handleExecuteBatchScan("custom")}
              disabled={isScanning || !customPathInput.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderCheck className="h-4 w-4" />
              )}
              <span>Scan Folder</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs shadow-sm animate-in fade-in ${
            feedbackBanner.isError
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.isError ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
            ) : (
              <Check className="h-4 w-4 shrink-0 text-success" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-surface/50 text-current"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Recent Scans Table */}
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-2/20">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text">
              {translate("protection.recentScans", language)}
            </h2>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
              {recentScans.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {recentScans.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                disabled={isClearingHistory || actionScanId !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger/10 active:scale-95 transition-all disabled:opacity-50"
                title={translate("protection.clearAllHistory", language)}
              >
                {isClearingHistory ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{translate("protection.clearAllHistory", language)}</span>
              </button>
            )}
            <span className="text-xs text-text-muted flex items-center gap-1.5">
              <FolderCheck className="h-3.5 w-3.5 text-primary" />
              {translate("protection.activeMonitor", language)}
            </span>
          </div>
        </div>

        {recentScans.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success border border-success/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-xs text-text-muted">
              {translate("protection.noRecentScans", language)}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-text-muted font-medium border-b border-border">
                <tr>
                  <th className="px-5 py-3">
                    {translate("protection.fileName", language)}
                  </th>
                  <th className="px-5 py-3">
                    {translate("protection.verdict", language)}
                  </th>
                  <th className="px-5 py-3">
                    {translate("protection.size", language)}
                  </th>
                  <th className="px-5 py-3">
                    {translate("protection.scannedAt", language)}
                  </th>
                  <th className="px-5 py-3 text-right">
                    {translate("protection.action", language)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-text">
                {recentScans.map((scan) => {
                  const isThreat =
                    scan.verdict === "suspicious" || scan.verdict === "malicious";
                  const isActionLoading = actionScanId === scan.id;

                  return (
                    <tr
                      key={scan.id}
                      className="hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-medium text-text max-w-xs">
                        <div className="flex items-center gap-2.5 truncate">
                          {getFileIcon(scan.file_name)}
                          <span className="truncate">{scan.file_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Pill verdict={scan.verdict as Verdict} />
                          {scan.action === "Quarantined" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 border border-warning/30 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              {translate("protection.quarantined", language)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-text-muted font-mono text-[11px]">
                        {scan.size_formatted}
                      </td>
                      <td className="px-5 py-3.5 text-text-muted">
                        {scan.scanned_at.includes("T")
                          ? scan.scanned_at.split("T")[0]
                          : scan.scanned_at}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isThreat && scan.action !== "Quarantined" && (
                            <button
                              onClick={() => handleQuarantineThreat(scan)}
                              disabled={isActionLoading || isQuarantining || isClearingHistory}
                              className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-semibold text-warning hover:bg-warning/20 active:scale-95 transition-all disabled:opacity-50"
                              title={translate("protection.quarantineThreat", language)}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isThreat && (
                            <button
                              onClick={() => handleDeleteThreat(scan)}
                              disabled={isActionLoading || isClearingHistory}
                              className="rounded-lg border border-danger/30 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/20 active:scale-95 transition-all disabled:opacity-50"
                              title={translate("protection.deleteThreat", language)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedScan(scan)}
                            className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-primary hover:bg-border active:scale-95 transition-all"
                          >
                            {translate("protection.deepReport", language)}
                          </button>
                          <button
                            onClick={() => handleDeleteScanResult(scan)}
                            disabled={isActionLoading || isClearingHistory}
                            className="rounded-lg border border-border bg-surface-2 p-1 text-xs text-text-muted hover:text-danger hover:bg-danger/10 hover:border-danger/30 active:scale-95 transition-all disabled:opacity-50"
                            title={translate("protection.deleteRecord", language)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Advanced Deep Malware & Pre-Execution Safety Inspection Modal */}
      {selectedScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border px-6 py-4 bg-surface-2/40">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    selectedScan.verdict === "clean"
                      ? "bg-success/10 text-success border-success/30"
                      : selectedScan.verdict === "suspicious"
                        ? "bg-warning/10 text-warning border-warning/30"
                        : "bg-danger/10 text-danger border-danger/30"
                  }`}
                >
                  {selectedScan.verdict === "clean" ? (
                    <FileCheck className="h-6 w-6" />
                  ) : selectedScan.verdict === "suspicious" ? (
                    <AlertTriangle className="h-6 w-6" />
                  ) : (
                    <ShieldAlert className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-text truncate">
                    {selectedScan.file_name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    <span>{selectedScan.size_formatted}</span>
                    <span>•</span>
                    <span className="font-mono truncate max-w-xs">{selectedScan.path}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedScan(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {feedbackBanner && feedbackBanner.isError && (
                <div className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger shadow-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                    <span>{feedbackBanner.text}</span>
                  </div>
                  <button
                    onClick={() => setFeedbackBanner(null)}
                    className="p-1 rounded-lg hover:bg-surface/50 text-current"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Safety Verdict Status Banner */}
              <div
                className={`rounded-xl border p-4 ${
                  selectedScan.verdict === "clean"
                    ? "border-success/30 bg-success/10 text-success"
                    : selectedScan.verdict === "suspicious"
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-danger/30 bg-danger/10 text-danger"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedScan.verdict === "clean" ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                    <span className="text-sm font-bold">
                      {selectedScan.deep_analysis?.safety_verdict ||
                        (selectedScan.verdict === "clean"
                          ? "Safe to Run"
                          : "High Risk Detected")}
                    </span>
                    {selectedScan.action === "Quarantined" && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/20 border border-warning/40 px-2 py-0.5 text-[11px] font-semibold text-warning">
                        {translate("protection.quarantined", language)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface/50 border border-current">
                    Threat Score: {selectedScan.score} / 100
                  </span>
                </div>
              </div>

              {/* Technical Heuristics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Authenticode Signature */}
                <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text">Authenticode Signature</span>
                    {selectedScan.deep_analysis?.is_signed ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-success">
                        <Lock className="h-3 w-3" /> Signed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-warning">
                        <Unlock className="h-3 w-3" /> Unsigned
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted leading-tight">
                    {selectedScan.deep_analysis?.signature_details ||
                      "Signature verification status"}
                  </p>
                </div>

                {/* Shannon Entropy Analysis */}
                <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text">Shannon Binary Entropy</span>
                    <span className="text-xs font-mono font-bold text-text">
                      {selectedScan.deep_analysis?.entropy.toFixed(2) ?? "6.20"} / 8.0
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (selectedScan.deep_analysis?.entropy ?? 6.2) > 7.15
                          ? "bg-danger"
                          : (selectedScan.deep_analysis?.entropy ?? 6.2) > 6.6
                            ? "bg-warning"
                            : "bg-success"
                      }`}
                      style={{
                        width: `${Math.min(100, ((selectedScan.deep_analysis?.entropy ?? 6.2) / 8.0) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted block">
                    {selectedScan.deep_analysis?.entropy_status || "Normal Binary Distribution"}
                  </span>
                </div>

                {/* File Format & PE Subsystem */}
                <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-1">
                  <span className="text-xs font-semibold text-text">Architecture & Format</span>
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-text">
                      {selectedScan.deep_analysis?.file_type || "Standard Binary"}
                    </span>
                  </div>
                </div>

                {/* Packer / Obfuscation status */}
                <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-1">
                  <span className="text-xs font-semibold text-text">Obfuscation / Protector</span>
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-xs text-text">
                      {selectedScan.deep_analysis?.packer_name ||
                        (selectedScan.deep_analysis?.is_packed
                          ? "High-Entropy Packing"
                          : "None (Clean Compilation)")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Archive Breakdown (if archive) */}
              {selectedScan.deep_analysis?.is_archive && (
                <div className="rounded-xl border border-border bg-surface-2/30 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Archive className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-bold text-text">
                        Archive Structural Inspection ({selectedScan.deep_analysis.archive_total_files} files)
                      </span>
                    </div>
                    {selectedScan.deep_analysis.archive_is_encrypted && (
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                        Password Encrypted
                      </span>
                    )}
                  </div>

                  {selectedScan.deep_analysis.archive_dangerous_entries.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-danger block">
                        Flagged Hidden Payloads Inside Archive:
                      </span>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedScan.deep_analysis.archive_dangerous_entries.map((entry, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger"
                          >
                            <span className="font-mono text-[11px] truncate">{entry.path}</span>
                            <span className="text-[10px] font-semibold uppercase shrink-0">
                              {entry.risk_reason || "Executable"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-success flex items-center gap-1.5 pt-1">
                      <Check className="h-3.5 w-3.5" />
                      No disguised executables, zip bombs, or path traversal scripts found inside.
                    </p>
                  )}
                </div>
              )}

              {/* SHA-256 Checksum Card */}
              <div className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">Cryptographic SHA-256 Hash</span>
                  <button
                    onClick={() => handleCopyHash(selectedScan.sha256)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
                  >
                    {copiedHash ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedHash ? "Copied" : "Copy Hash"}
                  </button>
                </div>
                <div className="rounded-lg bg-surface p-2 font-mono text-[11px] text-text break-all border border-border/50">
                  {selectedScan.sha256}
                </div>
              </div>

              {/* Findings and Heuristic Reasons */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text block">
                  Detailed Findings & Heuristics ({selectedScan.reasons.length})
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedScan.reasons.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-2/30 p-2.5 text-xs text-text"
                    >
                      <span className="text-primary mt-0.5">•</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border px-6 py-4 bg-surface-2/40 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Engines: {selectedScan.engines.join(", ")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleDeleteScanResult(selectedScan)}
                  disabled={actionScanId === selectedScan.id || isClearingHistory}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs font-semibold text-text-muted hover:text-danger hover:bg-danger/10 hover:border-danger/30 active:scale-95 transition-all disabled:opacity-60"
                  title={translate("protection.deleteRecord", language)}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{translate("protection.deleteRecord", language)}</span>
                </button>
                {(selectedScan.verdict === "suspicious" ||
                  selectedScan.verdict === "malicious") && (
                  <button
                    onClick={() => handleDeleteThreat(selectedScan)}
                    disabled={actionScanId === selectedScan.id || isClearingHistory}
                    className="flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-xs font-semibold text-danger hover:bg-danger/20 active:scale-95 transition-all disabled:opacity-60"
                    title={translate("protection.deleteThreat", language)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{translate("protection.deleteThreat", language)}</span>
                  </button>
                )}
                {selectedScan.action !== "Quarantined" && (
                  <button
                    onClick={() => handleQuarantineThreat(selectedScan)}
                    disabled={
                      isQuarantining ||
                      actionScanId === selectedScan.id ||
                      isClearingHistory
                    }
                    className="flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-xs font-semibold text-warning hover:bg-warning/20 active:scale-95 transition-all disabled:opacity-60"
                  >
                    {isQuarantining && actionScanId === selectedScan.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    <span>{translate("protection.quarantineThreat", language)}</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedScan(null)}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Folders Modal */}
      {isManageFoldersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-text">
                  Monitored Folders
                </h3>
                <span className="text-xs text-text-muted">
                  Folders continuously watched for newly downloaded files
                </span>
              </div>
              <button
                onClick={() => setIsManageFoldersOpen(false)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {watchFolders.map((folder, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-text"
                >
                  <span className="font-mono">{folder}</span>
                  {folder !== "Downloads" && folder !== "Desktop" && (
                    <button
                      onClick={() => handleRemoveFolder(folder)}
                      className="text-danger hover:text-danger/80"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <input
                type="text"
                placeholder="e.g. C:\Users\MyName\Torrents"
                value={newFolderInput}
                onChange={(e) => setNewFolderInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleAddFolder}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsManageFoldersOpen(false)}
                className="rounded-xl bg-surface-2 px-4 py-2 text-xs font-semibold text-text hover:bg-border"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
