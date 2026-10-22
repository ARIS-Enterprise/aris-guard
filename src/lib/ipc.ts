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

export interface ArchiveEntryItem {
  path: string;
  uncompressed_size: number;
  is_executable: boolean;
  is_script: boolean;
  risk_level: "High" | "Medium" | "Low";
  risk_reason?: string;
}

export interface DeepAnalysisInfo {
  file_type: string;
  entropy: number;
  entropy_status: string;
  is_signed: boolean;
  signature_details: string;
  suspicious_apis: string[];
  pe_sections: string[];
  is_packed: boolean;
  packer_name?: string;
  is_archive: boolean;
  archive_format?: string;
  archive_total_files: number;
  archive_compression_ratio: number;
  archive_is_encrypted: boolean;
  archive_has_zip_bomb: boolean;
  archive_has_zip_slip: boolean;
  archive_dangerous_entries: ArchiveEntryItem[];
  safety_verdict: string;
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
  deep_analysis?: DeepAnalysisInfo;
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

export interface InstalledApp {
  id: string;
  name: string;
  version: string;
  publisher: string;
  install_location: string;
  uninstall_string: string;
  quiet_uninstall_string: string;
  estimated_size_bytes: number;
  estimated_size_formatted: string;
  install_date: string;
  registry_source: string;
  registry_key_path: string;
}

export interface AppLeftover {
  id: string;
  kind: "Directory" | "File" | "RegistryKey";
  path: string;
  category: string;
  size_bytes: number;
  size_formatted: string;
  description: string;
  selected: boolean;
}

export interface AppLeftoverScanResult {
  app_id: string;
  app_name: string;
  total_leftovers: number;
  total_bytes: number;
  total_formatted: string;
  leftovers: AppLeftover[];
}

export interface DeepCleanResult {
  app_name: string;
  removed_items: number;
  freed_bytes: number;
  freed_formatted: string;
  errors: string[];
  message: string;
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

export async function listInstalledApps(): Promise<InstalledApp[]> {
  return await invoke<InstalledApp[]>("list_installed_apps");
}

export async function scanAppLeftovers(
  appName: string,
  publisher: string,
  installLocation: string,
): Promise<AppLeftoverScanResult> {
  return await invoke<AppLeftoverScanResult>("scan_app_leftovers", {
    appName,
    publisher,
    installLocation,
  });
}

export async function runOfficialUninstaller(
  uninstallString: string,
): Promise<string> {
  return await invoke<string>("run_official_uninstaller", { uninstallString });
}

export async function deleteAppLeftovers(
  appName: string,
  items: AppLeftover[],
): Promise<DeepCleanResult> {
  return await invoke<DeepCleanResult>("delete_app_leftovers", {
    appName,
    items,
  });
}

