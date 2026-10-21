import { ShieldCheck, HardDrive, Cpu, Activity, Sparkles, CheckCircle2 } from "lucide-react";
import HealthRing from "../components/HealthRing";
import StatCard from "../components/StatCard";
import { useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";

export default function Dashboard() {
  const { language } = useAppStore();

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

      {/* Hero Card */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-6">
          <HealthRing score={94} size={110} strokeWidth={9} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-text">
                {translate("dashboard.healthTitle", language)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-3 w-3" />
                Good
              </span>
            </div>
            <p className="mt-1 text-sm text-text-muted max-w-md">
              {translate("dashboard.goodShape", language)}
            </p>
          </div>
        </div>

        <button className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-all hover:shadow">
          <Sparkles className="h-4 w-4" />
          {translate("dashboard.smartFix", language)}
        </button>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={translate("dashboard.protectionStatus", language)}
          value={translate("dashboard.active", language)}
          subtext={translate("dashboard.lastScan", language)}
          icon={ShieldCheck}
        />
        <StatCard
          title={translate("dashboard.junkFound", language)}
          value="1.4 GB"
          subtext="Temporary junk safe to clean"
          icon={HardDrive}
        />
        <StatCard
          title={translate("dashboard.startupApps", language)}
          value={translate("dashboard.startupCount", language)}
          subtext="2 heavy impact apps"
          icon={Cpu}
        />
        <StatCard
          title={translate("dashboard.memoryUsage", language)}
          value={translate("dashboard.memoryUsed", language)}
          subtext="Budget: under 30 MB idle"
          icon={Activity}
        />
      </div>

      {/* Recent Activity Section */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text">
          {translate("dashboard.recentActivity", language)}
        </h2>
        <div className="mt-4 divide-y divide-border/60">
          {[
            {
              event: "Scanned download: VSCodeUserSetup-x64.exe",
              result: "Clean",
              time: "4 mins ago",
            },
            {
              event: "Background cleaner: Temp cache evaluated",
              result: "1.4 GB found",
              time: "1 hour ago",
            },
            {
              event: "Download sentinel initialized",
              result: "Active",
              time: "Today, 04:00 AM",
            },
          ].map((act, idx) => (
            <div key={idx} className="flex items-center justify-between py-3 text-xs">
              <span className="text-text font-medium">{act.event}</span>
              <div className="flex items-center gap-4 text-text-muted">
                <span className="rounded bg-surface-2 px-2 py-0.5 text-text">
                  {act.result}
                </span>
                <span>{act.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
