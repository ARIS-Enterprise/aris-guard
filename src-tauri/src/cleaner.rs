use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::db::Database;
use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupCategoryInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_count: usize,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub default_checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupSummary {
    pub total_files: usize,
    pub total_bytes: u64,
    pub total_formatted: String,
    pub categories: Vec<CleanupCategoryInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupResult {
    pub cleaned_files: usize,
    pub reclaimed_bytes: u64,
    pub reclaimed_formatted: String,
    pub message: String,
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

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct SHQueryRBInfo {
    cb_size: u32,
    i64_size: i64,
    i64_num_items: i64,
}

#[cfg(windows)]
#[link(name = "shell32")]
extern "system" {
    fn SHEmptyRecycleBinW(
        hwnd: *mut std::ffi::c_void,
        psz_root_path: *const u16,
        dw_flags: u32,
    ) -> i32;
    fn SHQueryRecycleBinW(
        psz_root_path: *const u16,
        p_sh_query_rb_info: *mut SHQueryRBInfo,
    ) -> i32;
}

fn query_recycle_bin() -> (usize, u64) {
    #[cfg(windows)]
    unsafe {
        let mut info = SHQueryRBInfo {
            cb_size: std::mem::size_of::<SHQueryRBInfo>() as u32,
            i64_size: 0,
            i64_num_items: 0,
        };
        if SHQueryRecycleBinW(std::ptr::null(), &mut info) == 0 {
            let count = (info.i64_num_items.max(0)) as usize;
            let bytes = (info.i64_size.max(0)) as u64;
            return (count, bytes);
        }
    }
    (0, 0)
}

fn empty_recycle_bin() -> (usize, u64) {
    let (before_count, before_bytes) = query_recycle_bin();
    #[cfg(windows)]
    unsafe {
        // 7 = SHERB_NOCONFIRMATION (1) | SHERB_NOPROGRESSUI (2) | SHERB_NOSOUND (4)
        let _ = SHEmptyRecycleBinW(std::ptr::null_mut(), std::ptr::null(), 7);
    }
    (before_count, before_bytes)
}

fn get_browser_cache_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(local_data) = dirs::data_local_dir() {
        // Google Chrome
        paths.push(local_data.join("Google").join("Chrome").join("User Data").join("Default").join("Cache"));
        paths.push(local_data.join("Google").join("Chrome").join("User Data").join("Default").join("Code Cache"));
        // Microsoft Edge
        paths.push(local_data.join("Microsoft").join("Edge").join("User Data").join("Default").join("Cache"));
        paths.push(local_data.join("Microsoft").join("Edge").join("User Data").join("Default").join("Code Cache"));
        // Brave Browser
        paths.push(local_data.join("BraveSoftware").join("Brave-Browser").join("User Data").join("Default").join("Cache"));
        paths.push(local_data.join("BraveSoftware").join("Brave-Browser").join("User Data").join("Default").join("Code Cache"));
    }
    paths
}

fn scan_folder_stats(path: &Path, max_depth: usize) -> (usize, u64) {
    if max_depth == 0 || !path.exists() {
        return (0, 0);
    }
    let mut count = 0;
    let mut bytes = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = p.metadata() {
                if meta.is_file() {
                    count += 1;
                    bytes += meta.len();
                } else if meta.is_dir() {
                    let (sub_count, sub_bytes) = scan_folder_stats(&p, max_depth - 1);
                    count += sub_count;
                    bytes += sub_bytes;
                }
            }
        }
    }

    (count, bytes)
}

#[allow(clippy::permissions_set_readonly_false)]
fn clean_folder(path: &Path) -> (usize, u64) {
    if !path.exists() {
        return (0, 0);
    }
    let mut count = 0;
    let mut bytes = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = p.metadata() {
                if meta.is_file() {
                    let size = meta.len();
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = fs::set_permissions(&p, perms);
                    }
                    if fs::remove_file(&p).is_ok() {
                        count += 1;
                        bytes += size;
                    }
                } else if meta.is_dir() {
                    let (sub_count, sub_bytes) = clean_folder(&p);
                    count += sub_count;
                    bytes += sub_bytes;
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = fs::set_permissions(&p, perms);
                    }
                    let _ = fs::remove_dir(&p);
                }
            }
        }
    }

    (count, bytes)
}

