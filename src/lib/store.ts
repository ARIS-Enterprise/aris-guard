import { create } from "zustand";
import {
  AppSettings,
  getSettings,
  setSettings,
  SystemHealthMetrics,
  getHealthMetrics,
  ScanResultItem,
  getRecentScans,
  StartupAppItem,
  getStartupItems,
  ActivityEvent,
  getActivityHistory,
  runSmartFix,
  CleanupResult,
} from "./ipc";
import { Language } from "./i18n";

export type NavPage =
  | "dashboard"
  | "protection"
  | "optimizer"
  | "downloader"
  | "quarantine"
  | "history"
  | "settings";

interface AppState {
  activePage: NavPage;
  language: Language;
  theme: "system" | "dark" | "light";
  settings: AppSettings | null;
  metrics: SystemHealthMetrics | null;
  recentScans: ScanResultItem[];
  startupItems: StartupAppItem[];
  activityEvents: ActivityEvent[];
  loading: boolean;
  isFixing: boolean;

  setActivePage: (page: NavPage) => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: "system" | "dark" | "light") => void;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: AppSettings) => Promise<void>;
  refreshAllData: () => Promise<void>;
  triggerSmartFix: () => Promise<CleanupResult | null>;
  addScanResult: (item: ScanResultItem) => void;
  removeScanResult: (id: string) => void;
  clearRecentScans: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activePage: "dashboard",
  language: "en",
  theme: "dark",
  settings: null,
  metrics: null,
  recentScans: [],
  startupItems: [],
  activityEvents: [],
  loading: true,
  isFixing: false,

  setActivePage: (activePage) => set({ activePage }),

  setLanguage: (language) => {
    set({ language });
    const settings = get().settings;
    if (settings && settings.language !== language) {
      get().updateSettings({ ...settings, language });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.removeAttribute("data-theme");
    } else if (theme === "light") {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    } else {
      root.classList.add("dark");
      root.removeAttribute("data-theme");
    }
    const settings = get().settings;
    if (settings && settings.theme !== theme) {
      get().updateSettings({ ...settings, theme });
    }
  },

  fetchSettings: async () => {
    try {
      set({ loading: true });
      const settings = await getSettings();
      set({
        settings,
        language: (settings.language as Language) || "en",
        theme: settings.theme as "system" | "dark" | "light",
        loading: false,
      });

      const root = document.documentElement;
      if (settings.theme === "light") {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      } else {
        root.classList.add("dark");
        root.removeAttribute("data-theme");
      }

      await get().refreshAllData();
    } catch (err) {
      console.error("Failed to load settings:", err);
      set({ loading: false });
    }
  },

  updateSettings: async (newSettings: AppSettings) => {
    try {
      await setSettings(newSettings);
      set({ settings: newSettings });
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  },

  refreshAllData: async () => {
    try {
      const [metrics, recentScans, startupItems, activityEvents] =
        await Promise.allSettled([
          getHealthMetrics(),
          getRecentScans(),
          getStartupItems(),
          getActivityHistory(),
        ]);

      set({
        metrics: metrics.status === "fulfilled" ? metrics.value : null,
        recentScans:
          recentScans.status === "fulfilled" ? recentScans.value : [],
        startupItems:
          startupItems.status === "fulfilled" ? startupItems.value : [],
        activityEvents:
          activityEvents.status === "fulfilled" ? activityEvents.value : [],
      });
    } catch (err) {
      console.error("Failed refreshing app data:", err);
    }
  },

  triggerSmartFix: async () => {
    try {
      set({ isFixing: true });
      const result = await runSmartFix();
      await get().refreshAllData();
      set({ isFixing: false });
      return result;
    } catch (err) {
      console.error("Smart fix failed:", err);
      set({ isFixing: false });
      return null;
    }
  },

  addScanResult: (item: ScanResultItem) => {
    set((state) => ({
      recentScans: [item, ...state.recentScans.filter((s) => s.id !== item.id)],
    }));
  },

  removeScanResult: (id: string) => {
    set((state) => ({
      recentScans: state.recentScans.filter((s) => s.id !== id),
    }));
  },

  clearRecentScans: () => {
    set({ recentScans: [] });
  },
}));
