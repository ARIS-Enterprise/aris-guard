use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use windows_registry::{CURRENT_USER, LOCAL_MACHINE};

use crate::cleaner::format_bytes;
use crate::db::Database;
use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub install_location: String,
    pub uninstall_string: String,
    pub quiet_uninstall_string: String,
    pub estimated_size_bytes: u64,
    pub estimated_size_formatted: String,
    pub install_date: String,
    pub registry_source: String,
    pub registry_key_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLeftover {
    pub id: String,
    pub kind: String, // "Directory" | "File" | "RegistryKey"
    pub path: String,
    pub category: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub description: String,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLeftoverScanResult {
    pub app_id: String,
    pub app_name: String,
    pub total_leftovers: usize,
    pub total_bytes: u64,
    pub total_formatted: String,
    pub leftovers: Vec<AppLeftover>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepCleanResult {
    pub app_name: String,
    pub removed_items: usize,
    pub freed_bytes: u64,
    pub freed_formatted: String,
    pub errors: Vec<String>,
    pub message: String,
}

/// Blacklist of root system folders or generic names that must NEVER be deleted as app leftovers.
const PROTECTED_NAMES: &[&str] = &[
    "windows",
    "microsoft",
    "system32",
    "syswow64",
    "program files",
    "program files (x86)",
    "programdata",
    "appdata",
    "local",
    "locallow",
    "roaming",
    "users",
    "desktop",
    "downloads",
    "documents",
    "temp",
    "common files",
    "windows defender",
    "windows nt",
    "internet explorer",
    "google",
    "intel",
    "amd",
    "nvidia",
];

fn is_name_protected(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    if lower.len() < 2 {
        return true;
    }
    PROTECTED_NAMES.iter().any(|&p| p == lower)
}

#[allow(clippy::permissions_set_readonly_false)]
fn strip_readonly_and_remove(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_file() {
        if let Ok(meta) = path.metadata() {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
        return fs::remove_file(path);
    }

    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let sub = entry.path();
                let _ = strip_readonly_and_remove(&sub);
            }
        }
        if let Ok(meta) = path.metadata() {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
        return fs::remove_dir_all(path);
    }

    Ok(())
}

fn calculate_dir_size(path: &Path, max_depth: usize) -> (usize, u64) {
    if max_depth == 0 {
        return (0, 0);
    }
    let mut files_count = 0;
    let mut bytes = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = p.metadata() {
                if meta.is_file() {
                    files_count += 1;
                    bytes += meta.len();
                } else if meta.is_dir() {
                    let (sub_count, sub_bytes) = calculate_dir_size(&p, max_depth - 1);
                    files_count += sub_count;
                    bytes += sub_bytes;
                }
            }
        }
    }

    (files_count, bytes)
}

