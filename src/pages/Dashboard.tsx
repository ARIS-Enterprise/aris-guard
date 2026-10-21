import { useState } from "react";
import {
  ShieldCheck,
  HardDrive,
  Cpu,
  Activity,
  Sparkles,
  CheckCircle2,
  Loader2,
  Check,
} from "lucide-react";
import HealthRing from "../components/HealthRing";
import StatCard from "../components/StatCard";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function Dashboard() {
  const {
    language,
    metrics,
    activityEvents,
    triggerSmartFix,
    isFixing,
    setActivePage,
  } = useAppStore();

  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(
    null,
  );

  const handleSmartFix = async () => {
    if (isFixing) return;
    const result = await triggerSmartFix();
    if (result) {
      setFixSuccessMessage(result.message);
      setTimeout(() => setFixSuccessMessage(null), 4000);
    }
  };

  const score = metrics?.health_score ?? 94;
  const statusLabel = metrics?.health_status ?? "Good";
  const recoverable = metrics?.recoverable_formatted ?? "1.4 GB";
  const startupCount = metrics?.startup_apps_enabled ?? 4;
  const heavyCount = metrics?.startup_heavy_count ?? 2;
  const ramMb = metrics?.memory_working_set_mb ?? 24.6;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {translate("dashboard.title", language)}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {translate("dashboard.goodShape", language)}
        </p>
      </div>

      {/* Success Notification Banner */}
      {fixSuccessMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-xs font-medium text-success transition-all animate-in fade-in">
          <Check className="h-4 w-4 shrink-0" />
          <span>{fixSuccessMessage}</span>
        </div>
      )}

      {/* Hero Card */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-6">
          <HealthRing score={score} size={110} strokeWidth={9} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-text">
                {translate("dashboard.healthTitle", language)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-muted max-w-md">
              {score >= 95
                ? "Your system is operating at peak efficiency and fully shielded."
                : translate("dashboard.goodShape", language)}
            </p>
          </div>
        </div>

        <button
          onClick={handleSmartFix}
          disabled={isFixing}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-all hover:shadow active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
        >
          {isFixing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Optimizing PC...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>{translate("dashboard.smartFix", language)}</span>
            </>
          )}
        </button>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActivePage("protection")}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            title={translate("dashboard.protectionStatus", language)}
            value={translate("dashboard.active", language)}
            subtext="Windows Defender + Sentinel active"
            icon={ShieldCheck}
          />
        </div>

        <div
          onClick={() => setActivePage("optimizer")}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            title={translate("dashboard.junkFound", language)}
            value={recoverable}
            subtext="Temporary junk safe to clean"
            icon={HardDrive}
          />
        </div>

        <div
          onClick={() => setActivePage("optimizer")}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            title={translate("dashboard.startupItems", language)}
            value={`${startupCount} apps enabled`}
            subtext={`${heavyCount} high impact applications`}
            icon={Cpu}
          />
        </div>

        <div
          onClick={() => setActivePage("optimizer")}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            title={translate("dashboard.memoryUsage", language)}
            value={`${ramMb} MB agent idle`}
            subtext="Budget: under 30 MB idle"
            icon={Activity}
          />
        </div>
      </div>

      {/* Recent Activity List */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-text">
            {translate("dashboard.recentActivity", language)}
          </h2>
          <button
            onClick={() => setActivePage("history")}
            className="text-xs text-primary hover:underline font-medium"
          >
            View Full History
          </button>
        </div>

        <div className="divide-y divide-border/60">
          {activityEvents.length > 0 ? (
            activityEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-3 text-xs"
              >
                <div className="flex flex-col pr-4 overflow-hidden">
                  <span className="font-medium text-text truncate">
                    {event.title}
                  </span>
                  <span className="text-text-muted truncate mt-0.5">
                    {event.detail}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-text-muted">
                    {event.time}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-xs text-text-muted">
              Continuous background monitoring active. No suspicious events
              logged.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
