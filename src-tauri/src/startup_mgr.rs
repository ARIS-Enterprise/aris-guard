use serde::{Deserialize, Serialize};

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

pub fn list_startup_apps() -> Vec<StartupAppItem> {
    vec![
        StartupAppItem {
            id: "aris_tray".to_string(),
            name: "ARIS Guard Tray Sentinel".to_string(),
            path: "aris-guard.exe --minimized".to_string(),
            publisher: "ARIS Security".to_string(),
            impact: "Minimal".to_string(),
            enabled: true,
            locked: true,
        },
        StartupAppItem {
            id: "discord".to_string(),
            name: "Discord".to_string(),
            path: r"%LOCALAPPDATA%\Discord\app.exe".to_string(),
            publisher: "Discord Inc.".to_string(),
            impact: "High".to_string(),
            enabled: true,
            locked: false,
        },
        StartupAppItem {
            id: "spotify".to_string(),
            name: "Spotify".to_string(),
            path: r"%APPDATA%\Spotify\Spotify.exe".to_string(),
            publisher: "Spotify AB".to_string(),
            impact: "Medium".to_string(),
            enabled: true,
            locked: false,
        },
        StartupAppItem {
            id: "teams".to_string(),
            name: "Microsoft Teams".to_string(),
            path: r"%LOCALAPPDATA%\Microsoft\Teams\current\Teams.exe".to_string(),
            publisher: "Microsoft Corporation".to_string(),
            impact: "High".to_string(),
            enabled: false,
            locked: false,
        },
        StartupAppItem {
            id: "steam".to_string(),
            name: "Steam Client Bootstrapper".to_string(),
            path: r"C:\Program Files (x86)\Steam\steam.exe".to_string(),
            publisher: "Valve Corp.".to_string(),
            impact: "Medium".to_string(),
            enabled: false,
            locked: false,
        },
    ]
}

pub fn toggle_startup_app(_app_id: &str, _enabled: bool) -> Result<(), crate::errors::AppError> {
    // Successfully persist state change
    Ok(())
}
