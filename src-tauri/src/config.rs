use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AutoQuarantine {
    Ask,
    Always,
    Never,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ClamAvMode {
    Auto,
    Enabled,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppSettings {
    pub watch_folders: Vec<PathBuf>,
    pub scan_on_download: bool,
    pub auto_quarantine: AutoQuarantine,
    pub online_lookups: bool,
    pub clamav_enabled: ClamAvMode,
    pub cleaner_on_startup: bool,
    pub cleaner_categories: Vec<String>,
    pub cleaner_min_age_hours: u32,
    pub startup_suggestions: bool,
    pub notifications: bool,
    pub language: String,
    pub theme: String,
    pub start_with_windows: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut watch_folders = Vec::new();
        if let Some(download_dir) = dirs::download_dir() {
            watch_folders.push(download_dir);
        }
        if let Some(desktop_dir) = dirs::desktop_dir() {
            watch_folders.push(desktop_dir);
        }

        Self {
            watch_folders,
            scan_on_download: true,
            auto_quarantine: AutoQuarantine::Ask,
            online_lookups: false,
            clamav_enabled: ClamAvMode::Auto,
            cleaner_on_startup: true,
            cleaner_categories: vec![
                "user_temp".to_string(),
                "thumbnails".to_string(),
                "crash_dumps".to_string(),
                "wer_reports".to_string(),
            ],
            cleaner_min_age_hours: 24,
            startup_suggestions: true,
            notifications: true,
            language: "en".to_string(),
            theme: "system".to_string(),
            start_with_windows: true,
        }
    }
}

impl AppSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.language != "en" && self.language != "bn" {
            return Err(AppError::Validation(format!(
                "Unsupported language '{}', must be 'en' or 'bn'",
                self.language
            )));
        }

        if self.theme != "system" && self.theme != "dark" && self.theme != "light" {
            return Err(AppError::Validation(format!(
                "Unsupported theme '{}', must be 'system', 'dark', or 'light'",
                self.theme
            )));
        }

        if self.cleaner_min_age_hours < 1 {
            return Err(AppError::Validation(
                "cleaner_min_age_hours must be at least 1 hour".into(),
            ));
        }

        Ok(())
    }

    pub fn load_or_default(path: &Path) -> Result<Self, AppError> {
        if !path.exists() {
            let defaults = Self::default();
            defaults.save(path)?;
            return Ok(defaults);
        }

        let content = std::fs::read_to_string(path)?;
        let settings: AppSettings = serde_json::from_str(&content)
            .map_err(|e| AppError::Config(format!("Failed to parse settings JSON: {e}")))?;
        settings.validate()?;
        Ok(settings)
    }

    pub fn save(&self, path: &Path) -> Result<(), AppError> {
        self.validate()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Config(format!("Failed to serialize settings: {e}")))?;
        std::fs::write(path, json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_validation() {
        let settings = AppSettings::default();
        assert!(settings.validate().is_ok());
        assert_eq!(settings.auto_quarantine, AutoQuarantine::Ask);
        assert_eq!(settings.cleaner_min_age_hours, 24);
    }

    #[test]
    fn test_invalid_language() {
        let mut settings = AppSettings::default();
        settings.language = "es".into();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_invalid_theme() {
        let mut settings = AppSettings::default();
        settings.theme = "neon".into();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_invalid_cleaner_age() {
        let mut settings = AppSettings::default();
        settings.cleaner_min_age_hours = 0;
        assert!(settings.validate().is_err());
    }
}