pub fn get_cleanup_categories() -> Vec<CleanupCategoryInfo> {
    let mut categories = Vec::new();

    // 1. User Temp Directory (%TEMP%)
    let temp_dir = std::env::temp_dir();
    let (t_count, t_bytes) = scan_folder_stats(&temp_dir, 3);
    categories.push(CleanupCategoryInfo {
        id: "user_temp".to_string(),
        name: "User Temporary Files".to_string(),
        description: "Application runtime caches and temporary artifacts in %TEMP%".to_string(),
        file_count: t_count,
        size_bytes: t_bytes,
        size_formatted: format_bytes(t_bytes),
        default_checked: true,
    });

    // 2. Windows System Temp (C:\Windows\Temp)
    let sys_temp = PathBuf::from(r"C:\Windows\Temp");
    let (st_count, st_bytes) = scan_folder_stats(&sys_temp, 2);
    categories.push(CleanupCategoryInfo {
        id: "system_temp".to_string(),
        name: "Windows System Temp".to_string(),
        description: "System updates, driver setup, and OS installer residual files in Windows\\Temp".to_string(),
        file_count: st_count,
        size_bytes: st_bytes,
        size_formatted: format_bytes(st_bytes),
        default_checked: true,
    });

    // 3. Windows Recycle Bin
    let (rb_count, rb_bytes) = query_recycle_bin();
    categories.push(CleanupCategoryInfo {
        id: "recycle_bin".to_string(),
        name: "Windows Recycle Bin".to_string(),
        description: "Deleted desktop and file system files stored in Recycle Bin".to_string(),
        file_count: rb_count,
        size_bytes: rb_bytes,
        size_formatted: format_bytes(rb_bytes),
        default_checked: true,
    });

    // 4. Web Browser Caches (Chrome, Edge, Brave)
    let mut bc_count = 0;
    let mut bc_bytes = 0;
    for bc_path in get_browser_cache_paths() {
        let (c, b) = scan_folder_stats(&bc_path, 2);
        bc_count += c;
        bc_bytes += b;
    }
    categories.push(CleanupCategoryInfo {
        id: "browser_cache".to_string(),
        name: "Browser Web Caches".to_string(),
        description: "Cached website assets and HTTP caches from Chrome, Edge, and Brave".to_string(),
        file_count: bc_count,
        size_bytes: bc_bytes,
        size_formatted: format_bytes(bc_bytes),
        default_checked: true,
    });

    // 5. Windows Crash Dumps
    let local_data = dirs::data_local_dir();
    let crash_dir = local_data.as_ref().map(|d| d.join("CrashDumps"));
    let (c_count, c_bytes) = crash_dir
        .as_ref()
        .map(|d| scan_folder_stats(d, 2))
        .unwrap_or((0, 0));
    categories.push(CleanupCategoryInfo {
        id: "crash_dumps".to_string(),
        name: "Application Crash Dumps".to_string(),
        description: "Post-mortem memory dumps left by closed processes".to_string(),
        file_count: c_count,
        size_bytes: c_bytes,
        size_formatted: format_bytes(c_bytes),
        default_checked: true,
    });

    // 6. Thumbnails Cache
    let thumb_dir = local_data
        .as_ref()
        .map(|d| d.join("Microsoft").join("Windows").join("Explorer"));
    let (th_count, th_bytes) = thumb_dir
        .as_ref()
        .map(|d| scan_folder_stats(d, 1))
        .unwrap_or((0, 0));
    categories.push(CleanupCategoryInfo {
        id: "thumbnails".to_string(),
        name: "Thumbnail & Icon Caches".to_string(),
        description: "Cached preview thumbnails that Windows can rebuild seamlessly".to_string(),
        file_count: th_count,
        size_bytes: th_bytes,
        size_formatted: format_bytes(th_bytes),
        default_checked: true,
    });

    // 7. Windows Error Reporting (WER)
    let wer_dir = local_data
        .as_ref()
        .map(|d| d.join("Microsoft").join("Windows").join("WER"));
    let (w_count, w_bytes) = wer_dir
        .as_ref()
        .map(|d| scan_folder_stats(d, 2))
        .unwrap_or((0, 0));
    categories.push(CleanupCategoryInfo {
        id: "wer_reports".to_string(),
        name: "Windows Error Reports".to_string(),
        description: "Archived telemetry reports and error diagnosis queues".to_string(),
        file_count: w_count,
        size_bytes: w_bytes,
        size_formatted: format_bytes(w_bytes),
        default_checked: true,
    });

    categories
}

