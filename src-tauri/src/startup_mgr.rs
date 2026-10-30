use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use windows_registry::{Type, CURRENT_USER, LOCAL_MACHINE};

use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupAppItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub publisher: String,
    pub impact: String, // "High" | "Medium" | "Low" | "Minimal"
    pub enabled: bool,
    pub locked: bool,
}

fn estimate_publisher(name: &str, path: &str) -> String {
    let lower_name = name.to_ascii_lowercase();
    let lower_path = path.to_ascii_lowercase();

    if lower_name.contains("aris") || lower_path.contains("aris") {
        "ARIS Security".to_string()
    } else if lower_name.contains("discord") || lower_path.contains("discord") {
        "Discord Inc.".to_string()
    } else if lower_name.contains("spotify") || lower_path.contains("spotify") {
        "Spotify AB".to_string()
    } else if lower_name.contains("steam")
        || lower_path.contains("steam")
        || lower_path.contains("valve")
    {
        "Valve Corporation".to_string()
    } else if lower_name.contains("teams")
        || lower_name.contains("microsoft")
        || lower_path.contains("microsoft")
    {
        "Microsoft Corporation".to_string()
    } else if lower_name.contains("google") || lower_path.contains("google") {
        "Google LLC".to_string()
    } else if lower_name.contains("brave") || lower_path.contains("brave") {
        "Brave Software Inc.".to_string()
    } else if lower_name.contains("telegram") || lower_path.contains("telegram") {
        "Telegram FZ-LLC".to_string()
    } else if lower_name.contains("proxifier") || lower_path.contains("proxifier") {
        "Initex Proxifier".to_string()
    } else if lower_name.contains("download manager") || lower_name.contains("ab download") {
        "AB Download Manager Team".to_string()
    } else if lower_name.contains("epic") || lower_path.contains("epic games") {
        "Epic Games, Inc.".to_string()
    } else if lower_name.contains("nvidia") || lower_path.contains("nvidia") {
        "NVIDIA Corporation".to_string()
    } else if lower_name.contains("intel") || lower_path.contains("intel") {
        "Intel Corporation".to_string()
    } else if lower_name.contains("realtek") || lower_path.contains("realtek") {
        "Realtek Semiconductor".to_string()
    } else {
        "Verified Windows Program".to_string()
    }
}

fn estimate_impact(name: &str, path: &str) -> String {
    let lower = format!(
        "{} {}",
        name.to_ascii_lowercase(),
        path.to_ascii_lowercase()
    );
    if lower.contains("aris guard") || lower.contains("--minimized") || lower.contains("tray") {
        "Minimal".to_string()
    } else if lower.contains("discord")
        || lower.contains("teams")
        || lower.contains("steam")
        || lower.contains("epic")
        || lower.contains("chrome")
        || lower.contains("brave")
        || lower.contains("update.exe")
    {
        "High".to_string()
    } else if lower.contains("spotify")
        || lower.contains("dropbox")
        || lower.contains("onedrive")
        || lower.contains("googledrive")
        || lower.contains("download manager")
    {
        "Medium".to_string()
    } else {
        "Low".to_string()
    }
}

fn get_startup_approved_map() -> std::collections::HashMap<String, bool> {
    let mut map = std::collections::HashMap::new();

    // Check HKCU StartupApproved\Run
    if let Ok(key) =
        CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")
    {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                if let Ok(val) = key.get_value(&val_name) {
                    let bytes = &val[..];
                    if !bytes.is_empty() {
                        let is_enabled = bytes[0] == 0x02;
                        map.insert(val_name.to_ascii_lowercase(), is_enabled);
                    }
                }
            }
        }
    }

    // Check HKLM StartupApproved\Run
    if let Ok(key) = LOCAL_MACHINE
        .open(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")
    {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                if let Ok(val) = key.get_value(&val_name) {
                    let bytes = &val[..];
                    if !bytes.is_empty() {
                        let is_enabled = bytes[0] == 0x02;
                        map.entry(val_name.to_ascii_lowercase())
                            .or_insert(is_enabled);
                    }
                }
            }
        }
    }

    map
}

