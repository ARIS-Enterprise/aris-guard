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

export interface SystemHealthMetrics {
  health_score: number;
  health_status: string;
  protection_active: boolean;
  last_scan_label: string;
  recoverable_bytes: number;
  recoverable_formatted: string;
  startup_apps_enabled: number;
  startup_heavy_count: number;
  memory_working_set_mb: number;
  memory_budget_mb: number;
}

export interface ScanResultItem {
  id: string;
  path: string;
  file_name: string;
  sha256: string;
  size_bytes: number;
  size_formatted: string;
  verdict: "clean" | "suspicious" | "malicious";
  score: number;
  reasons: string[];
  engines: string[];
  scanned_at: string;
  action: string;
}

export interface CleanupCategoryInfo {
  id: string;
  name: string;
  description: string;
  file_count: number;
  size_bytes: number;
  size_formatted: string;
  default_checked: boolean;
}

export interface CleanupSummary {
  total_files: number;
  total_bytes: number;
  total_formatted: string;
  categories: CleanupCategoryInfo[];
}

export interface CleanupResult {
  cleaned_files: number;
  reclaimed_bytes: number;
  reclaimed_formatted: string;
  message: string;
}

export interface StartupAppItem {
  id: string;
  name: string;
  path: string;
  publisher: string;
  impact: string;
  enabled: boolean;
  locked: boolean;
}

export interface ActivityEvent {
  id: string;
  event_type: "scans" | "cleans" | "startup" | "system";
  title: string;
  detail: string;
  time: string;
}

export async function getSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>("get_settings");
}

export async function setSettings(settings: AppSettings): Promise<void> {
  return await invoke<void>("set_settings", { newSettings: settings });
}

export async function getHealthMetrics(): Promise<SystemHealthMetrics> {
  return await invoke<SystemHealthMetrics>("get_health_metrics");
}

export async function scanFilePath(path: string): Promise<ScanResultItem> {
  return await invoke<ScanResultItem>("scan_file_path", { path });
}

export async function scanFilePayload(
  fileName: string,
  fileSize: number,
  contentBase64?: string,
): Promise<ScanResultItem> {
  return await invoke<ScanResultItem>("scan_file_payload", {
    fileName,
    fileSize,
    contentBase64,
  });
}

export async function getRecentScans(): Promise<ScanResultItem[]> {
  return await invoke<ScanResultItem[]>("get_recent_scans");
}

export async function previewCleanup(): Promise<CleanupSummary> {
  return await invoke<CleanupSummary>("preview_cleanup");
}

export async function runCleanup(categories: string[]): Promise<CleanupResult> {
  return await invoke<CleanupResult>("run_cleanup", { categories });
}

export async function runSmartFix(): Promise<CleanupResult> {
  return await invoke<CleanupResult>("run_smart_fix");
}

export async function getStartupItems(): Promise<StartupAppItem[]> {
  return await invoke<StartupAppItem[]>("get_startup_items");
}

export async function toggleStartupItem(
  name: string,
  enabled: boolean,
): Promise<void> {
  return await invoke<void>("toggle_startup_item", { name, enabled });
}

export async function getActivityHistory(): Promise<ActivityEvent[]> {
  return await invoke<ActivityEvent[]>("get_activity_history");
}
