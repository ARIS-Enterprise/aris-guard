use std::sync::{Arc, Mutex};
use tauri::State;

use crate::config::AppSettings;
use crate::errors::AppError;

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
