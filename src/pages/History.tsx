import { useState } from "react";
import {
  History as HistoryIcon,
  ShieldCheck,
  Sparkles,
  Sliders,
  Activity,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function History() {
  const { language, activityEvents, refreshAllData } = useAppStore();
  const [filter, setFilter] = useState<"all" | "scans" | "cleans" | "startup">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllData();
    setIsRefreshing(false);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "scans":
        return ShieldCheck;
      case "cleans":
        return Sparkles;
      case "startup":
        return Sliders;
      default:
        return Activity;
    }
  };

  const filteredEvents =
    filter === "all"
      ? activityEvents
      : activityEvents.filter((e) => e.event_type === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {translate("history.title", language)}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {translate("history.subtitle", language)}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { id: "all", label: translate("history.all", language) },
          { id: "scans", label: translate("history.scans", language) },
          { id: "cleans", label: translate("history.cleans", language) },
          { id: "startup", label: translate("history.startup", language) },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as typeof filter)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filter === f.id
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline List */}
      <div className="rounded-xl border border-border bg-surface shadow-sm divide-y divide-border/60">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((ev) => {
            const Icon = getEventIcon(ev.event_type);
            return (
              <div
                key={ev.id}
                className="flex items-start gap-4 p-4 hover:bg-surface-2/30 transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary mt-0.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text truncate">
                      {ev.title}
                    </span>
                    <span className="text-xs text-text-muted shrink-0 ml-2">
                      {ev.time}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">{ev.detail}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center text-xs text-text-muted">
            No events match the selected category.
          </div>
        )}
      </div>

      <div className="text-center text-xs text-text-muted py-2">
        <HistoryIcon className="inline h-3.5 w-3.5 mr-1" />
        All history events are stored locally in your SQLite database.
      </div>
    </div>
  );
}
