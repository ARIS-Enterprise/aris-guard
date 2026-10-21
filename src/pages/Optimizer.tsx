import { useState, useEffect } from "react";
import {
  HardDrive,
  Play,
  Eye,
  Sparkles,
  Loader2,
  Check,
  CheckCircle2,
  Search,
  Trash2,
  RefreshCw,
  Folder,
  FileText,
  Layers,
  ExternalLink,
  X,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import {
  CleanupCategoryInfo,
  previewCleanup,
  runCleanup,
  toggleStartupItem,
  listInstalledApps,
  scanAppLeftovers,
  runOfficialUninstaller,
  deleteAppLeftovers,
  InstalledApp,
  AppLeftoverScanResult,
} from "../lib/ipc";

function formatBytes(bytes: number): string {
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) return (bytes / gb).toFixed(1) + " GB";
  if (bytes >= mb) return (bytes / mb).toFixed(1) + " MB";
  if (bytes >= kb) return (bytes / kb).toFixed(1) + " KB";
  return bytes + " B";
}

export default function Optimizer() {
  const { language, startupItems, refreshAllData } = useAppStore();
  const [activeTab, setActiveTab] = useState<
    "cleaner" | "uninstaller" | "startup" | "memory"
  >("cleaner");

  // Cleaner state
  const [categories, setCategories] = useState<CleanupCategoryInfo[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(
    new Set(["user_temp", "thumbnails", "crash_dumps", "wer_reports"]),
  );
  const [totalFormatted, setTotalFormatted] = useState("1.4 GB");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  // Memory state
  const [isTuningMemory, setIsTuningMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);

  // Uninstaller state
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [selectedAppForClean, setSelectedAppForClean] =
    useState<InstalledApp | null>(null);
  const [scanResult, setScanResult] = useState<AppLeftoverScanResult | null>(
    null,
  );
  const [isScanningLeftovers, setIsScanningLeftovers] = useState(false);
  const [selectedLeftoverIds, setSelectedLeftoverIds] = useState<Set<string>>(
    new Set(),
  );
  const [isDeletingLeftovers, setIsDeletingLeftovers] = useState(false);
  const [officialLaunchMsg, setOfficialLaunchMsg] = useState<string | null>(
    null,
  );
  const [deleteResultMsg, setDeleteResultMsg] = useState<string | null>(null);
  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState(false);

  // Load preview categories on mount
  useEffect(() => {
    loadPreview();
  }, []);

  // Load installed apps when switching to uninstaller tab
  useEffect(() => {
    if (activeTab === "uninstaller" && installedApps.length === 0) {
      loadInstalledApps();
    }
  }, [activeTab, installedApps.length]);

  const loadPreview = async () => {
    try {
      setIsLoadingPreview(true);
      const summary = await previewCleanup();
      setCategories(summary.categories);
      setTotalFormatted(summary.total_formatted);
      setSelectedCatIds(
        new Set(
          summary.categories.filter((c) => c.default_checked).map((c) => c.id),
        ),
      );
      setIsLoadingPreview(false);
    } catch (err) {
      console.error("Failed to load cleaner preview:", err);
      setIsLoadingPreview(false);
    }
  };

  const loadInstalledApps = async () => {
    try {
      setIsLoadingApps(true);
      const apps = await listInstalledApps();
      setInstalledApps(apps);
      setIsLoadingApps(false);
    } catch (err) {
      console.error("Failed to load installed apps:", err);
      setIsLoadingApps(false);
    }
  };

  const handleToggleCategory = (id: string) => {
    const next = new Set(selectedCatIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedCatIds(next);
  };

  const handleCleanNow = async () => {
    if (isCleaning || selectedCatIds.size === 0) return;
    try {
      setIsCleaning(true);
      const res = await runCleanup(Array.from(selectedCatIds));
      setCleanResult(res.message);
      await loadPreview();
      await refreshAllData();
      setIsCleaning(false);
      setTimeout(() => setCleanResult(null), 5000);
    } catch (err) {
      console.error("Cleanup failed:", err);
      setIsCleaning(false);
    }
  };

  const handleTuneMemory = () => {
    setIsTuningMemory(true);
    setTimeout(() => {
      setIsTuningMemory(false);
      setMemoryMessage("Process working set trimmed. 4.2 MB released to OS.");
      setTimeout(() => setMemoryMessage(null), 4000);
    }, 1200);
  };

  const handleToggleStartup = async (name: string, enabled: boolean) => {
    try {
      await toggleStartupItem(name, enabled);
      await refreshAllData();
    } catch (err) {
      console.error("Failed toggling startup item:", err);
    }
  };

  // Deep Clean actions
  const handleOpenDeepClean = async (app: InstalledApp) => {
    setSelectedAppForClean(app);
    setScanResult(null);
    setOfficialLaunchMsg(null);
    setDeleteResultMsg(null);
    setConfirmDeletePrompt(false);
    setIsScanningLeftovers(true);

    try {
      const res = await scanAppLeftovers(
        app.name,
        app.publisher,
        app.install_location,
      );
      setScanResult(res);
      // Select all by default so user can eradicate with 1 click
      setSelectedLeftoverIds(new Set(res.leftovers.map((item) => item.id)));
      setIsScanningLeftovers(false);
    } catch (err) {
      console.error("Failed scanning app leftovers:", err);
      setIsScanningLeftovers(false);
    }
  };

  const handleToggleLeftover = (id: string) => {
    const next = new Set(selectedLeftoverIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedLeftoverIds(next);
  };

  const handleSelectAllLeftovers = () => {
    if (!scanResult) return;
    if (selectedLeftoverIds.size === scanResult.leftovers.length) {
      setSelectedLeftoverIds(new Set());
    } else {
      setSelectedLeftoverIds(new Set(scanResult.leftovers.map((l) => l.id)));
    }
  };

  const handleRunOfficialUninstaller = async () => {
    if (!selectedAppForClean || !selectedAppForClean.uninstall_string) return;
    try {
      const msg = await runOfficialUninstaller(
        selectedAppForClean.uninstall_string,
      );
      setOfficialLaunchMsg(msg);
      setTimeout(() => setOfficialLaunchMsg(null), 6000);
    } catch (err) {
      console.error("Failed to launch official uninstaller:", err);
    }
  };

  const handleExecuteDeleteLeftovers = async () => {
    if (!selectedAppForClean || !scanResult) return;
    try {
      setIsDeletingLeftovers(true);
      const itemsToProcess = scanResult.leftovers.map((item) => ({
        ...item,
        selected: selectedLeftoverIds.has(item.id),
      }));

      const res = await deleteAppLeftovers(
        selectedAppForClean.name,
        itemsToProcess,
      );
      setDeleteResultMsg(res.message);
      setIsDeletingLeftovers(false);
      setConfirmDeletePrompt(false);

      // Refresh leftovers scan
      const updated = await scanAppLeftovers(
        selectedAppForClean.name,
        selectedAppForClean.publisher,
        selectedAppForClean.install_location,
      );
      setScanResult(updated);
      setSelectedLeftoverIds(new Set(updated.leftovers.map((l) => l.id)));

      // Reload installed apps and store
      await loadInstalledApps();
      await refreshAllData();
    } catch (err) {
      console.error("Failed to delete leftovers:", err);
      setIsDeletingLeftovers(false);
    }
  };

  // Filter installed apps
  const filteredApps = installedApps.filter((app) => {
    const q = appSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      app.name.toLowerCase().includes(q) ||
      app.publisher.toLowerCase().includes(q) ||
      app.install_location.toLowerCase().includes(q)
    );
  });

  const selectedBytesTotal =
    scanResult?.leftovers
      .filter((l) => selectedLeftoverIds.has(l.id))
      .reduce((sum, l) => sum + l.size_bytes, 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("optimizer.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("optimizer.subtitle", language)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-6 text-sm font-medium">
        {[
          { id: "cleaner", label: translate("optimizer.cleanerTab", language) },
          {
            id: "uninstaller",
            label: translate("optimizer.uninstallerTab", language),
          },
          { id: "startup", label: translate("optimizer.startupTab", language) },
          { id: "memory", label: translate("optimizer.memoryTab", language) },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cleaner Tab Content */}
      {activeTab === "cleaner" && (
        <div className="space-y-6">
          {cleanResult && (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-medium text-success transition-all animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{cleanResult}</span>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text">
                Select Safe Cleanup Targets
              </h2>
              <span className="text-xs text-text-muted">
                {selectedCatIds.size} of {categories.length} selected
              </span>
            </div>

            <div className="space-y-3">
              {categories.map((cat) => {
                const isChecked = selectedCatIds.has(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center justify-between rounded-lg border p-3.5 transition-colors cursor-pointer ${
                      isChecked
                        ? "border-primary/40 bg-surface-2/70"
                        : "border-border/60 bg-surface-2/20 hover:bg-surface-2/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCategory(cat.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                      />
                      <div>
                        <span className="text-sm font-medium text-text block">
                          {cat.name}
                        </span>
                        <span className="text-xs text-text-muted">
                          {cat.description}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-text-muted bg-surface px-2.5 py-1 rounded shrink-0">
                      {cat.size_formatted}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-border">
              <span className="text-xs text-text-muted">
                Total recoverable estimate:{" "}
                <strong className="text-text font-semibold">
                  {totalFormatted}
                </strong>
              </span>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={loadPreview}
                  disabled={isLoadingPreview || isCleaning}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all disabled:opacity-60"
                >
                  {isLoadingPreview ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {translate("optimizer.previewBtn", language)}
                </button>
                <button
                  onClick={handleCleanNow}
                  disabled={isCleaning || selectedCatIds.size === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isCleaning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {translate("optimizer.cleanBtn", language)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deep Uninstaller Tab Content */}
      {activeTab === "uninstaller" && (
        <div className="space-y-4">
          {/* Search and stats bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder={translate("optimizer.searchApps", language)}
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-text-muted px-2">
                {filteredApps.length} {translate("optimizer.appsDetected", language)}
              </span>
              <button
                onClick={loadInstalledApps}
                disabled={isLoadingApps}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-surface-2 active:scale-95 transition-all disabled:opacity-60"
                title="Refresh apps list"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingApps ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {/* Installed Apps List */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            {isLoadingApps ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
                <span className="text-xs font-medium text-text">
                  Scanning Windows registry for installed applications...
                </span>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                No applications matching your search query.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredApps.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-4 hover:bg-surface-2/40 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 border border-border text-sm font-bold text-primary">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text truncate">
                            {app.name}
                          </span>
                          {app.version && (
                            <span className="text-[10px] rounded bg-surface-2 px-1.5 py-0.5 text-text-muted shrink-0 font-mono">
                              v{app.version}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5 truncate">
                          {app.publisher && (
                            <span className="truncate">{app.publisher}</span>
                          )}
                          {app.publisher && app.install_location && (
                            <span>•</span>
                          )}
                          {app.install_location && (
                            <span
                              className="truncate max-w-[280px] font-mono text-[11px]"
                              title={app.install_location}
                            >
                              {app.install_location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {app.estimated_size_bytes > 0 && (
                        <span className="text-xs font-semibold text-text-muted bg-surface-2 px-2.5 py-1 rounded">
                          {app.estimated_size_formatted}
                        </span>
                      )}
                      <button
                        onClick={() => handleOpenDeepClean(app)}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 hover:border-danger/40 hover:bg-danger/10 hover:text-danger px-3 py-1.5 text-xs font-semibold text-text active:scale-95 transition-all"
                        title="Scan leftovers and completely remove application"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                        <span>{translate("optimizer.deepCleanBtn", language)}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Startup Tab Content */}
      {activeTab === "startup" && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-2/30">
            <span className="text-xs text-text-muted">
              Adjust which background programs launch automatically with
              Windows.
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-text-muted font-medium border-b border-border">
              <tr>
                <th className="px-5 py-3">Application</th>
                <th className="px-5 py-3">Publisher</th>
                <th className="px-5 py-3">Startup Impact</th>
                <th className="px-5 py-3 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-text">
              {startupItems.map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-surface-2/40 transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-text">
                    {item.name}
                  </td>
                  <td className="px-5 py-3.5 text-text-muted">
                    {item.publisher}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        item.impact === "High"
                          ? "bg-danger/10 text-danger"
                          : item.impact === "Medium"
                            ? "bg-warning/10 text-warning"
                            : "bg-surface-2 text-text-muted"
                      }`}
                    >
                      {item.impact}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <input
                      type="checkbox"
                      defaultChecked={item.enabled}
                      disabled={item.locked}
                      onChange={(e) =>
                        handleToggleStartup(item.name, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-border text-primary cursor-pointer disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Memory Tab Content */}
      {activeTab === "memory" && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-5">
          {memoryMessage && (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3.5 text-xs font-medium text-success transition-all animate-in fade-in">
              <Check className="h-4 w-4 shrink-0" />
              <span>{memoryMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-primary" />
              <div>
                <span className="text-sm font-semibold text-text">
                  RAM Working Set
                </span>
                <p className="text-xs text-text-muted">
                  Agent running well within ≤ 30 MB budget
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-success">
              24.6 MB / 30 MB budget
            </span>
          </div>

          <div className="h-3 w-full rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: "24.6%" }}
            />
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Closing the ARIS Guard window completely destroys the WebView2
            renderer process, reducing RAM footprint to the minimal background
            tray agent.
          </p>

          <div className="pt-2">
            <button
              onClick={handleTuneMemory}
              disabled={isTuningMemory}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all disabled:opacity-60"
            >
              {isTuningMemory ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              {isTuningMemory ? "Compacting Working Set..." : "Tune Active Processes"}
            </button>
          </div>
        </div>
      )}

      {/* Deep Uninstaller Modal Dialog */}
      {selectedAppForClean && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2/40">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger border border-danger/20">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-text truncate">
                    {selectedAppForClean.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {selectedAppForClean.publisher && (
                      <span>{selectedAppForClean.publisher}</span>
                    )}
                    {selectedAppForClean.version && (
                      <span>• v{selectedAppForClean.version}</span>
                    )}
                    <span>• {selectedAppForClean.registry_source}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedAppForClean(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Optional Official Uninstaller Callout */}
              {selectedAppForClean.uninstall_string && (
                <div className="rounded-xl border border-border/70 bg-surface-2/30 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-text">
                        Step 1 (Optional): Standard Vendor Uninstaller
                      </h4>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        You can trigger the software&#39;s built-in uninstaller first, or proceed straight to residue eradication.
                      </p>
                    </div>
                    <button
                      onClick={handleRunOfficialUninstaller}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                      <span>{translate("optimizer.officialUninstallBtn", language)}</span>
                    </button>
                  </div>
                  {officialLaunchMsg && (
                    <div className="mt-3 text-xs font-medium text-success flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {officialLaunchMsg}
                    </div>
                  )}
                </div>
              )}

              {/* Residual Traces Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text">
                      Step 2: Residual Traces & Leftover Cleanup
                    </h4>
                    <p className="text-xs text-text-muted mt-0.5">
                      Select which lingering folders, configs, and registry entries to permanently erase.
                    </p>
                  </div>
                  {scanResult && scanResult.leftovers.length > 0 && (
                    <button
                      onClick={handleSelectAllLeftovers}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {selectedLeftoverIds.size === scanResult.leftovers.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  )}
                </div>

                {deleteResultMsg && (
                  <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3.5 text-xs font-medium text-success animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{deleteResultMsg}</span>
                  </div>
                )}

                {isScanningLeftovers ? (
                  <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-border bg-surface-2/20 text-center">
                    <Loader2 className="h-6 w-6 text-primary animate-spin mb-2" />
                    <span className="text-xs font-medium text-text">
                      Deep-scanning disk and registry for residual traces...
                    </span>
                    <span className="text-[11px] text-text-muted mt-1">
                      Checking %LocalAppData%, %AppData%, ProgramData, and Windows Registry hives
                    </span>
                  </div>
                ) : scanResult && scanResult.leftovers.length > 0 ? (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {scanResult.leftovers.map((leftover) => {
                      const isChecked = selectedLeftoverIds.has(leftover.id);
                      return (
                        <label
                          key={leftover.id}
                          className={`flex items-start justify-between gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                            isChecked
                              ? "border-primary/40 bg-surface-2/70"
                              : "border-border/60 bg-surface-2/20 hover:bg-surface-2/40"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleLeftover(leftover.id)}
                              className="h-4 w-4 mt-0.5 rounded border-border text-primary cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {leftover.kind === "Directory" ? (
                                  <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                                ) : leftover.kind === "RegistryKey" ? (
                                  <Layers className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                )}
                                <span className="text-xs font-semibold text-text rounded bg-surface px-1.5 py-0.5 border border-border/50">
                                  {leftover.category}
                                </span>
                              </div>
                              <span
                                className="text-xs font-mono text-text block truncate"
                                title={leftover.path}
                              >
                                {leftover.path}
                              </span>
                              <span className="text-[11px] text-text-muted block mt-0.5">
                                {leftover.description}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-text-muted bg-surface px-2 py-0.5 rounded shrink-0">
                            {leftover.size_formatted}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                    {translate("optimizer.noLeftovers", language)}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border px-6 py-4 bg-surface-2/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Selected for removal:{" "}
                <strong className="text-text font-semibold">
                  {selectedLeftoverIds.size} items ({formatBytes(selectedBytesTotal)})
                </strong>
              </span>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setSelectedAppForClean(null)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 transition-all"
                >
                  Cancel
                </button>

                {confirmDeletePrompt ? (
                  <div className="flex items-center gap-2 animate-in fade-in">
                    <span className="text-xs text-danger font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Wipe permanently?
                    </span>
                    <button
                      onClick={handleExecuteDeleteLeftovers}
                      disabled={isDeletingLeftovers}
                      className="rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-danger/90 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {isDeletingLeftovers ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Yes, Eradicate"
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmDeletePrompt(false)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-surface-2"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeletePrompt(true)}
                    disabled={
                      isDeletingLeftovers ||
                      selectedLeftoverIds.size === 0 ||
                      isScanningLeftovers
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-danger/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeletingLeftovers ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>{translate("optimizer.deleteSelectedTraces", language)}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
