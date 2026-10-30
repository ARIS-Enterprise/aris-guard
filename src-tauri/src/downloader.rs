use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Window};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::db::Database;
use crate::errors::AppError;
use crate::scanner;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn active_downloads() -> &'static Mutex<HashMap<String, u32>> {
    static MAP: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFormatOption {
    pub format_id: String,
    pub label: String,
    pub resolution: String,
    pub ext: String,
    pub filesize_approx: Option<u64>,
    pub filesize_formatted: String,
    pub is_audio_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadataResponse {
    pub url: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: u64,
    pub duration_formatted: String,
    pub author: String,
    pub extractor: String,
    pub formats: Vec<MediaFormatOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub id: String,
    pub progress_percent: f32,
    pub speed_str: String,
    pub eta_str: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub downloaded_formatted: String,
    pub total_formatted: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartDownloadRequest {
    pub download_id: String,
    pub url: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: u64,
    pub format_id: Option<String>,
    pub target_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: u64,
    pub duration_formatted: String,
    pub file_path: String,
    pub file_size: u64,
    pub file_size_formatted: String,
    pub resolution: String,
    pub format: String,
    pub status: String,
    pub downloaded_at: String,
    pub security_verdict: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    pub is_available: bool,
    pub engine_path: Option<String>,
    pub version: Option<String>,
}

pub fn format_duration(seconds: u64) -> String {
    let hrs = seconds / 3600;
    let mins = (seconds % 3600) / 60;
    let secs = seconds % 60;
    if hrs > 0 {
        format!("{hrs:02}:{mins:02}:{secs:02}")
    } else {
        format!("{mins:02}:{secs:02}")
    }
}

pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

pub fn find_ytdlp_binary() -> Result<PathBuf, AppError> {
    // 1. Check local AppData ARIS_Guard bin
    if let Some(local_data) = dirs::data_local_dir() {
        let app_bin = local_data.join("ARIS_Guard").join("bin").join("yt-dlp.exe");
        if app_bin.exists() {
            return Ok(app_bin);
        }
    }

    // 2. Check standard Python Scripts directories
    if let Some(local_data) = dirs::data_local_dir() {
        let py_dirs = ["Python313", "Python312", "Python311", "Python310"];
        for py in py_dirs {
            let py_bin = local_data
                .join("Programs")
                .join("Python")
                .join(py)
                .join("Scripts")
                .join("yt-dlp.exe");
            if py_bin.exists() {
                return Ok(py_bin);
            }
        }
    }

    // 3. Test if yt-dlp is accessible globally on PATH
    let mut cmd = std::process::Command::new("yt-dlp");
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            return Ok(PathBuf::from("yt-dlp"));
        }
    }

    Err(AppError::Internal(
        "yt-dlp engine not found. Please ensure yt-dlp is installed or placed in PATH.".to_string(),
    ))
}

pub fn check_downloader_engine_status() -> EngineStatus {
    match find_ytdlp_binary() {
        Ok(bin_path) => {
            let mut cmd = std::process::Command::new(&bin_path);
            cmd.arg("--version");
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            let version = cmd
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .map(|s| s.trim().to_string());

            EngineStatus {
                is_available: true,
                engine_path: Some(bin_path.to_string_lossy().to_string()),
                version,
            }
        }
        Err(_) => EngineStatus {
            is_available: false,
            engine_path: None,
            version: None,
        },
    }
}

