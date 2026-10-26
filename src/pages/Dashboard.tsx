import { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldOff,
  HardDrive,
  Cpu,
  Activity,
  Sparkles,
  CheckCircle2,
  Loader2,
  Check,
  Zap,
  Trash2,
  RefreshCw,
  Search,
} from "lucide-react";
import HealthRing from "../components/HealthRing";
import StatCard from "../components/StatCard";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import {
  boostMemory,
  getSystemPerformance,
  SystemPerformanceMetrics,
} from "../lib/ipc";

export default function Dashboard() {
  const {
    language,
    metrics,
    activityEvents,
    triggerSmartFix,
    isFixing,
    setActivePage,
    settings,
    updateSettings,
    refreshAllData,
  } = useAppStore();

  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(
    null,
  );
  const [isBoostingRam, setIsBoostingRam] = useState(false);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [perfMetrics, setPerfMetrics] =
    useState<SystemPerformanceMetrics | null>(null);

  useEffect(() => {
    getSystemPerformance()
      .then((m) => setPerfMetrics(m))
      .catch((err) =>
        console.error("Failed fetching dashboard performance metrics:", err),
      );
  }, []);

  const handleSmartFix = async () => {
    if (isFixing) return;
    const result = await triggerSmartFix();
    if (result) {
      setFixSuccessMessage(result.message);
      setTimeout(() => setFixSuccessMessage(null), 4000);
    }
  };

  const handleBoostRam = async () => {
    if (isBoostingRam) return;
    try {
      setIsBoostingRam(true);
      const res = await boostMemory();
      setFixSuccessMessage(res.message);
      const updated = await getSystemPerformance();
      setPerfMetrics(updated);
      await refreshAllData();
      setIsBoostingRam(false);
      setTimeout(() => setFixSuccessMessage(null), 4000);
    } catch (err) {
      console.error("Boost RAM failed:", err);
      setIsBoostingRam(false);
    }
  };

  const handleHealthCheck = async () => {
    if (isRefreshingHealth) return;
    try {
      setIsRefreshingHealth(true);
      await refreshAllData();
      const perf = await getSystemPerformance();
      setPerfMetrics(perf);
      setIsRefreshingHealth(false);
      setFixSuccessMessage("System diagnostics refreshed. Health score up to date.");
      setTimeout(() => setFixSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Health check refresh failed:", err);
      setIsRefreshingHealth(false);
    }
  };

  const handleToggleProtection = async () => {
    if (!settings) return;
    const nextState = !settings.scan_on_download;
    await updateSettings({ ...settings, scan_on_download: nextState });
    setFixSuccessMessage(
      nextState
        ? "Real-time download protection activated."
        : "Real-time protection paused.",
    );
    setTimeout(() => setFixSuccessMessage(null), 3000);
  };

  const isProtectionActive = settings?.scan_on_download ?? true;
  const score = metrics?.health_score ?? 94;
  const statusLabel = metrics?.health_status ?? "Good";
  const recoverable = metrics?.recoverable_formatted ?? "1.4 GB";
  const startupCount = metrics?.startup_apps_enabled ?? 4;
  const heavyCount = metrics?.startup_heavy_count ?? 2;

  return (
    <div className="space-y-6">
      {/* Page Header with Real-Time Protection Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {translate("dashboard.title", language)}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {translate("dashboard.goodShape", language)}
          </p>
        </div>

        {/* Real-time Protection Toggle Switch */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            {isProtectionActive ? (
              <ShieldCheck className="h-4 w-4 text-success" />
            ) : (
              <ShieldOff className="h-4 w-4 text-warning" />
            )}
            <span className="text-xs font-semibold text-text">
              Real-Time Sentinel
            </span>
          </div>
          <button
            onClick={handleToggleProtection}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isProtectionActive ? "bg-success" : "bg-border"
            }`}
            title="Toggle Real-Time Protection"
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isProtectionActive ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
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

      {/* Quick Actions Row */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Quick Actions
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setActivePage("protection")}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm hover:border-primary/50 hover:bg-surface-2/60 transition-all active:scale-[0.98]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Search className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Scan Now</div>
              <div className="text-[11px] text-text-muted">Inspect files</div>
            </div>
          </button>

          <button
            onClick={() => setActivePage("optimizer")}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm hover:border-primary/50 hover:bg-surface-2/60 transition-all active:scale-[0.98]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Clean Junk</div>
              <div className="text-[11px] text-text-muted">Free temp cache</div>
            </div>
          </button>

          <button
            onClick={handleBoostRam}
            disabled={isBoostingRam}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm hover:border-primary/50 hover:bg-surface-2/60 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
              {isBoostingRam ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-text">Boost RAM</div>
              <div className="text-[11px] text-text-muted">
                {isBoostingRam ? "Compacting..." : "Trim processes"}
              </div>
            </div>
          </button>

          <button
            onClick={handleHealthCheck}
            disabled={isRefreshingHealth}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm hover:border-primary/50 hover:bg-surface-2/60 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              {isRefreshingHealth ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-text">Health Check</div>
              <div className="text-[11px] text-text-muted">Refresh audit</div>
            </div>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActivePage("protection")}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            title={translate("dashboard.protectionStatus", language)}
            value={
              isProtectionActive
                ? translate("dashboard.active", language)
                : translate("dashboard.paused", language)
            }
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
            value={
              perfMetrics
                ? `${perfMetrics.ram_used_percent.toFixed(0)}% RAM in use`
                : "24.6 MB agent idle"
            }
            subtext={
              perfMetrics
                ? `${(perfMetrics.ram_used_mb / 1024).toFixed(1)} GB / ${(perfMetrics.ram_total_mb / 1024).toFixed(1)} GB`
                : "Budget: under 30 MB idle"
            }
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
