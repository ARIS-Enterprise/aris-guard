import {
  LayoutDashboard,
  ShieldCheck,
  Zap,
  Download,
  Lock,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { NavPage, useAppStore } from "../lib/store";
import { translate } from "../lib/i18n";
import logoUrl from "../assets/arisai.png";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { activePage, setActivePage, language } = useAppStore();

  const navItems: { id: NavPage; labelKey: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { id: "protection", labelKey: "nav.protection", icon: ShieldCheck },
    { id: "optimizer", labelKey: "nav.optimizer", icon: Zap },
    { id: "downloader", labelKey: "nav.downloader", icon: Download },
    { id: "quarantine", labelKey: "nav.quarantine", icon: Lock },
    { id: "history", labelKey: "nav.history", icon: History },
    { id: "settings", labelKey: "nav.settings", icon: Settings },
  ];

  return (
    <aside
      className={`relative flex flex-col border-r border-border bg-surface transition-all duration-200 select-none ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div
        className={`flex h-16 items-center gap-3 border-b border-border ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden ring-1 ring-border shadow-sm bg-surface-2">
          <img
            src={logoUrl}
            alt="ARIS Guard"
            className="h-full w-full object-cover rounded-full"
            onError={(e) => {
              e.currentTarget.src = "/logo.png";
            }}
          />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold tracking-tight text-text truncate">
              ARIS Guard
            </span>
            <span className="text-xs text-text-muted truncate">PC Sentinel</span>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1.5 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:bg-surface-2 hover:text-text active:scale-[0.98]"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? translate(item.labelKey, language) : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="truncate">{translate(item.labelKey, language)}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-20 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2 text-text-muted shadow-sm hover:text-text active:scale-95 transition-transform"
        title="Toggle sidebar"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Bottom Footer */}
      <div className="border-t border-border p-4 text-xs text-text-muted">
        {!collapsed ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>{translate("nav.version", language)}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono">
                MIT
              </span>
            </div>
            <span className="text-[11px] text-text-muted/80">
              {translate("nav.openSource", language)}
            </span>
          </div>
        ) : (
          <div className="text-center font-mono text-[10px]">0.1</div>
        )}
      </div>
    </aside>
  );
}