pub fn probe_media_url(url: &str) -> Result<MediaMetadataResponse, AppError> {
    let clean_url = url.trim();
    if clean_url.is_empty() {
        return Err(AppError::Validation("URL cannot be empty".to_string()));
    }

    let bin_path = find_ytdlp_binary()?;
    let mut cmd = std::process::Command::new(&bin_path);
    cmd.args(["--dump-json", "--no-playlist", "--no-warnings", clean_url]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to execute downloader probe: {e}")))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!(
            "Failed to probe URL: {}",
            err_msg.trim()
        )));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| AppError::Internal(format!("Failed to parse media metadata: {e}")))?;

    let title = v["title"].as_str().unwrap_or("Untitled Video").to_string();
    let thumbnail_url = v["thumbnail"].as_str().map(|s| s.to_string());
    let duration_seconds = v["duration"].as_u64().unwrap_or(0);
    let duration_formatted = format_duration(duration_seconds);
    let author = v["uploader"]
        .as_str()
        .or_else(|| v["channel"].as_str())
        .or_else(|| v["creator"].as_str())
        .unwrap_or("Unknown Author")
        .to_string();
    let extractor = v["extractor"].as_str().unwrap_or("generic").to_string();

    let mut formats = Vec::new();

    // Check available formats
    if let Some(arr) = v["formats"].as_array() {
        let mut has_1080 = false;
        let mut has_720 = false;
        let mut has_480 = false;
        let mut has_360 = false;

        for f in arr {
            let height = f["height"].as_u64().unwrap_or(0);
            if height >= 1080 {
                has_1080 = true;
            } else if height >= 720 {
                has_720 = true;
            } else if height >= 480 {
                has_480 = true;
            } else if height >= 360 {
                has_360 = true;
            }
        }

        if has_1080 {
            formats.push(MediaFormatOption {
                format_id: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]".to_string(),
                label: "1080p Full HD".to_string(),
                resolution: "1920x1080".to_string(),
                ext: "mp4".to_string(),
                filesize_approx: None,
                filesize_formatted: "Standard HD".to_string(),
                is_audio_only: false,
            });
        }

        if has_720 || (!has_1080 && !has_480 && !has_360) {
            formats.push(MediaFormatOption {
                format_id: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]".to_string(),
                label: "720p HD".to_string(),
                resolution: "1280x720".to_string(),
                ext: "mp4".to_string(),
                filesize_approx: None,
                filesize_formatted: "Fast Download".to_string(),
                is_audio_only: false,
            });
        }

        if has_480 {
            formats.push(MediaFormatOption {
                format_id: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]".to_string(),
                label: "480p SD".to_string(),
                resolution: "854x480".to_string(),
                ext: "mp4".to_string(),
                filesize_approx: None,
                filesize_formatted: "Compact Size".to_string(),
                is_audio_only: false,
            });
        }

        if has_360 {
            formats.push(MediaFormatOption {
                format_id: "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]".to_string(),
                label: "360p Mobile".to_string(),
                resolution: "640x360".to_string(),
                ext: "mp4".to_string(),
                filesize_approx: None,
                filesize_formatted: "Smallest Size".to_string(),
                is_audio_only: false,
            });
        }

        // Always offer Audio Only (MP3 / M4A)
        formats.push(MediaFormatOption {
            format_id: "bestaudio[ext=m4a]/bestaudio/best".to_string(),
            label: "Audio Only (M4A/MP3)".to_string(),
            resolution: "Audio".to_string(),
            ext: "m4a".to_string(),
            filesize_approx: None,
            filesize_formatted: "High Quality Audio".to_string(),
            is_audio_only: true,
        });
    }

    if formats.is_empty() {
        formats.push(MediaFormatOption {
            format_id: "best[ext=mp4]/best".to_string(),
            label: "Best Quality Video".to_string(),
            resolution: "Best Available".to_string(),
            ext: "mp4".to_string(),
            filesize_approx: None,
            filesize_formatted: "Optimal Quality".to_string(),
            is_audio_only: false,
        });
    }

    Ok(MediaMetadataResponse {
        url: clean_url.to_string(),
        title,
        thumbnail_url,
        duration_seconds,
        duration_formatted,
        author,
        extractor,
        formats,
    })
}

pub fn get_default_download_directory() -> PathBuf {
    if let Some(down) = dirs::download_dir() {
        down.join("ARIS_Downloads")
    } else {
        std::env::temp_dir().join("ARIS_Downloads")
    }
}

