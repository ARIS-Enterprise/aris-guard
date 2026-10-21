use std::path::Path;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::errors::AppError;

pub fn init_logging(log_dir: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(log_dir)?;

    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("aris-guard")
        .filename_suffix("log")
        .max_log_files(5)
        .build(log_dir)
        .map_err(|e| AppError::Internal(format!("Failed to initialize log file appender: {e}")))?;

    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    // Leak the guard intentionally so logs flush continuously across application runtime
    Box::leak(Box::new(_guard));

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,aris_guard=debug"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_writer(std::io::stdout))
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
        .try_init()
        .map_err(|e| AppError::Internal(format!("Logger initialization error: {e}")))?;

    tracing::info!("Logger initialized successfully at {}", log_dir.display());
    Ok(())
}
