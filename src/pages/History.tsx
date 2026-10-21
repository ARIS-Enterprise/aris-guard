import { useState } from "react";
import { History as HistoryIcon, ShieldCheck, Sparkles, Sliders } from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function History() {
  const { language } = useAppStore();
  const [filter, setFilter] = useState<"all" | "scans" | "cleans" | "startup">("all");

  const events = [
    {
      type: "scans",
      title: "File Scanned: VSCodeUserSetup-x64.exe",
      detail: "Clean verdict verified via Microsoft Defender & Authenticode",
      time: "10 mins ago",
      icon: ShieldCheck,
    },
    {
      type: "cleans",
      title: "Temporary Files Cleaned",
      detail: "Deleted 412 obsolete cache items older than 24h (Freed 820 MB)",
      time: "2 hours ago",
      icon: Sparkles,
    },
    {
      type: "startup",
      title: "Startup Entry Adjusted",
      detail: "Disabled Spotify background autostart (Reversible)",
      time: "Yesterday",
      icon: Sliders,
    },
  ];

  const filteredEvents = filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("history.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("history.subtitle", language)}
        </p>
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-primary text-white"
                : "border border-border bg-surface text-text-muted hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline List */}
      <div className="rounded-xl border border-border bg-surface shadow-sm divide-y divide-border/60">
        {filteredEvents.map((ev, idx) => {
          const Icon = ev.icon;
          return (
            <div key={idx} className="flex items-start gap-4 p-4 hover:bg-surface-2/30 transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary mt-0.5">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text truncate">
                    {ev.title}
                  </span>
                  <span className="text-xs text-text-muted shrink-0">{ev.time}</span>
                </div>
                <p className="mt-1 text-xs text-text-muted">{ev.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs text-text-muted py-2">
        <HistoryIcon className="inline h-3.5 w-3.5 mr-1" />
        All history events are stored locally in your SQLite database.
      </div>
    </div>
  );
}