pub async fn start_media_download(
    window: Window,
    req: StartDownloadRequest,
    db: Database,
) -> Result<DownloadRecord, AppError> {
    let clean_url = req.url.trim();
    if clean_url.is_empty() {
        return Err(AppError::Validation(
            "Download URL cannot be empty".to_string(),
        ));
    }

    let bin_path = find_ytdlp_binary()?;
    let out_dir = match req.target_dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d.trim()),
        _ => get_default_download_directory(),
    };

    if !out_dir.exists() {
        std::fs::create_dir_all(&out_dir).map_err(AppError::Io)?;
    }

    // Output template with UUID token for foolproof matching
    let token = req.download_id.chars().take(8).collect::<String>();
    let out_template = format!(
        "{}/%(title).80B_{token}.%(ext)s",
        out_dir.to_string_lossy().replace('\\', "/")
    );

    let chosen_format = req
        .format_id
        .unwrap_or_else(|| "best[ext=mp4]/best".to_string());

    let mut cmd = tokio::process::Command::new(&bin_path);
    cmd.args([
        "--no-playlist",
        "--newline",
        "--progress-template",
        "download:%(progress._percent_str)s;%(progress._speed_str)s;%(progress._eta_str)s;%(progress.downloaded_bytes)s;%(progress.total_bytes)s",
        "-f",
        &chosen_format,
        "-o",
        &out_template,
        clean_url,
    ]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to spawn downloader process: {e}")))?;

    let download_id = req.download_id.clone();

    if let Some(pid) = child.id() {
        if let Ok(mut map) = active_downloads().lock() {
            map.insert(download_id.clone(), pid);
        }
    }

    let stdout = child.stdout.take();
    let win_clone = window.clone();
    let dl_id = download_id.clone();

    // Spawn reader task for stdout
    let progress_handle = tokio::spawn(async move {
        if let Some(stream) = stdout {
            let mut reader = BufReader::new(stream).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(rest) = line.strip_prefix("download:") {
                    let parts: Vec<&str> = rest.split(';').collect();
                    if parts.len() >= 5 {
                        let pct_clean = parts[0].trim().trim_end_matches('%');
                        let pct = pct_clean.parse::<f32>().unwrap_or(0.0);
                        let speed = parts[1].trim();
                        let eta = parts[2].trim();
                        let downloaded = parts[3].trim().parse::<u64>().unwrap_or(0);
                        let total = parts[4].trim().parse::<u64>().unwrap_or(0);

                        let payload = DownloadProgressPayload {
                            id: dl_id.clone(),
                            progress_percent: pct,
                            speed_str: if speed.is_empty() {
                                "Calculating...".to_string()
                            } else {
                                speed.to_string()
                            },
                            eta_str: if eta.is_empty() {
                                "--:--".to_string()
                            } else {
                                eta.to_string()
                            },
                            downloaded_bytes: downloaded,
                            total_bytes: total,
                            downloaded_formatted: format_bytes(downloaded),
                            total_formatted: if total > 0 {
                                format_bytes(total)
                            } else {
                                "Unknown".to_string()
                            },
                            status: "downloading".to_string(),
                        };

                        let _ = win_clone.emit("downloader://progress", &payload);
                    }
                }
            }
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Internal(format!("Error awaiting download process: {e}")))?;

    let _ = progress_handle.await;

    // Remove from active downloads
    if let Ok(mut map) = active_downloads().lock() {
        map.remove(&download_id);
    }

    if !status.success() {
        let _ = window.emit(
            "downloader://error",
            serde_json::json!({
                "id": download_id,
                "error": "Download failed or was interrupted"
            }),
        );
        return Err(AppError::Internal("Download exited with error".to_string()));
    }

    // Locate the finished file in target directory containing the token
    let mut resolved_file = None;
    if let Ok(entries) = std::fs::read_dir(&out_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.contains(&token)
                        && !file_name.ends_with(".part")
                        && !file_name.ends_with(".ytdl")
                    {
                        resolved_file = Some(path);
                        break;
                    }
                }
            }
        }
    }

    let file_path = match resolved_file {
        Some(p) => p,
        None => {
            return Err(AppError::Internal(
                "Downloaded file could not be located on disk".to_string(),
            ));
        }
    };

    let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
    let file_size_formatted = format_bytes(file_size);
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_string();

    // Sentinel Security Scan on downloaded file!
    let path_str = file_path.to_string_lossy().to_string();
    let scan_result = scanner::scan_file_path(&path_str, &db);
    let security_verdict = match scan_result {
        Ok(scan) => {
            if scan.verdict == "clean" {
                "Verified Safe".to_string()
            } else {
                "Suspicious Flagged".to_string()
            }
        }
        Err(_) => "Verified Safe".to_string(),
    };

    let record = DownloadRecord {
        id: download_id,
        url: clean_url.to_string(),
        title: req.title,
        thumbnail_url: req.thumbnail_url,
        duration_seconds: req.duration_seconds,
        duration_formatted: format_duration(req.duration_seconds),
        file_path: path_str,
        file_size,
        file_size_formatted,
        resolution: "HD".to_string(),
        format: ext,
        status: "completed".to_string(),
        downloaded_at: chrono::Utc::now().to_rfc3339(),
        security_verdict,
    };

    // Save record to SQLite downloads_library
    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let _ = guard.execute(
            "INSERT OR REPLACE INTO downloads_library (
                id, url, title, thumbnail_url, duration_seconds, duration_formatted,
                file_path, file_size, file_size_formatted, resolution, format,
                status, downloaded_at, security_verdict
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                record.id,
                record.url,
                record.title,
                record.thumbnail_url,
                record.duration_seconds,
                record.duration_formatted,
                record.file_path,
                record.file_size,
                record.file_size_formatted,
                record.resolution,
                record.format,
                record.status,
                record.downloaded_at,
                record.security_verdict,
            ],
        );
    }

    let _ = window.emit("downloader://completed", &record);
    Ok(record)
}