pub fn preview_cleanup() -> CleanupSummary {
    let categories = get_cleanup_categories();
    let total_files = categories.iter().map(|c| c.file_count).sum();
    let total_bytes = categories.iter().map(|c| c.size_bytes).sum();

    CleanupSummary {
        total_files,
        total_bytes,
        total_formatted: format_bytes(total_bytes),
        categories,
    }
}

pub fn execute_cleanup(categories: &[String], db: &Database) -> Result<CleanupResult, AppError> {
    let mut total_cleaned = 0;
    let mut total_reclaimed = 0;

    let temp_dir = std::env::temp_dir();
    let sys_temp = PathBuf::from(r"C:\Windows\Temp");
    let local_data = dirs::data_local_dir();

    for cat in categories {
        let (count, bytes) = match cat.as_str() {
            "user_temp" => clean_folder(&temp_dir),
            "system_temp" => clean_folder(&sys_temp),
            "recycle_bin" => empty_recycle_bin(),
            "browser_cache" => {
                let mut b_count = 0;
                let mut b_bytes = 0;
                for p in get_browser_cache_paths() {
                    let (c, b) = clean_folder(&p);
                    b_count += c;
                    b_bytes += b;
                }
                (b_count, b_bytes)
            }
            "crash_dumps" => {
                if let Some(ref d) = local_data {
                    clean_folder(&d.join("CrashDumps"))
                } else {
                    (0, 0)
                }
            }
            "wer_reports" => {
                if let Some(ref d) = local_data {
                    let wer_archive = d
                        .join("Microsoft")
                        .join("Windows")
                        .join("WER")
                        .join("ReportArchive");
                    let wer_queue = d
                        .join("Microsoft")
                        .join("Windows")
                        .join("WER")
                        .join("ReportQueue");
                    let (c1, b1) = clean_folder(&wer_archive);
                    let (c2, b2) = clean_folder(&wer_queue);
                    (c1 + c2, b1 + b2)
                } else {
                    (0, 0)
                }
            }
            "thumbnails" => {
                if let Some(ref d) = local_data {
                    let thumb_dir = d.join("Microsoft").join("Windows").join("Explorer");
                    clean_folder(&thumb_dir)
                } else {
                    (0, 0)
                }
            }
            _ => (0, 0),
        };

        total_cleaned += count;
        total_reclaimed += bytes;
    }

    // Record action into database
    let log_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let detail = serde_json::json!({
        "files_cleaned": total_cleaned,
        "bytes_reclaimed": total_reclaimed,
        "categories": categories,
    })
    .to_string();

    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let _ = guard.execute(
            "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![log_id, "cleaner_run", detail, now],
        );
    }

    Ok(CleanupResult {
        cleaned_files: total_cleaned,
        reclaimed_bytes: total_reclaimed,
        reclaimed_formatted: format_bytes(total_reclaimed),
        message: format!(
            "Successfully cleaned {} temporary items, freeing {}.",
            total_cleaned,
            format_bytes(total_reclaimed)
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_cleanup_categories_includes_all_targets() {
        let cats = get_cleanup_categories();
        assert!(cats.len() >= 7, "Should include at least 7 cleanup categories");
        let ids: Vec<String> = cats.into_iter().map(|c| c.id).collect();
        assert!(ids.contains(&"user_temp".to_string()));
        assert!(ids.contains(&"system_temp".to_string()));
        assert!(ids.contains(&"recycle_bin".to_string()));
        assert!(ids.contains(&"browser_cache".to_string()));
        assert!(ids.contains(&"crash_dumps".to_string()));
        assert!(ids.contains(&"thumbnails".to_string()));
        assert!(ids.contains(&"wer_reports".to_string()));
    }

    #[test]
    fn test_preview_cleanup_runs() {
        let preview = preview_cleanup();
        assert!(preview.categories.len() >= 7);
        assert!(!preview.total_formatted.is_empty());
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(2048), "2.0 KB");
        assert_eq!(format_bytes(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(format_bytes(3 * 1024 * 1024 * 1024), "3.0 GB");
    }
}
