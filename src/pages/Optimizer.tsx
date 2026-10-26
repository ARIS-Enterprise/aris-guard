import { useState, useEffect, useRef } from "react";
import {
  HardDrive,
  Play,
  Eye,
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
  Zap,
  Cpu,
  Radio,
  FileSearch,
  ShieldAlert,
  Ghost,
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
  EradicationTarget,
  EradicationAuditReport,
  EradicationResult,
  listEradicationCandidates,
  auditEradicationTraces,
  executeOblivionEradication,
  boostMemory,
  getSystemPerformance,
  SystemPerformanceMetrics,
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
    "cleaner" | "uninstaller" | "eradicator" | "startup" | "memory"
  >("cleaner");

  // Cleaner state
  const [categories, setCategories] = useState<CleanupCategoryInfo[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(
    new Set([
      "user_temp",
      "system_temp",
      "recycle_bin",
      "browser_cache",
      "crash_dumps",
      "thumbnails",
      "wer_reports",
    ]),
  );
  const [totalFormatted, setTotalFormatted] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  // Memory state
  const [isTuningMemory, setIsTuningMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);
  const [perfMetrics, setPerfMetrics] = useState<SystemPerformanceMetrics | null>(null);

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

  // Ghost Eradicator state
  const [eradicationCandidates, setEradicationCandidates] = useState<
    EradicationTarget[]
  >([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState<
    "all" | "ram" | "network" | "installed"
  >("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedTarget, setSelectedTarget] =
    useState<EradicationTarget | null>(null);
  const [auditReport, setAuditReport] = useState<EradicationAuditReport | null>(
    null,
  );
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [isEradicating, setIsEradicating] = useState(false);
  const [eradicationResult, setEradicationResult] =
    useState<EradicationResult | null>(null);
  const [confirmOblivionPrompt, setConfirmOblivionPrompt] = useState(false);
  const [customEradicatePath, setCustomEradicatePath] = useState("");

  const customFileInputRef = useRef<HTMLInputElement>(null);

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

  // Load eradication candidates when switching to eradicator tab
  useEffect(() => {
    if (activeTab === "eradicator" && eradicationCandidates.length === 0) {
      loadEradicationCandidates();
    }
  }, [activeTab, eradicationCandidates.length]);

  // Load live system performance when switching to memory tab
  useEffect(() => {
    if (activeTab === "memory") {
      getSystemPerformance()
        .then((m) => setPerfMetrics(m))
        .catch((err) => console.error("Failed fetching performance metrics:", err));
    }
  }, [activeTab]);

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

  const loadEradicationCandidates = async () => {
    try {
      setIsLoadingCandidates(true);
      const candidates = await listEradicationCandidates();
      setEradicationCandidates(candidates);
      setIsLoadingCandidates(false);
    } catch (err) {
      console.error("Failed loading eradication candidates:", err);
      setIsLoadingCandidates(false);
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

  const handleTuneMemory = async () => {
    if (isTuningMemory) return;
    try {
      setIsTuningMemory(true);
      const res = await boostMemory();
      setMemoryMessage(res.message);
      const updated = await getSystemPerformance();
      setPerfMetrics(updated);
      await refreshAllData();
      setIsTuningMemory(false);
      setTimeout(() => setMemoryMessage(null), 5000);
    } catch (err) {
      console.error("Memory boost failed:", err);
      setIsTuningMemory(false);
    }
  };

  const handleToggleStartup = async (name: string, enabled: boolean) => {
    try {
      await toggleStartupItem(name, enabled);
      await refreshAllData();
    } catch (err) {
      console.error("Failed toggling startup item:", err);
    }
  };

  // Deep Clean actions (Uninstaller)
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

      const updated = await scanAppLeftovers(
        selectedAppForClean.name,
        selectedAppForClean.publisher,
        selectedAppForClean.install_location,
      );
      setScanResult(updated);
      setSelectedLeftoverIds(new Set(updated.leftovers.map((l) => l.id)));

      await loadInstalledApps();
      await refreshAllData();
    } catch (err) {
      console.error("Failed to delete leftovers:", err);
      setIsDeletingLeftovers(false);
    }
  };

  // Ghost Eradicator actions
  const handleStartEradication = async (target: EradicationTarget) => {
    setSelectedTarget(target);
    setAuditReport(null);
    setEradicationResult(null);
    setConfirmOblivionPrompt(false);
    setIsAuditing(true);

    try {
      const report = await auditEradicationTraces(
        target.name,
        target.exe_name,
        target.path,
      );
      setAuditReport(report);
      setSelectedItemIds(new Set(report.items.map((i) => i.id)));
      setIsAuditing(false);
    } catch (err) {
      console.error("Audit traces failed:", err);
      setIsAuditing(false);
    }
  };

  const handleCustomFileSelect = async (file: File) => {
    const fileName = file.name;
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const nativePath = (file as unknown as { path?: string }).path;
    const target: EradicationTarget = {
      id: "custom-" + Date.now(),
      name: baseName,
      exe_name: fileName,
      path: nativePath || undefined,
      category: "Custom File",
    };
    await handleStartEradication(target);
  };

  const handleCustomPathAudit = async () => {
    const raw = customEradicatePath.trim();
    if (!raw) return;
    const baseName = raw.split(/[\\/]/).pop() || raw;
    const cleanName = baseName.replace(/\.[^/.]+$/, "");
    const target: EradicationTarget = {
      id: "custom-" + Date.now(),
      name: cleanName,
      exe_name: baseName,
      path: raw,
      category: "Custom Path",
    };
    await handleStartEradication(target);
  };

  const handleToggleEradicationItem = (id: string) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  const handleSelectAllEradicationItems = () => {
    if (!auditReport) return;
    if (selectedItemIds.size === auditReport.items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(auditReport.items.map((i) => i.id)));
    }
  };

  const handleExecuteOblivion = async () => {
    if (!selectedTarget || !auditReport) return;
    try {
      setIsEradicating(true);
      const itemsToPurge = auditReport.items.map((i) => ({
        ...i,
        selected: selectedItemIds.has(i.id),
      }));

      const res = await executeOblivionEradication(
        selectedTarget.name,
        itemsToPurge,
      );
      setEradicationResult(res);
      setIsEradicating(false);
      setConfirmOblivionPrompt(false);

      // Re-audit to verify zero traces remain
      const reAudit = await auditEradicationTraces(
        selectedTarget.name,
        selectedTarget.exe_name,
        selectedTarget.path,
      );
      setAuditReport(reAudit);
      setSelectedItemIds(new Set(reAudit.items.map((i) => i.id)));

      // Reload candidates
      await loadEradicationCandidates();
      await refreshAllData();
    } catch (err) {
      console.error("Oblivion eradication failed:", err);
      setIsEradicating(false);
    }
  };

  // Filter lists
  const filteredApps = installedApps.filter((app) => {
    const q = appSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      app.name.toLowerCase().includes(q) ||
      app.publisher.toLowerCase().includes(q) ||
      app.install_location.toLowerCase().includes(q)
    );
  });

  const filteredCandidates = eradicationCandidates.filter((cand) => {
    if (candidateFilter === "ram" && cand.category !== "Running in RAM")
      return false;
    if (
      candidateFilter === "network" &&
      cand.category !== "Network & Data Usage"
    )
      return false;
    if (
      candidateFilter === "installed" &&
      cand.category !== "Installed Software"
    )
      return false;

    const q = candidateSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      cand.name.toLowerCase().includes(q) ||
      cand.exe_name.toLowerCase().includes(q) ||
      (cand.path && cand.path.toLowerCase().includes(q))
    );
  });

  const selectedLeftoverBytes =
    scanResult?.leftovers
      .filter((l) => selectedLeftoverIds.has(l.id))
      .reduce((sum, l) => sum + l.size_bytes, 0) || 0;

  const selectedAuditBytes =
    auditReport?.items
      .filter((i) => selectedItemIds.has(i.id))
      .reduce((sum, i) => sum + i.size_bytes, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Hidden file input for custom file eradication */}
      <input
        type="file"
        ref={customFileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleCustomFileSelect(e.target.files[0]);
          }
          e.target.value = "";
        }}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("optimizer.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("optimizer.subtitle", language)}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-6 text-sm font-medium overflow-x-auto">
        {[
          { id: "cleaner", label: translate("optimizer.cleanerTab", language) },
          {
            id: "uninstaller",
            label: translate("optimizer.uninstallerTab", language),
          },
          {
            id: "eradicator",
            label: translate("optimizer.eradicatorTab", language),
          },
          { id: "startup", label: translate("optimizer.startupTab", language) },
          { id: "memory", label: translate("optimizer.memoryTab", language) },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap ${
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
                  {totalFormatted || "Scanning space..."}
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
                {filteredApps.length}{" "}
                {translate("optimizer.appsDetected", language)}
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
                        <span>
                          {translate("optimizer.deepCleanBtn", language)}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ghost Eradicator Tab Content */}
      {activeTab === "eradicator" && (
        <div className="space-y-4">
          {/* Feature Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-danger/30 bg-gradient-to-r from-danger/10 via-surface to-surface p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/20 text-danger border border-danger/30 shadow-inner">
                  <Ghost className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text">
                      Ghost Eradicator (Total Oblivion Purge)
                    </span>
                    <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger uppercase tracking-wider">
                      Zero-Trace
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 max-w-xl">
                    {translate("optimizer.eradicatorSubtitle", language)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => customFileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-text hover:bg-surface-2 active:scale-95 transition-all shrink-0"
              >
                <FileSearch className="h-4 w-4 text-primary" />
                <span>{translate("optimizer.browseCustomFile", language)}</span>
              </button>
            </div>
          </div>

          {/* Custom Path Input Bar */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm">
            <input
              type="text"
              placeholder="Or enter path to audit & eradicate (e.g. C:\Program Files\App or D:\tool.exe)..."
              value={customEradicatePath}
              onChange={(e) => setCustomEradicatePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomPathAudit();
              }}
              className="flex-1 bg-transparent px-3 py-1 text-xs text-text placeholder-text-muted focus:outline-none"
            />
            <button
              onClick={handleCustomPathAudit}
              disabled={isAuditing || !customEradicatePath.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 shrink-0"
            >
              {isAuditing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSearch className="h-3.5 w-3.5" />
              )}
              <span>Audit Path</span>
            </button>
          </div>

          {/* Filter Chips and Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "All Targets" },
                { id: "ram", label: "Running in RAM" },
                { id: "network", label: "Network & Data Usage" },
                { id: "installed", label: "Installed Software" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCandidateFilter(f.id as typeof candidateFilter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
                    candidateFilter === f.id
                      ? "bg-primary text-white font-semibold shadow-sm"
                      : "bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <input
                type="text"
                placeholder={translate("optimizer.searchTargets", language)}
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Candidates List */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            {isLoadingCandidates ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
                <span className="text-xs font-medium text-text">
                  Auditing running processes, network firewall usage, and software...
                </span>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                No matching target found. Pick any file manually using the button above.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredCandidates.map((cand) => (
                  <div
                    key={cand.id}
                    className="flex items-center justify-between p-4 hover:bg-surface-2/40 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${
                          cand.category === "Running in RAM"
                            ? "bg-danger/10 text-danger border-danger/20"
                            : cand.category === "Network & Data Usage"
                              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                              : "bg-surface-2 text-primary border-border"
                        }`}
                      >
                        {cand.category === "Running in RAM" ? (
                          <Cpu className="h-5 w-5" />
                        ) : cand.category === "Network & Data Usage" ? (
                          <Radio className="h-5 w-5" />
                        ) : (
                          <Ghost className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text truncate">
                            {cand.name}
                          </span>
                          <span className="text-[10px] rounded bg-surface-2 px-1.5 py-0.5 text-text-muted shrink-0 font-mono">
                            {cand.exe_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5 truncate">
                          <span className="text-[11px] font-medium text-primary">
                            {cand.category}
                          </span>
                          {cand.ram_usage_formatted && (
                            <>
                              <span>•</span>
                              <span className="text-danger font-semibold">
                                {cand.ram_usage_formatted} RAM
                              </span>
                            </>
                          )}
                          {cand.pid && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px]">
                                PID: {cand.pid}
                              </span>
                            </>
                          )}
                          {cand.path && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[220px] font-mono text-[11px]">
                                {cand.path}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleStartEradication(cand)}
                        className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 hover:bg-danger text-danger hover:text-white px-3.5 py-2 text-xs font-semibold active:scale-95 transition-all shadow-sm"
                        title="Purge all RAM, disk, registry, and execution traces"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>
                          {translate("optimizer.eradicateBtn", language)}
                        </span>
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
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-6">
          {memoryMessage && (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-medium text-success transition-all animate-in fade-in">
              <Check className="h-4 w-4 shrink-0" />
              <span>{memoryMessage}</span>
            </div>
          )}

          {/* Performance Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-1.5">
              <span className="text-xs text-text-muted font-medium">Physical RAM Load</span>
              <div className="text-lg font-bold text-text">
                {perfMetrics ? `${perfMetrics.ram_used_percent.toFixed(0)}%` : "48%"}
              </div>
              <p className="text-[11px] text-text-muted">
                {perfMetrics
                  ? `${(perfMetrics.ram_used_mb / 1024).toFixed(1)} GB used of ${(perfMetrics.ram_total_mb / 1024).toFixed(1)} GB`
                  : "Memory load normal"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-1.5">
              <span className="text-xs text-text-muted font-medium">System Drive (C:)</span>
              <div className="text-lg font-bold text-text">
                {perfMetrics ? `${perfMetrics.disk_used_percent.toFixed(0)}%` : "52%"}
              </div>
              <p className="text-[11px] text-text-muted">
                {perfMetrics
                  ? `${perfMetrics.disk_used_gb.toFixed(0)} GB used of ${perfMetrics.disk_total_gb.toFixed(0)} GB`
                  : "Ample free storage available"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-1.5">
              <span className="text-xs text-text-muted font-medium">Processor Activity</span>
              <div className="text-lg font-bold text-text">
                {perfMetrics ? `${perfMetrics.cpu_usage_percent.toFixed(1)}%` : "12.0%"}
              </div>
              <p className="text-[11px] text-text-muted">Low background load</p>
            </div>
          </div>

          {/* RAM Working Set Gauge */}
          <div className="space-y-2 rounded-xl border border-border/80 bg-surface-2/20 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                Physical Memory Utilization
              </span>
              <span className="font-mono font-bold text-text">
                {perfMetrics
                  ? `${perfMetrics.ram_used_percent.toFixed(1)}%`
                  : "48.0%"}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{
                  width: `${perfMetrics ? Math.min(100, perfMetrics.ram_used_percent) : 48}%`,
                }}
              />
            </div>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Windows maintains working sets for all active background services and apps.
            Clicking Boost RAM commands the Windows memory manager to compact inactive
            working sets and reclaim unneeded memory back to the global standby pool.
          </p>

          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={handleTuneMemory}
              disabled={isTuningMemory}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-primary/90 active:scale-95 transition-all shadow-sm disabled:opacity-60"
            >
              {isTuningMemory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {isTuningMemory ? "Compacting Working Sets..." : "Boost RAM & Free Memory"}
            </button>

            <button
              onClick={() => {
                getSystemPerformance()
                  .then((m) => setPerfMetrics(m))
                  .catch(() => {});
              }}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5 text-text-muted" />
              Refresh Metrics
            </button>
          </div>
        </div>
      )}

      {/* Deep Uninstaller Modal Dialog */}
      {selectedAppForClean && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
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

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedAppForClean.uninstall_string && (
                <div className="rounded-xl border border-border/70 bg-surface-2/30 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-text">
                        Step 1 (Optional): Standard Vendor Uninstaller
                      </h4>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Trigger the vendor uninstaller first, or proceed straight to residue eradication.
                      </p>
                    </div>
                    <button
                      onClick={handleRunOfficialUninstaller}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {translate("optimizer.officialUninstallBtn", language)}
                      </span>
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

            <div className="border-t border-border px-6 py-4 bg-surface-2/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Selected for removal:{" "}
                <strong className="text-text font-semibold">
                  {selectedLeftoverIds.size} items (
                  {formatBytes(selectedLeftoverBytes)})
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
                    <span>
                      {translate("optimizer.deleteSelectedTraces", language)}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ghost Eradicator Oblivion Modal Dialog */}
      {selectedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-danger/40 bg-surface shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-danger/10">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/20 text-danger border border-danger/30 shadow-inner">
                  <Ghost className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-text truncate">
                      {selectedTarget.name}
                    </h3>
                    <span className="rounded-md bg-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger uppercase tracking-wider">
                      Oblivion Eradication
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    <span className="font-mono">{selectedTarget.exe_name}</span>
                    <span>•</span>
                    <span>{selectedTarget.category}</span>
                    {selectedTarget.ram_usage_formatted && (
                      <>
                        <span>•</span>
                        <span className="text-danger font-semibold">
                          {selectedTarget.ram_usage_formatted} RAM
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedTarget(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Oblivion Banner */}
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-danger uppercase tracking-wider">
                      Total Zero-Trace System Purge
                    </h4>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      This operation will terminate all running instances from RAM, purge all UserAssist and Prefetch execution history, delete all Windows Firewall network records, and shred every residual file and registry key. It will be as if this program never existed on this PC.
                    </p>
                  </div>
                </div>
              </div>

              {eradicationResult && (
                <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-medium text-success animate-in fade-in">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-sm font-bold text-success mb-1">
                      Oblivion Eradication Complete
                    </strong>
                    <p className="leading-relaxed">{eradicationResult.message}</p>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-text">
                    Detected System Footprints & Forensic Traces
                  </h4>
                  {auditReport && auditReport.items.length > 0 && (
                    <button
                      onClick={handleSelectAllEradicationItems}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {selectedItemIds.size === auditReport.items.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  )}
                </div>

                {isAuditing ? (
                  <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-border bg-surface-2/20 text-center">
                    <Loader2 className="h-6 w-6 text-danger animate-spin mb-2" />
                    <span className="text-xs font-medium text-text">
                      Auditing RAM working set, Prefetch files, UserAssist telemetry, and Firewall rules...
                    </span>
                  </div>
                ) : auditReport && auditReport.items.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {auditReport.items.map((item) => {
                      const isChecked = selectedItemIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start justify-between gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                            isChecked
                              ? "border-danger/40 bg-surface-2/70"
                              : "border-border/60 bg-surface-2/20 hover:bg-surface-2/40"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                handleToggleEradicationItem(item.id)
                              }
                              className="h-4 w-4 mt-0.5 rounded border-border text-danger cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                    item.layer === "Active RAM"
                                      ? "bg-danger/20 text-danger border-danger/30"
                                      : item.layer === "Filesystem"
                                        ? "bg-primary/20 text-primary border-primary/30"
                                        : item.layer === "Execution History"
                                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                          : item.layer === "Network & Firewall"
                                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                                            : "bg-surface text-text-muted border-border"
                                  }`}
                                >
                                  {item.layer}
                                </span>
                                <span className="text-xs font-semibold text-text truncate">
                                  {item.title}
                                </span>
                              </div>
                              <span
                                className="text-xs font-mono text-text-muted block truncate"
                                title={item.path_or_key}
                              >
                                {item.path_or_key}
                              </span>
                              <span className="text-[11px] text-text-muted block mt-0.5">
                                {item.detail}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-text-muted bg-surface px-2 py-0.5 rounded shrink-0">
                            {item.size_formatted}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                    No active traces found for this target. The application is completely wiped or absent.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border px-6 py-4 bg-surface-2/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Selected for total purge:{" "}
                <strong className="text-text font-semibold">
                  {selectedItemIds.size} items ({formatBytes(selectedAuditBytes)})
                </strong>
              </span>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setSelectedTarget(null)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 transition-all"
                >
                  Cancel
                </button>

                {confirmOblivionPrompt ? (
                  <div className="flex items-center gap-2 animate-in fade-in">
                    <span className="text-xs text-danger font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Zero-trace wipe?
                    </span>
                    <button
                      onClick={handleExecuteOblivion}
                      disabled={isEradicating}
                      className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-danger/90 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {isEradicating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Yes, Wipe All Traces"
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmOblivionPrompt(false)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-surface-2"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmOblivionPrompt(true)}
                    disabled={
                      isEradicating ||
                      selectedItemIds.size === 0 ||
                      isAuditing
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-danger px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-danger/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEradicating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    <span>{translate("optimizer.executeOblivion", language)}</span>
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