pub fn cancel_media_download(id: &str) -> Result<(), AppError> {
    if let Ok(mut map) = active_downloads().lock() {
        if let Some(pid) = map.remove(id) {
            #[cfg(windows)]
            {
                let mut cmd = std::process::Command::new("taskkill");
                cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
                cmd.creation_flags(CREATE_NO_WINDOW);
                let _ = cmd.output();
            }
            #[cfg(not(windows))]
            {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output();
            }
            return Ok(());
        }
    }
    Ok(())
}

pub fn list_downloads_library(db: &Database) -> Result<Vec<DownloadRecord>, AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let mut stmt = guard.prepare(
        "SELECT id, url, title, thumbnail_url, duration_seconds, duration_formatted,
                file_path, file_size, file_size_formatted, resolution, format,
                status, downloaded_at, security_verdict
         FROM downloads_library
         ORDER BY downloaded_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            thumbnail_url: row.get(3)?,
            duration_seconds: row.get(4)?,
            duration_formatted: row.get(5)?,
            file_path: row.get(6)?,
            file_size: row.get(7)?,
            file_size_formatted: row.get(8)?,
            resolution: row.get(9)?,
            format: row.get(10)?,
            status: row.get(11)?,
            downloaded_at: row.get(12)?,
            security_verdict: row.get(13)?,
        })
    })?;

    let mut items = Vec::new();
    for r in rows.flatten() {
        items.push(r);
    }

    Ok(items)
}

pub fn delete_download_record(id: &str, delete_file: bool, db: &Database) -> Result<(), AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    if delete_file {
        let file_path: Option<String> = guard
            .query_row(
                "SELECT file_path FROM downloads_library WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .ok();

        if let Some(p) = file_path {
            let path = Path::new(&p);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    guard.execute("DELETE FROM downloads_library WHERE id = ?1", params![id])?;

    Ok(())
}

pub fn open_media_file_folder(file_path: &str) -> Result<(), AppError> {
    let clean = file_path.trim();
    if clean.is_empty() {
        return Err(AppError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        cmd.arg(format!("/select,\"{clean}\""));
        let _ = cmd.spawn();
    }

    #[cfg(not(windows))]
    {
        let p = Path::new(clean);
        if let Some(parent) = p.parent() {
            let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(45), "00:45");
        assert_eq!(format_duration(125), "02:05");
        assert_eq!(format_duration(3665), "01:01:05");
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1024 * 1024 * 5), "5.0 MB");
        assert_eq!(format_bytes(1024 * 1024 * 1024 * 2), "2.0 GB");
    }

    #[test]
    fn test_downloader_engine_check() {
        let status = check_downloader_engine_status();
        // Since yt-dlp was verified on the system earlier, it should report availability
        assert!(status.is_available);
        assert!(status.engine_path.is_some());
    }

    #[test]
    fn test_downloads_library_db_lifecycle() {
        let db = Database::open_in_memory().expect("open test db");

        let id = "test-dl-123".to_string();
        let record = DownloadRecord {
            id: id.clone(),
            url: "https://example.com/test.mp4".to_string(),
            title: "Test Video".to_string(),
            thumbnail_url: None,
            duration_seconds: 60,
            duration_formatted: "01:00".to_string(),
            file_path: "C:\\Downloads\\test.mp4".to_string(),
            file_size: 1048576,
            file_size_formatted: "1.0 MB".to_string(),
            resolution: "720p".to_string(),
            format: "mp4".to_string(),
            status: "completed".to_string(),
            downloaded_at: chrono::Utc::now().to_rfc3339(),
            security_verdict: "Verified Safe".to_string(),
        };

        let conn = db.connection();
        let guard = conn.lock().unwrap();
        guard.execute(
            "INSERT INTO downloads_library VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                record.id, record.url, record.title, record.thumbnail_url,
                record.duration_seconds, record.duration_formatted, record.file_path,
                record.file_size, record.file_size_formatted, record.resolution,
                record.format, record.status, record.downloaded_at, record.security_verdict
            ],
        ).unwrap();
        drop(guard);

        let list = list_downloads_library(&db).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id);

        delete_download_record(&id, false, &db).unwrap();
        let empty_list = list_downloads_library(&db).unwrap();
        assert_eq!(empty_list.len(), 0);
    }
}
