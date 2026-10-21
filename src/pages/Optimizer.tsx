import { useState } from "react";
import { HardDrive, Play, Eye, Sparkles } from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function Optimizer() {
  const { language } = useAppStore();
  const [activeTab, setActiveTab] = useState<"cleaner" | "startup" | "memory">("cleaner");

  const categories = [
    { id: "user_temp", labelKey: "optimizer.userTemp", size: "840 MB", defaultChecked: true },
    { id: "thumbnails", labelKey: "optimizer.thumbnails", size: "320 MB", defaultChecked: true },
    { id: "crash_dumps", labelKey: "optimizer.crashDumps", size: "180 MB", defaultChecked: true },
    { id: "wer_reports", labelKey: "optimizer.werReports", size: "65 MB", defaultChecked: true },
  ];

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
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-text mb-4">
              Select Safe Cleanup Targets
            </h2>
            <div className="space-y-3">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/40 p-3.5 hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      defaultChecked={cat.defaultChecked}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                    />
                    <span className="text-sm font-medium text-text">
                      {translate(cat.labelKey, language)}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-text-muted bg-surface px-2.5 py-1 rounded">
                    {cat.size}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-border">
              <span className="text-xs text-text-muted">
                Total recoverable estimate: <strong className="text-text font-semibold">1.4 GB</strong>
              </span>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text hover:bg-border transition-colors">
                  <Eye className="h-3.5 w-3.5" />
                  {translate("optimizer.previewBtn", language)}
                </button>
                <button className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors">
                  <Play className="h-3.5 w-3.5" />
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
              {[
                { name: "Discord", publisher: "Discord Inc.", impact: "High", enabled: true },
                { name: "Spotify", publisher: "Spotify AB", impact: "Medium", enabled: true },
                { name: "Microsoft Teams", publisher: "Microsoft Corporation", impact: "High", enabled: false },
                { name: "ARIS Guard Tray", publisher: "ARIS", impact: "Minimal", enabled: true, locked: true },
              ].map((item, idx) => (
                <tr key={idx} className="hover:bg-surface-2/40 transition-colors">
                  <td className="px-5 py-3 font-medium text-text">{item.name}</td>
                  <td className="px-5 py-3 text-text-muted">{item.publisher}</td>
                  <td className="px-5 py-3">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                      {item.impact}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="checkbox"
                      defaultChecked={item.enabled}
                      disabled={item.locked}
                      className="h-4 w-4 rounded border-border text-primary"
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
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-primary" />
              <div>
                <span className="text-sm font-semibold text-text">RAM Working Set</span>
                <p className="text-xs text-text-muted">Agent running well within ≤ 30 MB budget</p>
              </div>
            </div>
            <span className="text-sm font-bold text-success">24.6 MB / 30 MB budget</span>
          </div>
          <div className="h-3 w-full rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: "24%" }} />
          </div>
          <p className="text-xs text-text-muted">
            Closing the ARIS Guard window destroys the WebView2 renderer, reducing memory consumption to idle levels.
          </p>
          <div className="pt-2">
            <button className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text hover:bg-border transition-colors">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Tune Active Processes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
