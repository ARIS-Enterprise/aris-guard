use std::sync::{Arc, Mutex};
use tauri::State;

use crate::cleaner::{self, CleanupResult, CleanupSummary};
use crate::config::AppSettings;
use crate::db::Database;
use crate::eradicator::{
    self, EradicationAuditReport, EradicationItem, EradicationResult, EradicationTarget,
};
use crate::errors::AppError;
use crate::health::{self, ActivityEvent, SystemHealthMetrics};
use crate::process_mgr::{self, MemoryBoostResult, SystemPerformanceMetrics};
use crate::quarantine::{self, QuarantineItem};
use crate::scanner::{self, BatchScanReport, ScanResultItem};
use crate::startup_mgr::{self, StartupAppItem};
use crate::uninstaller::{self, AppLeftover, AppLeftoverScanResult, DeepCleanResult, InstalledApp};

pub struct AppConfigState {
    pub settings: Arc<Mutex<AppSettings>>,
    pub config_path: std::path::PathBuf,
}

#[tauri::command]
pub fn get_settings(state: State<AppConfigState>) -> Result<AppSettings, AppError> {
    let settings = state
        .settings
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock settings state: {e}")))?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn set_settings(
    new_settings: AppSettings,
    state: State<AppConfigState>,
) -> Result<(), AppError> {
    new_settings.validate()?;
    new_settings.save(&state.config_path)?;
    let mut settings = state
        .settings
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock settings state: {e}")))?;
    *settings = new_settings;
    Ok(())
}

#[tauri::command]
pub fn get_health_metrics(
    db: State<Database>,
    state: State<AppConfigState>,
) -> Result<SystemHealthMetrics, AppError> {
    let settings = state
        .settings
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock settings: {e}")))?;
    Ok(health::get_health_metrics(&db, &settings))
}

#[tauri::command]
pub fn scan_file_path(path: String, db: State<Database>) -> Result<ScanResultItem, AppError> {
    scanner::scan_file_path(&path, &db)
}

#[tauri::command]
pub fn scan_file_payload(
    file_name: String,
    file_size: u64,
    content_base64: Option<String>,
    db: State<Database>,
) -> Result<ScanResultItem, AppError> {
    use base64::prelude::*;
    let bytes = content_base64.and_then(|b64| {
        let cleaned = b64.trim();
        BASE64_STANDARD.decode(cleaned).ok()
    });
    scanner::scan_virtual_payload(&file_name, file_size, bytes.as_deref(), &db)
}

#[tauri::command]
pub fn get_recent_scans(db: State<Database>) -> Result<Vec<ScanResultItem>, AppError> {
    scanner::get_recent_scans(&db, 20)
}

#[tauri::command]
pub fn preview_cleanup() -> Result<CleanupSummary, AppError> {
    Ok(cleaner::preview_cleanup())
}

#[tauri::command]
pub fn run_cleanup(
    categories: Vec<String>,
    db: State<Database>,
) -> Result<CleanupResult, AppError> {
    cleaner::execute_cleanup(&categories, &db)
}

#[tauri::command]
pub fn run_smart_fix(db: State<Database>) -> Result<CleanupResult, AppError> {
    let cats = vec![
        "user_temp".to_string(),
        "system_temp".to_string(),
        "recycle_bin".to_string(),
        "browser_cache".to_string(),
        "crash_dumps".to_string(),
        "thumbnails".to_string(),
        "wer_reports".to_string(),
    ];
    let result = cleaner::execute_cleanup(&cats, &db)?;

    // Log smart fix event
    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let _ = guard.execute(
            "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                "smart_fix",
                "{\"optimized\": true}",
                chrono::Utc::now().to_rfc3339()
            ],
        );
    }

    Ok(result)
}

#[tauri::command]
pub fn get_startup_items() -> Result<Vec<StartupAppItem>, AppError> {
    Ok(startup_mgr::list_startup_apps())
}

#[tauri::command]
pub fn toggle_startup_item(name: String, enabled: bool) -> Result<(), AppError> {
    startup_mgr::toggle_startup_app(&name, enabled)
}

#[tauri::command]
pub fn get_activity_history(db: State<Database>) -> Result<Vec<ActivityEvent>, AppError> {
    health::get_activity_events(&db)
}

#[tauri::command]
pub fn list_installed_apps() -> Result<Vec<InstalledApp>, AppError> {
    Ok(uninstaller::list_installed_apps())
}

#[tauri::command]
pub fn scan_app_leftovers(
    app_name: String,
    publisher: String,
    install_location: String,
) -> Result<AppLeftoverScanResult, AppError> {
    Ok(uninstaller::scan_app_leftovers(
        &app_name,
        &publisher,
        &install_location,
    ))
}

#[tauri::command]
pub fn run_official_uninstaller(uninstall_string: String) -> Result<String, AppError> {
    uninstaller::run_official_uninstaller(&uninstall_string)
}

#[tauri::command]
pub fn delete_app_leftovers(
    app_name: String,
    items: Vec<AppLeftover>,
    db: State<Database>,
) -> Result<DeepCleanResult, AppError> {
    uninstaller::delete_app_leftovers(&app_name, items, &db)
}

#[tauri::command]
pub fn list_eradication_candidates() -> Result<Vec<EradicationTarget>, AppError> {
    Ok(eradicator::list_eradication_candidates())
}

#[tauri::command]
pub fn audit_eradication_traces(
    target_name: String,
    exe_name: String,
    explicit_path: Option<String>,
) -> Result<EradicationAuditReport, AppError> {
    eradicator::audit_eradication_traces(&target_name, &exe_name, explicit_path.as_deref())
}

#[tauri::command]
pub fn execute_oblivion_eradication(
    target_name: String,
    items: Vec<EradicationItem>,
    db: State<Database>,
) -> Result<EradicationResult, AppError> {
    eradicator::execute_oblivion_eradication(&target_name, items, &db)
}

#[tauri::command]
pub fn boost_memory(db: State<Database>) -> Result<MemoryBoostResult, AppError> {
    process_mgr::boost_memory(&db)
}

#[tauri::command]
pub fn get_system_performance() -> Result<SystemPerformanceMetrics, AppError> {
    process_mgr::get_system_performance()
}

#[tauri::command]
pub fn quarantine_file(
    path: String,
    reason: String,
    db: State<Database>,
) -> Result<QuarantineItem, AppError> {
    quarantine::quarantine_file(&path, &reason, &db)
}

#[tauri::command]
pub fn list_quarantined_items(db: State<Database>) -> Result<Vec<QuarantineItem>, AppError> {
    quarantine::list_quarantined_items(&db)
}

#[tauri::command]
pub fn restore_quarantined_item(id: String, db: State<Database>) -> Result<String, AppError> {
    quarantine::restore_quarantined_item(&id, &db)
}

#[tauri::command]
pub fn delete_quarantined_item(id: String, db: State<Database>) -> Result<String, AppError> {
    quarantine::delete_quarantined_item(&id, &db)
}

#[tauri::command]
pub fn run_batch_scan(
    scan_type: String,
    custom_path: Option<String>,
    db: State<Database>,
) -> Result<BatchScanReport, AppError> {
    scanner::run_batch_scan(&scan_type, custom_path.as_deref(), &db)
}