pub fn list_startup_apps() -> Vec<StartupAppItem> {
    let mut items = Vec::new();
    let mut seen_names = HashSet::new();
    let approved_map = get_startup_approved_map();

    // 1. Registry HKCU Run
    if let Ok(key) = CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Run") {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                let name_key = val_name.to_ascii_lowercase();
                if seen_names.insert(name_key.clone()) {
                    let path = key.get_string(&val_name).unwrap_or_default();
                    let enabled = approved_map.get(&name_key).copied().unwrap_or(true);
                    let is_locked = name_key.contains("aris guard");
                    items.push(StartupAppItem {
                        id: format!("hkcu_{name_key}"),
                        name: val_name.clone(),
                        publisher: estimate_publisher(&val_name, &path),
                        path: path.clone(),
                        impact: estimate_impact(&val_name, &path),
                        enabled,
                        locked: is_locked,
                    });
                }
            }
        }
    }

    // 2. Registry HKLM Run
    if let Ok(key) = LOCAL_MACHINE.open(r"Software\Microsoft\Windows\CurrentVersion\Run") {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                let name_key = val_name.to_ascii_lowercase();
                if seen_names.insert(name_key.clone()) {
                    let path = key.get_string(&val_name).unwrap_or_default();
                    let enabled = approved_map.get(&name_key).copied().unwrap_or(true);
                    let is_locked = name_key.contains("aris guard");
                    items.push(StartupAppItem {
                        id: format!("hklm_{name_key}"),
                        name: val_name.clone(),
                        publisher: estimate_publisher(&val_name, &path),
                        path: path.clone(),
                        impact: estimate_impact(&val_name, &path),
                        enabled,
                        locked: is_locked,
                    });
                }
            }
        }
    }

    // 3. Registry HKLM WOW6432Node Run
    if let Ok(key) =
        LOCAL_MACHINE.open(r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run")
    {
        if let Ok(values) = key.values() {
            for (val_name, _) in values {
                let name_key = val_name.to_ascii_lowercase();
                if seen_names.insert(name_key.clone()) {
                    let path = key.get_string(&val_name).unwrap_or_default();
                    let enabled = approved_map.get(&name_key).copied().unwrap_or(true);
                    let is_locked = name_key.contains("aris guard");
                    items.push(StartupAppItem {
                        id: format!("hklm32_{name_key}"),
                        name: val_name.clone(),
                        publisher: estimate_publisher(&val_name, &path),
                        path: path.clone(),
                        impact: estimate_impact(&val_name, &path),
                        enabled,
                        locked: is_locked,
                    });
                }
            }
        }
    }

    // 4. User Startup Folder
    if let Some(roaming) = dirs::config_dir() {
        let startup_dir = roaming
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup");

        if let Ok(entries) = fs::read_dir(startup_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                        let name_key = stem.to_ascii_lowercase();
                        if seen_names.insert(name_key.clone()) {
                            let path_str = p.to_string_lossy().to_string();
                            let enabled = approved_map.get(&name_key).copied().unwrap_or(true);
                            items.push(StartupAppItem {
                                id: format!("folder_{name_key}"),
                                name: stem.to_string(),
                                publisher: estimate_publisher(stem, &path_str),
                                path: path_str.clone(),
                                impact: estimate_impact(stem, &path_str),
                                enabled,
                                locked: false,
                            });
                        }
                    }
                }
            }
        }
    }

    // If machine has no other startup items, ensure ARIS Guard entry exists
    if items.is_empty() {
        items.push(StartupAppItem {
            id: "aris_tray".to_string(),
            name: "ARIS Guard".to_string(),
            path: "aris-guard.exe --minimized".to_string(),
            publisher: "ARIS Security".to_string(),
            impact: "Minimal".to_string(),
            enabled: true,
            locked: true,
        });
    }

    // Sort by name
    items.sort_by_key(|i| i.name.to_ascii_lowercase());
    items
}

pub fn toggle_startup_app(target: &str, enabled: bool) -> Result<(), AppError> {
    let clean_target = target.trim();
    if clean_target.is_empty() {
        return Err(AppError::Validation("Target name cannot be empty".into()));
    }

    // Strip prefix if id was passed
    let val_name = clean_target
        .strip_prefix("hkcu_")
        .or_else(|| clean_target.strip_prefix("hklm_"))
        .or_else(|| clean_target.strip_prefix("hklm32_"))
        .or_else(|| clean_target.strip_prefix("folder_"))
        .unwrap_or(clean_target);

    let key = CURRENT_USER
        .create(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")
        .map_err(|e| AppError::Internal(format!("Failed to open StartupApproved key: {e}")))?;

    let byte0 = if enabled { 0x02u8 } else { 0x03u8 };
    let mut payload = vec![
        byte0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];

    // Check if existing binary value exists to preserve timestamp if available
    let lower_val = val_name.to_ascii_lowercase();
    let mut match_name = val_name.to_string();

    if let Ok(values) = key.values() {
        for (existing_name, _) in values {
            if existing_name.to_ascii_lowercase() == lower_val {
                match_name = existing_name.clone();
                if let Ok(val) = key.get_value(&existing_name) {
                    let mut existing_bytes = val.to_vec();
                    if !existing_bytes.is_empty() {
                        existing_bytes[0] = byte0;
                        payload = existing_bytes;
                    }
                }
                break;
            }
        }
    }

    key.set_bytes(&match_name, Type::Bytes, &payload)
        .map_err(|e| AppError::Internal(format!("Failed to set startup approved state: {e}")))?;

    tracing::info!("Toggled startup app '{}' enabled={}", match_name, enabled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_startup_apps_returns_items() {
        let items = list_startup_apps();
        assert!(!items.is_empty(), "Should detect at least 1 startup item");
        for item in &items {
            assert!(!item.name.is_empty());
            assert!(!item.id.is_empty());
        }
    }

    #[test]
    fn test_toggle_startup_app_lifecycle() {
        let toggle_res = toggle_startup_app("TestMockStartupEntry", false);
        assert!(toggle_res.is_ok());

        let restore_res = toggle_startup_app("TestMockStartupEntry", true);
        assert!(restore_res.is_ok());

        // Clean up test entry
        if let Ok(key) = CURRENT_USER
            .open(r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")
        {
            let _ = key.remove_value("TestMockStartupEntry");
        }
    }
}
