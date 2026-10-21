#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

mod agent;
mod cleaner;
mod commands;
mod config;
mod db;
mod errors;
mod health;
mod logger;
mod notifier;
mod process_mgr;
mod quarantine;
mod scan_archive;
mod scan_clamav;
mod scan_defender;
mod scan_hash;
mod scan_online;
mod scan_static;
mod scanner;
mod scheduler;
mod startup_mgr;
mod tray;
mod uninstaller;
mod watcher;
mod win_elevate;
mod win_fs;
mod win_registry;
mod win_trust;

use agent::AgentState;
use commands::AppConfigState;
use config::AppSettings;
use db::Database;

fn app_data_dir() -> std::path::PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("ARIS Guard"))
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\ProgramData\ARIS Guard"))
}

fn main() {
    let data_dir = app_data_dir();
    let log_dir = data_dir.join("logs");
    let db_path = data_dir.join("aris-guard.db");
    let config_path = data_dir.join("settings.json");
    let panic_log_path = data_dir.join("panic.log");

    std::panic::set_hook(Box::new(move |info| {
        let msg = format!("PANIC: {info}\n");
        eprintln!("{msg}");
        let _ = std::fs::write(&panic_log_path, &msg);
    }));

    if let Err(e) = logger::init_logging(&log_dir) {
        eprintln!("Failed to initialize logger: {e}");
    }

    let database = match Database::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            tracing::error!("Failed to initialize database: {e}");
            panic!("Critical database initialization failure: {e}");
        }
    };

    let settings = match AppSettings::load_or_default(&config_path) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to load settings, falling back to defaults: {e}");
            AppSettings::default()
        }
    };

    let agent_state = AgentState::new();
    let start_with_windows = settings.start_with_windows;
    let config_state = AppConfigState {
        settings: Arc::new(Mutex::new(settings)),
        config_path,
    };

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tracing::info!("Second instance detected; focusing or showing main window");
            if let Err(e) = tray::show_or_create_window(app) {
                tracing::error!("Failed to focus main window for second instance: {e}");
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(agent_state)
        .manage(database)
        .manage(config_state)
        .setup(move |app| {
            tracing::info!("Initializing ARIS Guard tray and runtime");
            tray::create_tray(app.handle())?;

            if start_with_windows {
                let autostart = app.autolaunch();
                match autostart.is_enabled() {
                    Ok(false) => {
                        if let Err(e) = autostart.enable() {
                            tracing::warn!("Failed to enable Windows startup: {e}");
                        } else {
                            tracing::info!("Successfully registered ARIS Guard in Windows startup");
                        }
                    }
                    Ok(true) => {
                        tracing::debug!("Windows startup is already active");
                    }
                    Err(e) => {
                        tracing::warn!("Failed to query autostart status: {e}");
                    }
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|arg| arg == "--minimized") {
                tracing::info!("Application launched with --minimized flag; hiding initial window");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                tracing::info!("Hiding WebView window to system tray");
                if let Err(e) = window.hide() {
                    tracing::error!("Failed to hide window: {e}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_settings,
            commands::get_health_metrics,
            commands::scan_file_path,
            commands::scan_file_payload,
            commands::get_recent_scans,
            commands::preview_cleanup,
            commands::run_cleanup,
            commands::run_smart_fix,
            commands::get_startup_items,
            commands::toggle_startup_item,
            commands::get_activity_history,
            commands::list_installed_apps,
            commands::scan_app_leftovers,
            commands::run_official_uninstaller,
            commands::delete_app_leftovers,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ARIS Guard application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if let Some(agent) = app_handle.try_state::<AgentState>() {
                if !agent.is_quitting() {
                    tracing::debug!("Preventing exit because agent is running in tray");
                    api.prevent_exit();
                }
            }
        }
    });
}
