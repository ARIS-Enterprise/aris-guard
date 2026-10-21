import { create } from "zustand";
import { AppSettings, getSettings, setSettings } from "./ipc";
import { Language } from "./i18n";

export type NavPage =
  | "dashboard"
  | "protection"
  | "optimizer"
  | "quarantine"
  | "history"
  | "settings";

interface AppState {
  activePage: NavPage;
  language: Language;
  theme: "system" | "dark" | "light";
  settings: AppSettings | null;
  loading: boolean;
  setActivePage: (page: NavPage) => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: "system" | "dark" | "light") => void;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: AppSettings) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  activePage: "dashboard",
  language: "en",
  theme: "dark",
  settings: null,
  loading: true,

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
      // System default
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
      // apply theme
      const root = document.documentElement;
      if (settings.theme === "light") {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      } else {
        root.classList.add("dark");
        root.removeAttribute("data-theme");
      }
    } catch (err) {
      console.error("Failed to load settings from Rust core:", err);
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
}));
