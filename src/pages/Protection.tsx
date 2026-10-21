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
} from "lucide-react";
import Pill, { Verdict } from "../components/Pill";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import { ScanResultItem, scanFilePath, scanFilePayload } from "../lib/ipc";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export default function Protection() {
  const { language, recentScans, addScanResult, settings, updateSettings } =
    useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningFileName, setScanningFileName] = useState("");
  const [selectedScan, setSelectedScan] = useState<ScanResultItem | null>(null);
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");

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

      // Check if native path is accessible on the File object (Tauri webview)
      const nativePath = (file as unknown as { path?: string }).path;
      if (nativePath) {
        const result = await scanFilePath(nativePath);
        addScanResult(result);
        setSelectedScan(result);
      } else {
        const result = await scanFilePayload(file.name, file.size);
        addScanResult(result);
        setSelectedScan(result);
      }
      setIsScanning(false);
    } catch (err) {
      console.error("Scan file failed:", err);
      setIsScanning(false);
    }
  };

  // HTML5 Drag and drop handlers
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

      {/* Drag & Drop Scan Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border bg-surface/50 hover:border-primary/50 hover:bg-surface/80"
        }`}
      >
        {isScanning ? (
          <div className="flex flex-col items-center space-y-3">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div>
              <span className="text-sm font-semibold text-text">
                Scanning {scanningFileName}...
              </span>
              <p className="text-xs text-text-muted mt-0.5">
                Verifying Authenticode signature and payload heuristics
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <UploadCloud className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-text">
              {isDragging
                ? "Drop file to inspect now"
                : translate("protection.dropTitle", language)}
            </span>
            <p className="text-xs text-text-muted mt-1">
              Click to browse or drop executables, scripts, archives (.exe,
              .msi, .zip, .bat)
            </p>
          </>
        )}
      </div>

      {/* Recent Scans Table */}
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            {translate("protection.recentScans", language)}
          </h2>
          <span className="text-xs text-text-muted flex items-center gap-1.5">
            <FolderCheck className="h-3.5 w-3.5 text-primary" />
            Active Monitor
          </span>
        </div>

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
              {recentScans.map((scan) => (
                <tr
                  key={scan.id}
                  className="hover:bg-surface-2/40 transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-text max-w-xs truncate">
                    {scan.file_name}
                  </td>
                  <td className="px-5 py-3.5">
                    <Pill verdict={scan.verdict as Verdict} />
                  </td>
                  <td className="px-5 py-3.5 text-text-muted">
                    {scan.size_formatted}
                  </td>
                  <td className="px-5 py-3.5 text-text-muted">
                    {scan.scanned_at.includes("T")
                      ? scan.scanned_at.split("T")[0]
                      : scan.scanned_at}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedScan(scan)}
                      className="text-primary hover:underline font-semibold"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Inspection Modal */}
      {selectedScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                {selectedScan.verdict === "clean" ? (
                  <FileCheck className="h-6 w-6 text-success" />
                ) : selectedScan.verdict === "suspicious" ? (
                  <AlertTriangle className="h-6 w-6 text-warning" />
                ) : (
                  <ShieldAlert className="h-6 w-6 text-danger" />
                )}
                <div>
                  <h3 className="text-base font-semibold text-text truncate max-w-sm">
                    {selectedScan.file_name}
                  </h3>
                  <span className="text-xs text-text-muted">
                    Inspected by ARIS Sentinel Engine
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedScan(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-text-muted">Verdict:</span>
                <Pill verdict={selectedScan.verdict as Verdict} />
              </div>

              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-text-muted">Threat Score:</span>
                <span className="font-semibold text-text">
                  {selectedScan.score} / 100
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-text-muted">File Size:</span>
                <span className="text-text">{selectedScan.size_formatted}</span>
              </div>

              <div className="py-1 border-b border-border/50 space-y-1">
                <span className="text-text-muted">File Path:</span>
                <div className="rounded bg-surface-2 p-2 font-mono text-[11px] text-text break-all">
                  {selectedScan.path}
                </div>
              </div>

              <div className="py-1 border-b border-border/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">SHA-256 Hash:</span>
                  <button
                    onClick={() => handleCopyHash(selectedScan.sha256)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    {copiedHash ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedHash ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="rounded bg-surface-2 p-2 font-mono text-[11px] text-text break-all">
                  {selectedScan.sha256}
                </div>
              </div>

              <div className="py-1 space-y-1">
                <span className="text-text-muted">Findings & Heuristics:</span>
                <ul className="list-disc pl-4 space-y-0.5 text-text">
                  {selectedScan.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedScan(null)}
                className="rounded-xl bg-surface-2 px-4 py-2 text-xs font-semibold text-text hover:bg-border"
              >
                Close
              </button>
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
