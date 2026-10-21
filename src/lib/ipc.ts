import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  watch_folders: string[];
  scan_on_download: boolean;
  auto_quarantine: "ask" | "always" | "never";
  online_lookups: boolean;
  clamav_enabled: "auto" | "enabled" | "disabled";
  cleaner_on_startup: boolean;
  cleaner_categories: string[];
  cleaner_min_age_hours: number;
  startup_suggestions: boolean;
  notifications: boolean;
  language: "en" | "bn";
  theme: "system" | "dark" | "light";
  start_with_windows: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>("get_settings");
}

export async function setSettings(settings: AppSettings): Promise<void> {
  return await invoke<void>("set_settings", { newSettings: settings });
}