/// Enumerate all installed desktop applications from 64-bit, 32-bit, and user-level registry hives.
pub fn list_installed_apps() -> Vec<InstalledApp> {
    let mut apps: Vec<InstalledApp> = Vec::new();
    let mut seen_names: HashSet<String> = HashSet::new();

    let hives = [
        (
            &LOCAL_MACHINE,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            "HKLM-64",
        ),
        (
            &LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            "HKLM-32",
        ),
        (
            &CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            "HKCU",
        ),
    ];

    for (root, uninstall_path, source) in hives {
        let key = match root.open(uninstall_path) {
            Ok(k) => k,
            Err(_) => continue,
        };

        let subkeys = match key.keys() {
            Ok(k) => k,
            Err(_) => continue,
        };

        for subkey_name in subkeys {
            let sub = match key.open(&subkey_name) {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Skip Windows system components and parent sub-items
            if sub.get_u32("SystemComponent").unwrap_or(0) == 1 {
                continue;
            }
            if sub.get_string("ParentKeyName").is_ok() {
                continue;
            }

            let display_name = match sub.get_string("DisplayName") {
                Ok(name) if !name.trim().is_empty() => name.trim().to_string(),
                _ => continue,
            };

            // Avoid duplicate entries across hives
            let norm_key = display_name.to_ascii_lowercase();
            if seen_names.contains(&norm_key) {
                continue;
            }
            seen_names.insert(norm_key);

            let version = sub.get_string("DisplayVersion").unwrap_or_default();
            let publisher = sub.get_string("Publisher").unwrap_or_default();
            let install_location = sub.get_string("InstallLocation").unwrap_or_default();
            let uninstall_string = sub.get_string("UninstallString").unwrap_or_default();
            let quiet_uninstall_string = sub.get_string("QuietUninstallString").unwrap_or_default();
            let install_date = sub.get_string("InstallDate").unwrap_or_default();

            // Size estimation from registry (DWORD in KB) or disk inspection
            let size_kb = sub.get_u32("EstimatedSize").unwrap_or(0);
            let mut size_bytes = (size_kb as u64) * 1024;

            if size_bytes == 0 && !install_location.is_empty() {
                let loc_path = PathBuf::from(&install_location);
                if loc_path.is_dir() {
                    let (_, calc_bytes) = calculate_dir_size(&loc_path, 4);
                    size_bytes = calc_bytes;
                }
            }

            let full_reg_path = format!(r"{source}\{uninstall_path}\{subkey_name}");

            apps.push(InstalledApp {
                id: Uuid::new_v4().to_string(),
                name: display_name,
                version,
                publisher,
                install_location,
                uninstall_string,
                quiet_uninstall_string,
                estimated_size_bytes: size_bytes,
                estimated_size_formatted: format_bytes(size_bytes),
                install_date,
                registry_source: source.to_string(),
                registry_key_path: full_reg_path,
            });
        }
    }

    // Sort alphabetically by app name
    apps.sort_by_key(|a| a.name.to_ascii_lowercase());
    apps
}

/// Scan for all residual files, cache folders, AppData, and registry keys left by an application.
pub fn scan_app_leftovers(
    app_name: &str,
    publisher: &str,
    install_location: &str,
) -> AppLeftoverScanResult {
    let mut leftovers: Vec<AppLeftover> = Vec::new();
    let mut scanned_paths: HashSet<String> = HashSet::new();

    let clean_app_name = app_name.trim();
    if clean_app_name.is_empty() || is_name_protected(clean_app_name) {
        return AppLeftoverScanResult {
            app_id: Uuid::new_v4().to_string(),
            app_name: clean_app_name.to_string(),
            total_leftovers: 0,
            total_bytes: 0,
            total_formatted: "0 B".to_string(),
            leftovers: vec![],
        };
    }

    // 1. Primary Install Location check
    if !install_location.trim().is_empty() {
        let p = PathBuf::from(install_location.trim());
        if p.exists() && p.is_dir() {
            // Guard: Must not be drive root or generic Program Files root
            if let Some(parent) = p.parent() {
                if parent.parent().is_some() {
                    let (_, bytes) = calculate_dir_size(&p, 6);
                    let path_str = p.to_string_lossy().to_string();
                    if scanned_paths.insert(path_str.to_ascii_lowercase()) {
                        leftovers.push(AppLeftover {
                            id: Uuid::new_v4().to_string(),
                            kind: "Directory".to_string(),
                            path: path_str,
                            category: "Installation Directory".to_string(),
                            size_bytes: bytes,
                            size_formatted: format_bytes(bytes),
                            description: "Main installation binaries and resource assets"
                                .to_string(),
                            selected: true,
                        });
                    }
                }
            }
        }
    }

    // 2. Base directory search candidates
    let mut candidate_dirs: Vec<(PathBuf, &str, &str)> = Vec::new();

    if let Some(local_app_data) = dirs::data_local_dir() {
        candidate_dirs.push((
            local_app_data.clone(),
            "App Data (Local)",
            "Local cached data, state, and user application assets",
        ));
        candidate_dirs.push((
            local_app_data.join("Programs"),
            "App Data (Programs)",
            "Per-user portable or setup installation folder",
        ));
    }

    if let Some(roaming_app_data) = dirs::config_dir() {
        candidate_dirs.push((
            roaming_app_data,
            "App Data (Roaming)",
            "User configuration profiles, sessions, and roaming preferences",
        ));
    }

    if let Some(home) = dirs::home_dir() {
        let local_low = home.join("AppData").join("LocalLow");
        if local_low.exists() {
            candidate_dirs.push((
                local_low,
                "App Data (LocalLow)",
                "Sandboxed low-integrity app state and telemetry",
            ));
        }
    }

    let program_data = PathBuf::from(r"C:\ProgramData");
    if program_data.exists() {
        candidate_dirs.push((
            program_data,
            "ProgramData",
            "Shared machine-wide application data, databases, and licenses",
        ));
    }

    // Inspect candidate directories for folders matching AppName or Publisher\AppName
    for (base_dir, category, desc) in candidate_dirs {
        if !base_dir.exists() {
            continue;
        }

        // Direct app folder
        let direct_target = base_dir.join(clean_app_name);
        if direct_target.is_dir() {
            let path_str = direct_target.to_string_lossy().to_string();
            if scanned_paths.insert(path_str.to_ascii_lowercase()) {
                let (_, bytes) = calculate_dir_size(&direct_target, 5);
                leftovers.push(AppLeftover {
                    id: Uuid::new_v4().to_string(),
                    kind: "Directory".to_string(),
                    path: path_str,
                    category: category.to_string(),
                    size_bytes: bytes,
                    size_formatted: format_bytes(bytes),
                    description: desc.to_string(),
                    selected: true,
                });
            }
        }

        // Publisher/AppName folder
        let clean_pub = publisher.trim();
        if !clean_pub.is_empty() && !is_name_protected(clean_pub) {
            let pub_target = base_dir.join(clean_pub).join(clean_app_name);
            if pub_target.is_dir() {
                let path_str = pub_target.to_string_lossy().to_string();
                if scanned_paths.insert(path_str.to_ascii_lowercase()) {
                    let (_, bytes) = calculate_dir_size(&pub_target, 5);
                    leftovers.push(AppLeftover {
                        id: Uuid::new_v4().to_string(),
                        kind: "Directory".to_string(),
                        path: path_str,
                        category: category.to_string(),
                        size_bytes: bytes,
                        size_formatted: format_bytes(bytes),
                        description: desc.to_string(),
                        selected: true,
                    });
                }
            }
        }
    }

    // 3. Crash Dumps inspection
    if let Some(local_app_data) = dirs::data_local_dir() {
        let crash_dumps = local_app_data.join("CrashDumps");
        if crash_dumps.is_dir() {
            if let Ok(entries) = fs::read_dir(&crash_dumps) {
                let app_lower = clean_app_name.to_ascii_lowercase();
                for entry in entries.flatten() {
                    let p = entry.path();
                    let fname = p
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_ascii_lowercase();
                    if fname.contains(&app_lower) && p.is_file() {
                        let path_str = p.to_string_lossy().to_string();
                        if scanned_paths.insert(path_str.to_ascii_lowercase()) {
                            let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                            leftovers.push(AppLeftover {
                                id: Uuid::new_v4().to_string(),
                                kind: "File".to_string(),
                                path: path_str,
                                category: "Crash Dumps & Diagnostics".to_string(),
                                size_bytes: size,
                                size_formatted: format_bytes(size),
                                description: "Residual crash memory dumps and diagnostic logs"
                                    .to_string(),
                                selected: true,
                            });
                        }
                    }
                }
            }
        }
    }

    // 4. Windows Registry Traces
    let reg_targets = [
        (&CURRENT_USER, format!(r"Software\{clean_app_name}"), "HKCU"),
        (
            &LOCAL_MACHINE,
            format!(r"Software\{clean_app_name}"),
            "HKLM",
        ),
        (
            &LOCAL_MACHINE,
            format!(r"Software\WOW6432Node\{clean_app_name}"),
            "HKLM-32",
        ),
    ];

    for (hive, sub_path, label) in reg_targets {
        if hive.open(&sub_path).is_ok() {
            let full_reg_path = format!(r"{label}\{sub_path}");
            if scanned_paths.insert(full_reg_path.to_ascii_lowercase()) {
                // Approximate registry footprint: 12 KB per hive tree
                let reg_size: u64 = 12 * 1024;
                leftovers.push(AppLeftover {
                    id: Uuid::new_v4().to_string(),
                    kind: "RegistryKey".to_string(),
                    path: full_reg_path,
                    category: "Windows Registry".to_string(),
                    size_bytes: reg_size,
                    size_formatted: format_bytes(reg_size),
                    description: "Application configuration, keys, and startup preferences"
                        .to_string(),
                    selected: true,
                });
            }
        }
    }

    let total_bytes: u64 = leftovers.iter().map(|l| l.size_bytes).sum();
    let total_formatted = format_bytes(total_bytes);

    AppLeftoverScanResult {
        app_id: Uuid::new_v4().to_string(),
        app_name: clean_app_name.to_string(),
        total_leftovers: leftovers.len(),
        total_bytes,
        total_formatted,
        leftovers,
    }
}

/// Executes official uninstaller if command string exists.
pub fn run_official_uninstaller(uninstall_string: &str) -> Result<String, AppError> {
    let cmd = uninstall_string.trim();
    if cmd.is_empty() {
        return Err(AppError::Validation(
            "No uninstaller command string defined for this application".into(),
        ));
    }

    tracing::info!("Launching official uninstaller: {cmd}");

    // Using start ensures uninstaller GUI launches cleanly without blocking or quote issues
    std::process::Command::new("cmd")
        .args(["/C", "start", "", cmd])
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to invoke official uninstaller: {e}")))?;

    Ok("Official uninstaller launched in background.".to_string())
}

/// Permanently removes selected leftover files, folders, and registry entries.
pub fn delete_app_leftovers(
    app_name: &str,
    items: Vec<AppLeftover>,
    db: &Database,
) -> Result<DeepCleanResult, AppError> {
    let mut removed_items = 0;
    let mut freed_bytes: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for item in items.into_iter().filter(|i| i.selected) {
        if item.kind == "Directory" || item.kind == "File" {
            let p = PathBuf::from(&item.path);
            if !p.exists() {
                continue;
            }

            // Absolute sanity check: path must never be system drive or root
            if let Some(parent) = p.parent() {
                if parent.parent().is_none() {
                    errors.push(format!(
                        "Safety guard prevented deleting top-level path: {}",
                        item.path
                    ));
                    continue;
                }
            }

            match strip_readonly_and_remove(&p) {
                Ok(_) => {
                    removed_items += 1;
                    freed_bytes += item.size_bytes;
                    tracing::info!("Permanently removed leftover path: {}", item.path);
                }
                Err(e) => {
                    tracing::warn!("Failed removing path {}: {e}", item.path);
                    errors.push(format!("{}: {e}", item.path));
                }
            }
        } else if item.kind == "RegistryKey" {
            // Delete registry subkey tree
            let path = &item.path;
            if let Some(sub) = path.strip_prefix(r"HKCU\") {
                if let Some((parent, leaf)) = sub.rsplit_once('\\') {
                    if let Ok(key) = CURRENT_USER.open(parent) {
                        let _ = key.remove_tree(leaf);
                        removed_items += 1;
                        freed_bytes += item.size_bytes;
                    }
                } else if CURRENT_USER.remove_tree(sub).is_ok() {
                    removed_items += 1;
                    freed_bytes += item.size_bytes;
                }
            } else if let Some(sub) = path.strip_prefix(r"HKLM\") {
                if let Some((parent, leaf)) = sub.rsplit_once('\\') {
                    if let Ok(key) = LOCAL_MACHINE.open(parent) {
                        let _ = key.remove_tree(leaf);
                        removed_items += 1;
                        freed_bytes += item.size_bytes;
                    }
                } else if LOCAL_MACHINE.remove_tree(sub).is_ok() {
                    removed_items += 1;
                    freed_bytes += item.size_bytes;
                }
            } else if let Some(sub) = path.strip_prefix(r"HKLM-32\") {
                if let Some((parent, leaf)) = sub.rsplit_once('\\') {
                    if let Ok(key) = LOCAL_MACHINE.open(parent) {
                        let _ = key.remove_tree(leaf);
                        removed_items += 1;
                        freed_bytes += item.size_bytes;
                    }
                } else if LOCAL_MACHINE.remove_tree(sub).is_ok() {
                    removed_items += 1;
                    freed_bytes += item.size_bytes;
                }
            }
        }
    }

    // Record deep clean action in SQLite database
    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let detail = serde_json::json!({
            "app_name": app_name,
            "removed_items": removed_items,
            "freed_bytes": freed_bytes,
        });
        let _ = guard.execute(
            "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                "deep_uninstaller",
                detail.to_string(),
                chrono::Utc::now().to_rfc3339()
            ],
        );
    }

    let freed_formatted = format_bytes(freed_bytes);
    let message = format!(
        "Successfully cleaned {removed_items} residual items. Reclaimed {freed_formatted} disk space."
    );

    Ok(DeepCleanResult {
        app_name: app_name.to_string(),
        removed_items,
        freed_bytes,
        freed_formatted,
        errors,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_name_protected() {
        assert!(is_name_protected("Windows"));
        assert!(is_name_protected("microsoft"));
        assert!(is_name_protected("Program Files"));
        assert!(is_name_protected("a"));
        assert!(!is_name_protected("VLC media player"));
        assert!(!is_name_protected("Telegram Desktop"));
        assert!(!is_name_protected("Discord"));
    }

    #[test]
    fn test_list_installed_apps_runs_without_panic() {
        let apps = list_installed_apps();
        // Machine should have at least a few installed applications
        println!("Detected {} installed apps", apps.len());
        for app in apps.iter().take(5) {
            assert!(!app.name.is_empty());
        }
    }

    #[test]
    fn test_scan_app_leftovers_protected_bailout() {
        let res = scan_app_leftovers("Windows", "", "");
        assert_eq!(res.total_leftovers, 0);
        assert_eq!(res.leftovers.len(), 0);
    }

    #[test]
    fn test_scan_app_leftovers_dummy_app() {
        let res = scan_app_leftovers("NonExistentApp12345XYZ", "NonExistentPub", "");
        assert_eq!(res.total_leftovers, 0);
        assert_eq!(res.total_bytes, 0);
    }
}
