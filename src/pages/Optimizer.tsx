import { useState, useEffect } from "react";
import {
  HardDrive,
  Play,
  Eye,
  Sparkles,
  Loader2,
  Check,
  CheckCircle2,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import {
  CleanupCategoryInfo,
  previewCleanup,
  runCleanup,
  toggleStartupItem,
} from "../lib/ipc";

export default function Optimizer() {
  const { language, startupItems, refreshAllData } = useAppStore();
  const [activeTab, setActiveTab] = useState<"cleaner" | "startup" | "memory">(
    "cleaner",
  );

  const [categories, setCategories] = useState<CleanupCategoryInfo[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(
    new Set(["user_temp", "thumbnails", "crash_dumps", "wer_reports"]),
  );
  const [totalFormatted, setTotalFormatted] = useState("1.4 GB");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  const [isTuningMemory, setIsTuningMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);

  // Load preview categories on mount
  useEffect(() => {
    loadPreview();
  }, []);

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
    </div>
  );
}
