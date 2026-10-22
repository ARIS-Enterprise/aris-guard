use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;
use windows_registry::{CURRENT_USER, LOCAL_MACHINE};

use crate::cleaner::format_bytes;
use crate::db::Database;
use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EradicationTarget {
    pub id: String,
    pub name: String,
    pub exe_name: String,
    pub path: Option<String>,
    pub category: String, // "Running in RAM" | "Network & Data Usage" | "Installed Software" | "Custom File"
    pub ram_usage_formatted: Option<String>,
    pub network_usage_formatted: Option<String>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EradicationItem {
    pub id: String,
    pub layer: String, // "Active RAM" | "Filesystem" | "Execution History" | "Network & Firewall" | "Windows Registry" | "Diagnostics"
    pub title: String,
    pub detail: String,
    pub path_or_key: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub selected: bool,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EradicationAuditReport {
    pub target_name: String,
    pub exe_name: String,
    pub total_items: usize,
    pub total_bytes: u64,
    pub total_formatted: String,
    pub ram_processes_count: usize,
    pub files_count: usize,
    pub registry_keys_count: usize,
    pub forensic_traces_count: usize,
    pub firewall_rules_count: usize,
    pub items: Vec<EradicationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EradicationResult {
    pub target_name: String,
    pub terminated_pids: Vec<u32>,
    pub freed_ram_formatted: String,
    pub deleted_files_count: usize,
    pub reclaimed_disk_formatted: String,
    pub cleaned_registry_keys_count: usize,
    pub wiped_forensic_traces_count: usize,
    pub removed_firewall_rules_count: usize,
    pub errors: Vec<String>,
    pub message: String,
}

/// Blacklist of protected OS names that must NEVER be eradicated
const PROTECTED_NAMES: &[&str] = &[
    "system",
    "system32",
    "syswow64",
    "windows",
    "explorer",
    "explorer.exe",
    "svchost",
    "svchost.exe",
    "csrss",
    "csrss.exe",
    "wininit",
    "wininit.exe",
    "lsass",
    "lsass.exe",
    "services",
    "services.exe",
    "smss",
    "smss.exe",
    "dwm",
    "dwm.exe",
    "registry",
    "spoolsv",
    "spoolsv.exe",
];

pub fn is_protected_system_target(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    if lower.len() < 2 {
        return true;
    }
    PROTECTED_NAMES.iter().any(|&p| p == lower)
}

pub fn rot13(input: &str) -> String {
    input
        .chars()
        .map(|c| match c {
            'a'..='m' | 'A'..='M' => (c as u8 + 13) as char,
            'n'..='z' | 'N'..='Z' => (c as u8 - 13) as char,
            _ => c,
        })
        .collect()
}

#[allow(clippy::permissions_set_readonly_false)]
fn force_strip_readonly_and_remove(path: &Path) -> std::io::Result<()> {
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
                let _ = force_strip_readonly_and_remove(&entry.path());
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

/// Enumerate active running processes from Windows via tasklist
pub fn query_running_processes() -> Vec<(String, u32, u64, String)> {
    let mut procs = Vec::new();
    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output();

    let output_str = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => return procs,
    };

    for line in output_str.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
        let parts: Vec<&str> = trimmed
            .split("\",\"")
            .map(|s| s.trim_matches('"'))
            .collect();

        if parts.len() >= 5 {
            let img_name = parts[0].to_string();
            let pid = parts[1].parse::<u32>().unwrap_or(0);
            let mem_raw = parts[4]
                .replace([',', 'K'], "")
                .trim()
                .parse::<u64>()
                .unwrap_or(0);
            let mem_bytes = mem_raw * 1024;
            let mem_formatted = format_bytes(mem_bytes);

            if pid > 4 && !is_protected_system_target(&img_name) {
                procs.push((img_name, pid, mem_bytes, mem_formatted));
            }
        }
    }

    procs
}

/// List candidates for Zero-Trace Oblivion Eradication:
/// Combines active RAM processes, network-active firewall apps, and installed software.
pub fn list_eradication_candidates() -> Vec<EradicationTarget> {
    let mut candidates: Vec<EradicationTarget> = Vec::new();
    let mut seen_keys: HashSet<String> = HashSet::new();

    // 1. Running Processes in RAM
    let running = query_running_processes();
    for (img_name, pid, mem_bytes, mem_formatted) in running {
        let base_name = img_name
            .strip_suffix(".exe")
            .or_else(|| img_name.strip_suffix(".EXE"))
            .unwrap_or(&img_name);
        let key = base_name.to_ascii_lowercase();

        if seen_keys.insert(key) {
            candidates.push(EradicationTarget {
                id: Uuid::new_v4().to_string(),
                name: base_name.to_string(),
                exe_name: img_name.clone(),
                path: None,
                category: "Running in RAM".to_string(),
                ram_usage_formatted: Some(mem_formatted),
                network_usage_formatted: if mem_bytes > 50 * 1024 * 1024 {
                    Some("Active Process".to_string())
                } else {
                    None
                },
                pid: Some(pid),
            });
        }
    }

    // 2. Network-active Firewall Apps (e.g. apps from user's data usage screenshot)
    if let Ok(key) = LOCAL_MACHINE.open(
        r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules",
    ) {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                if let Ok(str_val) = key.get_string(&val_name) {
                    if let Some(pos) = str_val.find("|App=") {
                        let sub = &str_val[pos + 5..];
                        let app_path = match sub.find('|') {
                            Some(end) => &sub[..end],
                            None => sub,
                        };

                        let p = Path::new(app_path);
                        if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                            let base_name = fname
                                .strip_suffix(".exe")
                                .or_else(|| fname.strip_suffix(".EXE"))
                                .unwrap_or(fname);
                            let key = base_name.to_ascii_lowercase();

                            if !is_protected_system_target(base_name) && seen_keys.insert(key) {
                                candidates.push(EradicationTarget {
                                    id: Uuid::new_v4().to_string(),
                                    name: base_name.to_string(),
                                    exe_name: fname.to_string(),
                                    path: Some(app_path.to_string()),
                                    category: "Network & Data Usage".to_string(),
                                    ram_usage_formatted: None,
                                    network_usage_formatted: Some("Firewall Monitored".to_string()),
                                    pid: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Installed Desktop Apps from Registry
    for app in crate::uninstaller::list_installed_apps() {
        let key = app.name.to_ascii_lowercase();
        if !is_protected_system_target(&app.name) && seen_keys.insert(key) {
            let exe_candidate = format!("{}.exe", app.name.replace(' ', ""));
            candidates.push(EradicationTarget {
                id: Uuid::new_v4().to_string(),
                name: app.name,
                exe_name: exe_candidate,
                path: if app.install_location.is_empty() {
                    None
                } else {
                    Some(app.install_location)
                },
                category: "Installed Software".to_string(),
                ram_usage_formatted: None,
                network_usage_formatted: None,
                pid: None,
            });
        }
    }

    // Sort alphabetically by name
    candidates.sort_by_key(|c| c.name.to_ascii_lowercase());
    candidates
}

/// Full Multi-Layer Forensic Audit:
/// Scans RAM, Filesystem, UserAssist, Prefetch, Firewall Rules, Registry Hives, and Crash Dumps.
pub fn audit_eradication_traces(
    target_name: &str,
    exe_name: &str,
    explicit_path: Option<&str>,
) -> Result<EradicationAuditReport, AppError> {
    let clean_name = target_name.trim();
    let clean_exe = if exe_name.trim().is_empty() {
        format!("{clean_name}.exe")
    } else {
        exe_name.trim().to_string()
    };

    if is_protected_system_target(clean_name) || is_protected_system_target(&clean_exe) {
        return Err(AppError::Validation(format!(
            "Protection safeguard: System core target '{clean_name}' cannot be eradicated"
        )));
    }

    let mut items: Vec<EradicationItem> = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut ram_count = 0;
    let mut files_count = 0;
    let mut registry_keys_count = 0;
    let mut forensic_count = 0;
    let mut firewall_count = 0;

    let target_lower = clean_name.to_ascii_lowercase();
    let exe_lower = clean_exe.to_ascii_lowercase();

    // ==========================================
    // LAYER 1: Active RAM & Running Processes
    // ==========================================
    let running = query_running_processes();
    for (img, pid, mem_bytes, mem_fmt) in running {
        let img_lower = img.to_ascii_lowercase();
        if img_lower == exe_lower || img_lower.contains(&target_lower) {
            ram_count += 1;
            total_bytes += mem_bytes;
            items.push(EradicationItem {
                id: Uuid::new_v4().to_string(),
                layer: "Active RAM".to_string(),
                title: format!("Terminate Process from RAM: {img} (PID: {pid})"),
                detail: format!("Active execution in memory ({mem_fmt}). Will terminate process and release RAM."),
                path_or_key: format!("PID:{pid}"),
                size_bytes: mem_bytes,
                size_formatted: mem_fmt,
                selected: true,
                pid: Some(pid),
            });
        }
    }

    // ==========================================
    // LAYER 2: Filesystem & Disk Footprints
    // ==========================================
    let mut candidate_dirs: Vec<(PathBuf, &str)> = Vec::new();

    if let Some(explicit) = explicit_path {
        let p = PathBuf::from(explicit.trim());
        if p.exists() {
            candidate_dirs.push((p, "Main Installation / Target Directory"));
        }
    }

    if let Some(local_app_data) = dirs::data_local_dir() {
        candidate_dirs.push((
            local_app_data.join(clean_name),
            "AppData (Local) Storage & Cache",
        ));
        candidate_dirs.push((
            local_app_data.join("Programs").join(clean_name),
            "Per-User Program Installation",
        ));
    }

    if let Some(roaming) = dirs::config_dir() {
        candidate_dirs.push((
            roaming.join(clean_name),
            "AppData (Roaming) User Profile & Tokens",
        ));
    }

    if let Some(home) = dirs::home_dir() {
        let local_low = home.join("AppData").join("LocalLow").join(clean_name);
        candidate_dirs.push((local_low, "AppData (LocalLow) Low-Integrity State"));
    }

    let program_data = PathBuf::from(r"C:\ProgramData").join(clean_name);
    candidate_dirs.push((program_data, "ProgramData Machine-Wide Shared Cache"));

    let prog_files = PathBuf::from(r"C:\Program Files").join(clean_name);
    candidate_dirs.push((prog_files, "Program Files (64-bit) Application Folder"));

    let prog_files_x86 = PathBuf::from(r"C:\Program Files (x86)").join(clean_name);
    candidate_dirs.push((prog_files_x86, "Program Files (32-bit) Application Folder"));

    let mut seen_paths: HashSet<String> = HashSet::new();
    for (dir_path, desc) in candidate_dirs {
        if dir_path.exists() {
            let path_str = dir_path.to_string_lossy().to_string();
            if seen_paths.insert(path_str.to_ascii_lowercase()) {
                let (f_count, bytes) = calculate_dir_size(&dir_path, 6);
                files_count += f_count.max(1);
                total_bytes += bytes;
                items.push(EradicationItem {
                    id: Uuid::new_v4().to_string(),
                    layer: "Filesystem".to_string(),
                    title: format!("Delete Folder & Residual Assets: {path_str}"),
                    detail: format!("{desc} ({f_count} files, {})", format_bytes(bytes)),
                    path_or_key: path_str,
                    size_bytes: bytes,
                    size_formatted: format_bytes(bytes),
                    selected: true,
                    pid: None,
                });
            }
        }
    }

    // ==========================================
    // LAYER 3: Execution History & Anti-Forensics (Make it "Never Ran")
    // ==========================================
    // 3A. Windows UserAssist Execution Tracking (ROT13)
    if let Ok(user_assist) =
        CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist")
    {
        if let Ok(guids) = user_assist.keys() {
            for guid in guids {
                let count_path = format!(
                    r"Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\{guid}\Count"
                );
                if let Ok(count_key) = CURRENT_USER.open(&count_path) {
                    if let Ok(values) = count_key.values() {
                        for (val_name, _) in values {
                            let decoded = rot13(&val_name);
                            let dec_lower = decoded.to_ascii_lowercase();
                            if dec_lower.contains(&target_lower) || dec_lower.contains(&exe_lower) {
                                forensic_count += 1;
                                items.push(EradicationItem {
                                    id: Uuid::new_v4().to_string(),
                                    layer: "Execution History".to_string(),
                                    title: format!("Purge Windows UserAssist Execution Trace: {decoded}"),
                                    detail: "Windows GUI execution launch count and timestamp telemetry.".to_string(),
                                    path_or_key: format!(r"HKCU\{count_path}|{val_name}"),
                                    size_bytes: 512,
                                    size_formatted: "512 B".to_string(),
                                    selected: true,
                                    pid: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 3B. Windows Prefetch (.pf) Files
    let prefetch_dir = Path::new(r"C:\Windows\Prefetch");
    if let Ok(entries) = fs::read_dir(prefetch_dir) {
        let prefix = clean_exe.replace(".exe", "").to_ascii_uppercase();
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                let f_upper = fname.to_ascii_uppercase();
                if f_upper.starts_with(&prefix) && f_upper.ends_with(".PF") {
                    forensic_count += 1;
                    let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                    total_bytes += size;
                    items.push(EradicationItem {
                        id: Uuid::new_v4().to_string(),
                        layer: "Execution History".to_string(),
                        title: format!("Wipe Windows Prefetch Trace: {fname}"),
                        detail: "Operating system executable run count, DLL load history, and execution cache.".to_string(),
                        path_or_key: p.to_string_lossy().to_string(),
                        size_bytes: size,
                        size_formatted: format_bytes(size),
                        selected: true,
                        pid: None,
                    });
                }
            }
        }
    }

    // 3C. RecentDocs MRU
    if let Ok(recent_key) =
        CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs")
    {
        if let Ok(values) = recent_key.values() {
            for (val_name, _) in values {
                if let Ok(str_val) = recent_key.get_string(&val_name) {
                    if str_val.to_ascii_lowercase().contains(&target_lower) {
                        forensic_count += 1;
                        items.push(EradicationItem {
                            id: Uuid::new_v4().to_string(),
                            layer: "Execution History".to_string(),
                            title: format!("Purge Explorer RecentDocs MRU Entry: {str_val}"),
                            detail: "Recently opened documents and files shell telemetry."
                                .to_string(),
                            path_or_key: format!(r"HKCU\RecentDocs|{val_name}"),
                            size_bytes: 256,
                            size_formatted: "256 B".to_string(),
                            selected: true,
                            pid: None,
                        });
                    }
                }
            }
        }
    }

    // ==========================================
    // LAYER 4: Network Data Usage & Windows Firewall
    // ==========================================
    if let Ok(firewall_key) = LOCAL_MACHINE.open(
        r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules",
    ) {
        if let Ok(values) = firewall_key.values() {
            for (rule_name, _) in values {
                if let Ok(rule_data) = firewall_key.get_string(&rule_name) {
                    let r_lower = rule_data.to_ascii_lowercase();
                    if r_lower.contains(&target_lower) || r_lower.contains(&exe_lower) {
                        firewall_count += 1;
                        items.push(EradicationItem {
                            id: Uuid::new_v4().to_string(),
                            layer: "Network & Firewall".to_string(),
                            title: format!("Purge Windows Firewall Rule: {rule_name}"),
                            detail: "Inbound/Outbound network traffic policy and data connection profile.".to_string(),
                            path_or_key: format!(r"HKLM\FirewallRules|{rule_name}"),
                            size_bytes: 1024,
                            size_formatted: "1 KB".to_string(),
                            selected: true,
                            pid: None,
                        });
                    }
                }
            }
        }
    }

    // ==========================================
    // LAYER 5: Windows Registry Hives (Software & Uninstall)
    // ==========================================
    let reg_targets = [
        (
            &CURRENT_USER,
            format!(r"Software\{clean_name}"),
            "HKCU",
            "HKCU Software Key",
        ),
        (
            &LOCAL_MACHINE,
            format!(r"Software\{clean_name}"),
            "HKLM",
            "HKLM Machine Software Key",
        ),
        (
            &LOCAL_MACHINE,
            format!(r"Software\WOW6432Node\{clean_name}"),
            "HKLM",
            "HKLM 32-bit Software Key",
        ),
        (
            &CURRENT_USER,
            format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{clean_name}"),
            "HKCU",
            "HKCU User Uninstall Record",
        ),
        (
            &LOCAL_MACHINE,
            format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{clean_name}"),
            "HKLM",
            "HKLM Machine Uninstall Record",
        ),
        (
            &LOCAL_MACHINE,
            format!(
                r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{clean_name}"
            ),
            "HKLM",
            "HKLM 32-bit Uninstall Record",
        ),
    ];

    for (hive, sub_path, hive_str, label) in reg_targets {
        if hive.open(&sub_path).is_ok() {
            registry_keys_count += 1;
            let full_reg_path = format!(r"{hive_str}\{sub_path}");
            items.push(EradicationItem {
                id: Uuid::new_v4().to_string(),
                layer: "Windows Registry".to_string(),
                title: format!("Eradicate Registry Key: {full_reg_path}"),
                detail: format!("{label}. Will remove subkey tree and all values."),
                path_or_key: full_reg_path,
                size_bytes: 12 * 1024,
                size_formatted: "12 KB".to_string(),
                selected: true,
                pid: None,
            });
        }
    }

    // ==========================================
    // LAYER 6: Crash Dumps & Diagnostic Reports
    // ==========================================
    if let Some(local_app_data) = dirs::data_local_dir() {
        let crash_dumps = local_app_data.join("CrashDumps");
        if let Ok(entries) = fs::read_dir(crash_dumps) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    let f_lower = fname.to_ascii_lowercase();
                    if f_lower.contains(&target_lower) || f_lower.contains(&exe_lower) {
                        let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                        total_bytes += size;
                        items.push(EradicationItem {
                            id: Uuid::new_v4().to_string(),
                            layer: "Diagnostics".to_string(),
                            title: format!("Delete Crash Memory Dump: {fname}"),
                            detail: "Residual application crash state and memory dump log."
                                .to_string(),
                            path_or_key: p.to_string_lossy().to_string(),
                            size_bytes: size,
                            size_formatted: format_bytes(size),
                            selected: true,
                            pid: None,
                        });
                    }
                }
            }
        }
    }

    let total_formatted = format_bytes(total_bytes);

    Ok(EradicationAuditReport {
        target_name: clean_name.to_string(),
        exe_name: clean_exe,
        total_items: items.len(),
        total_bytes,
        total_formatted,
        ram_processes_count: ram_count,
        files_count,
        registry_keys_count,
        forensic_traces_count: forensic_count,
        firewall_rules_count: firewall_count,
        items,
    })
}

/// Executes Total Oblivion Eradication:
/// 1. Terminate all active processes in RAM
/// 2. Permanently delete all files and folders
/// 3. Wipe UserAssist and Prefetch execution history
/// 4. Remove Windows Firewall rules and Network entries
/// 5. Remove all Windows Registry software and uninstall keys
/// 6. Delete crash memory dumps and diagnostic reports
/// 7. Record audit trail in SQLite database
pub fn execute_oblivion_eradication(
    target_name: &str,
    items: Vec<EradicationItem>,
    db: &Database,
) -> Result<EradicationResult, AppError> {
    let mut terminated_pids = Vec::new();
    let mut freed_ram_bytes: u64 = 0;
    let mut deleted_files_count = 0;
    let mut reclaimed_disk_bytes: u64 = 0;
    let mut cleaned_registry_keys_count = 0;
    let mut wiped_forensic_traces_count = 0;
    let mut removed_firewall_rules_count = 0;
    let mut errors = Vec::new();

    for item in items.into_iter().filter(|i| i.selected) {
        match item.layer.as_str() {
            // Layer 1: RAM Termination
            "Active RAM" => {
                if let Some(pid) = item.pid {
                    let kill_status = Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .output();

                    match kill_status {
                        Ok(res) if res.status.success() => {
                            terminated_pids.push(pid);
                            freed_ram_bytes += item.size_bytes;
                            tracing::info!("Terminated process PID {pid} from RAM");
                        }
                        _ => {
                            errors.push(format!(
                                "Could not terminate process PID {pid} (Access Denied or exited)"
                            ));
                        }
                    }
                }
            }

            // Layer 2: Filesystem
            "Filesystem" => {
                let p = PathBuf::from(&item.path_or_key);
                if p.exists() {
                    match force_strip_readonly_and_remove(&p) {
                        Ok(_) => {
                            deleted_files_count += 1;
                            reclaimed_disk_bytes += item.size_bytes;
                            tracing::info!("Eradicated filesystem path: {}", item.path_or_key);
                        }
                        Err(e) => {
                            errors.push(format!("Failed deleting path {}: {e}", item.path_or_key));
                        }
                    }
                }
            }

            // Layer 3: Execution History (UserAssist & Prefetch)
            "Execution History" => {
                if item.path_or_key.starts_with(
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist",
                ) {
                    // Format: HKCU\path|val_name
                    if let Some((subpath, val_name)) = item.path_or_key.split_once('|') {
                        let rel = subpath.strip_prefix(r"HKCU\").unwrap_or(subpath);
                        if let Ok(key) = CURRENT_USER.open(rel) {
                            if key.remove_value(val_name).is_ok() {
                                wiped_forensic_traces_count += 1;
                                tracing::info!("Wiped UserAssist trace: {val_name}");
                            }
                        }
                    }
                } else {
                    // Prefetch file
                    let p = PathBuf::from(&item.path_or_key);
                    if p.exists() {
                        let _ = fs::remove_file(&p);
                        wiped_forensic_traces_count += 1;
                    }
                }
            }

            // Layer 4: Network & Firewall
            "Network & Firewall" => {
                if let Some((_, rule_name)) = item.path_or_key.split_once('|') {
                    if let Ok(key) = LOCAL_MACHINE.open(r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules") {
                        if key.remove_value(rule_name).is_ok() {
                            removed_firewall_rules_count += 1;
                            tracing::info!("Removed firewall rule: {rule_name}");
                        }
                    }
                }
            }

            // Layer 5: Windows Registry
            "Windows Registry" => {
                let path = &item.path_or_key;
                if let Some(sub) = path.strip_prefix(r"HKCU\") {
                    if let Some((parent, leaf)) = sub.rsplit_once('\\') {
                        if let Ok(key) = CURRENT_USER.open(parent) {
                            if key.remove_tree(leaf).is_ok() {
                                cleaned_registry_keys_count += 1;
                            }
                        }
                    } else if CURRENT_USER.remove_tree(sub).is_ok() {
                        cleaned_registry_keys_count += 1;
                    }
                } else if let Some(sub) = path.strip_prefix(r"HKLM\") {
                    if let Some((parent, leaf)) = sub.rsplit_once('\\') {
                        if let Ok(key) = LOCAL_MACHINE.open(parent) {
                            if key.remove_tree(leaf).is_ok() {
                                cleaned_registry_keys_count += 1;
                            }
                        }
                    } else if LOCAL_MACHINE.remove_tree(sub).is_ok() {
                        cleaned_registry_keys_count += 1;
                    }
                }
            }

            // Layer 6: Diagnostics & Crash Dumps
            "Diagnostics" => {
                let p = PathBuf::from(&item.path_or_key);
                if p.exists() {
                    let _ = force_strip_readonly_and_remove(&p);
                    deleted_files_count += 1;
                    reclaimed_disk_bytes += item.size_bytes;
                }
            }

            _ => {}
        }
    }

    // Record eradication event in SQLite database
    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let detail = serde_json::json!({
            "target_name": target_name,
            "terminated_pids": terminated_pids,
            "freed_ram_bytes": freed_ram_bytes,
            "deleted_files": deleted_files_count,
            "reclaimed_disk_bytes": reclaimed_disk_bytes,
            "cleaned_registry_keys": cleaned_registry_keys_count,
            "wiped_forensic_traces": wiped_forensic_traces_count,
            "removed_firewall_rules": removed_firewall_rules_count,
        });

        let _ = guard.execute(
            "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                "ghost_eradication",
                detail.to_string(),
                chrono::Utc::now().to_rfc3339()
            ],
        );
    }

    let freed_ram_formatted = format_bytes(freed_ram_bytes);
    let reclaimed_disk_formatted = format_bytes(reclaimed_disk_bytes);
    let message = format!(
        "Total Oblivion Eradication Complete: Terminated {} process(es) from RAM ({freed_ram_formatted}), wiped {deleted_files_count} files ({reclaimed_disk_formatted}), purged {wiped_forensic_traces_count} execution history traces, and removed {cleaned_registry_keys_count} registry keys.",
        terminated_pids.len()
    );

    Ok(EradicationResult {
        target_name: target_name.to_string(),
        terminated_pids,
        freed_ram_formatted,
        deleted_files_count,
        reclaimed_disk_formatted,
        cleaned_registry_keys_count,
        wiped_forensic_traces_count,
        removed_firewall_rules_count,
        errors,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_protected() {
        assert!(is_protected_system_target("system"));
        assert!(is_protected_system_target("explorer.exe"));
        assert!(is_protected_system_target("svchost"));
        assert!(!is_protected_system_target("Discord"));
        assert!(!is_protected_system_target("chrome.exe"));
    }

    #[test]
    fn test_rot13_codec() {
        assert_eq!(rot13("BcraNV"), "OpenAI");
        assert_eq!(rot13(&rot13("Hello Windows")), "Hello Windows");
    }

    #[test]
    fn test_list_candidates_runs_without_panic() {
        let candidates = list_eradication_candidates();
        println!("Loaded {} eradication candidates", candidates.len());
        assert!(!candidates.is_empty());
    }

    #[test]
    fn test_audit_non_existent_target() {
        let report =
            audit_eradication_traces("TestFakeTarget123456", "TestFake1234.exe", None).unwrap();
        assert_eq!(report.target_name, "TestFakeTarget123456");
        assert_eq!(report.total_items, 0);
    }

    #[test]
    fn test_audit_protected_target_rejection() {
        let res = audit_eradication_traces("explorer.exe", "explorer.exe", None);
        assert!(res.is_err());
    }
}
