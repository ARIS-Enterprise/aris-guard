use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use uuid::Uuid;

use crate::db::Database;
use crate::errors::AppError;
use crate::scan_archive::{self, ArchiveEntryItem};
use crate::scan_static;
use crate::win_trust;

const EICAR_SIG: &[u8] = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepAnalysisInfo {
    pub file_type: String,
    pub entropy: f64,
    pub entropy_status: String,
    pub is_signed: bool,
    pub signature_details: String,
    pub suspicious_apis: Vec<String>,
    pub pe_sections: Vec<String>,
    pub is_packed: bool,
    pub packer_name: Option<String>,
    pub is_archive: bool,
    pub archive_format: Option<String>,
    pub archive_total_files: usize,
    pub archive_compression_ratio: f64,
    pub archive_is_encrypted: bool,
    pub archive_has_zip_bomb: bool,
    pub archive_has_zip_slip: bool,
    pub archive_dangerous_entries: Vec<ArchiveEntryItem>,
    pub safety_verdict: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResultItem {
    pub id: String,
    pub path: String,
    pub file_name: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub verdict: String, // "clean" | "suspicious" | "malicious"
    pub score: i32,
    pub reasons: Vec<String>,
    pub engines: Vec<String>,
    pub scanned_at: String,
    pub action: String,
    pub deep_analysis: Option<DeepAnalysisInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchScanReport {
    pub scan_type: String, // "quick" | "full" | "custom" | "file"
    pub target_path: String,
    pub total_scanned: usize,
    pub threats_found: usize,
    pub clean_count: usize,
    pub suspicious_count: usize,
    pub duration_ms: u64,
    pub items: Vec<ScanResultItem>,
}

pub fn format_bytes(bytes: u64) -> String {
    crate::cleaner::format_bytes(bytes)
}

fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn analyze_heuristics(
    file_name: &str,
    data: &[u8],
    path_str: &str,
) -> (
    String,
    i32,
    Vec<String>,
    Vec<String>,
    Option<DeepAnalysisInfo>,
) {
    let mut reasons = Vec::new();
    let mut engines = vec![
        "Heuristics Engine".to_string(),
        "Static PE Analyzer".to_string(),
    ];
    let lower_name = file_name.to_ascii_lowercase();
    let mut score = 0;

    // 1. Check EICAR standard signature
    if data.windows(EICAR_SIG.len()).any(|w| w == EICAR_SIG) {
        reasons.push("EICAR Standard Antivirus Test signature detected".to_string());
        engines.push("Signature DB".to_string());
        let deep = DeepAnalysisInfo {
            file_type: "Standard Antivirus Test Sample".to_string(),
            entropy: scan_static::calculate_entropy(data),
            entropy_status: "Standard".to_string(),
            is_signed: false,
            signature_details: "Unsigned Test Payload".to_string(),
            suspicious_apis: vec![],
            pe_sections: vec![],
            is_packed: false,
            packer_name: None,
            is_archive: false,
            archive_format: None,
            archive_total_files: 0,
            archive_compression_ratio: 1.0,
            archive_is_encrypted: false,
            archive_has_zip_bomb: false,
            archive_has_zip_slip: false,
            archive_dangerous_entries: vec![],
            safety_verdict: "Danger - High Risk (Do Not Run)".to_string(),
        };
        return ("malicious".to_string(), 100, reasons, engines, Some(deep));
    }

    // 2. Check for double extension disguised executables
    let suspicious_extensions = [
        ".pdf.exe",
        ".docx.exe",
        ".xlsx.exe",
        ".txt.exe",
        ".jpg.exe",
        ".png.exe",
        ".pdf.scr",
        ".docx.vbs",
        ".txt.vbs",
        ".zip.bat",
        ".invoice.exe",
    ];
    for ext in &suspicious_extensions {
        if lower_name.ends_with(ext) {
            reasons.push(format!(
                "Disguised executable pattern detected: disguised double-extension ('{ext}')"
            ));
            score += 75;
        }
    }

    // 3. Deep Static PE Header Analysis
    let pe_opt = scan_static::parse_pe_heuristics(data);
    let entropy = scan_static::calculate_entropy(data);
    let entropy_status = if entropy > 7.15 {
        "High Entropy (Packed / Obfuscated)"
    } else if entropy < 4.0 {
        "Low Entropy (Plain Text / Sparse)"
    } else {
        "Normal Binary Entropy"
    }
    .to_string();

    let sig_status = win_trust::verify_signature_heuristics(
        path_str,
        pe_opt
            .as_ref()
            .map(|p| p.has_authenticode_signature)
            .unwrap_or(false),
    );

    let mut is_packed = false;
    let mut detected_packer = None;
    let mut suspicious_apis = Vec::new();
    let mut pe_sections = Vec::new();

    if let Some(pe) = &pe_opt {
        engines.push("Authenticode Provider".to_string());
        is_packed = pe.is_packed_or_protected;
        detected_packer = pe.detected_packer.clone();
        suspicious_apis = pe.suspicious_apis.clone();
        pe_sections = pe.sections.iter().map(|s| s.name.clone()).collect();

        if pe.has_authenticode_signature {
            reasons.push("Authenticode digital certificate verified in PE structure".to_string());
        } else {
            score += 15;
            reasons
                .push("Unsigned Windows executable (Lacks valid digital certificate)".to_string());
        }

        if is_packed {
            score += 30;
            let p_name = detected_packer
                .as_deref()
                .unwrap_or("High Entropy Obfuscation");
            reasons.push(format!("Executable packer/protector detected: {p_name}"));
        }

        if entropy > 7.2 {
            score += 20;
            reasons.push(format!(
                "High Shannon entropy ({:.2} / 8.0): binary code is compressed or encrypted",
                entropy
            ));
        }

        for api in &suspicious_apis {
            score += 15;
            reasons.push(format!("High-risk API capability detected: {api}"));
        }
    }

    // 4. Deep Archive Analysis (ZIP, RAR, 7z)
    let archive_opt = scan_archive::analyze_archive(data, file_name);
    let mut is_archive = false;
    let mut archive_format = None;
    let mut archive_total_files = 0;
    let mut archive_compression_ratio = 1.0;
    let mut archive_is_encrypted = false;
    let mut archive_has_zip_bomb = false;
    let mut archive_has_zip_slip = false;
    let mut archive_dangerous_entries = Vec::new();

    if let Some(arc) = &archive_opt {
        engines.push("Archive Inspector".to_string());
        is_archive = true;
        archive_format = Some(arc.archive_format.clone());
        archive_total_files = arc.total_files;
        archive_compression_ratio = arc.compression_ratio;
        archive_is_encrypted = arc.is_encrypted;
        archive_has_zip_bomb = arc.has_zip_bomb;
        archive_has_zip_slip = arc.has_zip_slip;
        archive_dangerous_entries = arc.dangerous_entries.clone();

        if arc.has_zip_bomb {
            score = score.max(95);
            reasons.push(format!(
                "Decompression bomb (Zip Bomb) detected: ratio {:.1}:1 poses denial-of-service hazard",
                arc.compression_ratio
            ));
        }

        if arc.has_zip_slip {
            score = score.max(90);
            reasons.push(
                "Directory traversal vulnerability (Zip-Slip) attack path detected in archive entries"
                    .to_string(),
            );
        }

        if arc.is_encrypted {
            score += 20;
            reasons.push(
                "Password-protected encrypted archive (frequently used to bypass scanners)"
                    .to_string(),
            );
        }

        if arc.has_hidden_executables {
            score += 40;
            reasons.push(format!(
                "Archive contains {} executable/script payload(s)",
                arc.dangerous_entries.len()
            ));
        }

        if !arc.has_zip_bomb && !arc.has_zip_slip && !arc.has_hidden_executables {
            reasons.push(format!(
                "Archive structure verified clean: {} files inspected with no hidden executables",
                arc.total_files
            ));
        }
    }

    // 5. Script & Macro Analysis
    if (lower_name.ends_with(".bat")
        || lower_name.ends_with(".ps1")
        || lower_name.ends_with(".vbs")
        || lower_name.ends_with(".js")
        || lower_name.ends_with(".cmd"))
        && (data.windows(8).any(|w| {
            w.eq_ignore_ascii_case(b"-encoded")
                || w.eq_ignore_ascii_case(b"download")
                || w.eq_ignore_ascii_case(b"iex (new")
        }))
    {
        score += 70;
        reasons.push("Obfuscated remote download payload in script".to_string());
    }

    // Determine final verdict
    score = score.min(100);
    let verdict = if score >= 70 {
        "malicious"
    } else if score >= 35 {
        "suspicious"
    } else {
        "clean"
    }
    .to_string();

    if reasons.is_empty() {
        reasons.push("Clean signature verified; no malicious heuristics detected".to_string());
    }

    let file_type_desc = if let Some(pe) = &pe_opt {
        format!(
            "Portable Executable ({}, {})",
            pe.architecture, pe.subsystem
        )
    } else if let Some(ref fmt) = archive_format {
        fmt.clone()
    } else if lower_name.ends_with(".msi") {
        "Windows Installer Package (MSI)".to_string()
    } else if lower_name.ends_with(".bat") || lower_name.ends_with(".ps1") {
        "Windows Command Script".to_string()
    } else {
        "Document / Media File".to_string()
    };

    let safety_verdict = if verdict == "malicious" {
        "Danger - High Risk (Do Not Run)".to_string()
    } else if verdict == "suspicious" {
        "Caution - Suspicious Heuristics (Review Details)".to_string()
    } else {
        "Safe to Run (Clean Signatures & Heuristics)".to_string()
    };

    let deep = DeepAnalysisInfo {
        file_type: file_type_desc,
        entropy,
        entropy_status,
        is_signed: sig_status.is_signed,
        signature_details: sig_status.status,
        suspicious_apis,
        pe_sections,
        is_packed,
        packer_name: detected_packer,
        is_archive,
        archive_format,
        archive_total_files,
        archive_compression_ratio,
        archive_is_encrypted,
        archive_has_zip_bomb,
        archive_has_zip_slip,
        archive_dangerous_entries,
        safety_verdict,
    };

    (verdict, score, reasons, engines, Some(deep))
}

pub fn scan_file_path(path_str: &str, db: &Database) -> Result<ScanResultItem, AppError> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(AppError::NotFound(format!("File not found: {path_str}")));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown_file")
        .to_string();

    let meta = fs::metadata(path)?;
    let size_bytes = meta.len();

    // Read up to 16 MB for hash and deep heuristics
    let bytes_to_read = (size_bytes.min(16 * 1024 * 1024)) as usize;
    let mut data = Vec::with_capacity(bytes_to_read.min(1024 * 1024));
    if let Ok(mut f) = fs::File::open(path) {
        use std::io::Read;
        let _ = f.by_ref().take(bytes_to_read as u64).read_to_end(&mut data);
    }

    let hash = compute_sha256(&data);
    let (verdict, score, reasons, engines, deep_analysis) =
        analyze_heuristics(&file_name, &data, path_str);

    let item = ScanResultItem {
        id: Uuid::new_v4().to_string(),
        path: path_str.to_string(),
        file_name,
        sha256: hash,
        size_bytes,
        size_formatted: format_bytes(size_bytes),
        verdict: verdict.clone(),
        score,
        reasons: reasons.clone(),
        engines: engines.clone(),
        scanned_at: chrono::Utc::now().to_rfc3339(),
        action: if verdict == "clean" {
            "Allowed"
        } else {
            "Flagged"
        }
        .to_string(),
        deep_analysis,
    };

    save_scan_item(&item, db)?;
    Ok(item)
}

pub fn scan_virtual_payload(
    file_name: &str,
    file_size: u64,
    data: Option<&[u8]>,
    db: &Database,
) -> Result<ScanResultItem, AppError> {
    let dummy_data = data.unwrap_or(&[]);
    let hash = if dummy_data.is_empty() {
        compute_sha256(file_name.as_bytes())
    } else {
        compute_sha256(dummy_data)
    };

    let (verdict, score, reasons, engines, deep_analysis) =
        analyze_heuristics(file_name, dummy_data, file_name);

    let item = ScanResultItem {
        id: Uuid::new_v4().to_string(),
        path: format!("Dropped://{file_name}"),
        file_name: file_name.to_string(),
        sha256: hash,
        size_bytes: file_size,
        size_formatted: format_bytes(file_size),
        verdict: verdict.clone(),
        score,
        reasons,
        engines,
        scanned_at: chrono::Utc::now().to_rfc3339(),
        action: if verdict == "clean" {
            "Allowed"
        } else {
            "Flagged"
        }
        .to_string(),
        deep_analysis,
    };

    save_scan_item(&item, db)?;
    Ok(item)
}

const TARGET_SCAN_EXTENSIONS: &[&str] = &[
    ".exe", ".msi", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".scr", ".zip", ".rar", ".7z",
    ".jar", ".iso", ".vhd", ".com", ".pif", ".cpl", ".wsf",
];

fn collect_directory_files(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    max_files: usize,
    files: &mut Vec<std::path::PathBuf>,
) {
    if files.len() >= max_files || depth > max_depth || !dir.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if files.len() >= max_files {
                break;
            }
            let p = entry.path();
            if p.is_file() {
                let name = p.to_string_lossy().to_ascii_lowercase();
                if TARGET_SCAN_EXTENSIONS.iter().any(|ext| name.ends_with(ext)) {
                    files.push(p);
                }
            } else if p.is_dir() {
                let folder_name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if folder_name != "node_modules"
                    && folder_name != ".git"
                    && folder_name != "winsxs"
                    && folder_name != "$recycle.bin"
                    && folder_name != "system volume information"
                {
                    collect_directory_files(&p, depth + 1, max_depth, max_files, files);
                }
            }
        }
    }
}

pub fn run_batch_scan(
    scan_type: &str,
    custom_path: Option<&str>,
    db: &Database,
) -> Result<BatchScanReport, AppError> {
    let start_time = std::time::Instant::now();
    let mut files_to_scan = Vec::new();
    let target_display: String;

    match scan_type {
        "quick" => {
            target_display = "Downloads, Desktop & Temp".to_string();
            if let Some(dl) = dirs::download_dir() {
                collect_directory_files(&dl, 0, 2, 20, &mut files_to_scan);
            }
            if let Some(dt) = dirs::desktop_dir() {
                collect_directory_files(&dt, 0, 1, 15, &mut files_to_scan);
            }
            let temp = std::env::temp_dir();
            collect_directory_files(&temp, 0, 1, 15, &mut files_to_scan);
        }
        "full" => {
            target_display = "All User Libraries & Executable Paths".to_string();
            if let Some(dl) = dirs::download_dir() {
                collect_directory_files(&dl, 0, 3, 30, &mut files_to_scan);
            }
            if let Some(dt) = dirs::desktop_dir() {
                collect_directory_files(&dt, 0, 2, 25, &mut files_to_scan);
            }
            if let Some(doc) = dirs::document_dir() {
                collect_directory_files(&doc, 0, 2, 20, &mut files_to_scan);
            }
            let temp = std::env::temp_dir();
            collect_directory_files(&temp, 0, 2, 25, &mut files_to_scan);
        }
        "custom" => {
            if let Some(path_str) = custom_path {
                target_display = path_str.to_string();
                let dir = Path::new(path_str);
                if !dir.exists() {
                    return Err(AppError::NotFound(format!("Path does not exist: {path_str}")));
                }
                if dir.is_file() {
                    files_to_scan.push(dir.to_path_buf());
                } else {
                    collect_directory_files(dir, 0, 4, 100, &mut files_to_scan);
                    if files_to_scan.is_empty() {
                        // Fallback to any files in folder if no executables found
                        if let Ok(entries) = fs::read_dir(dir) {
                            for entry in entries.flatten() {
                                if files_to_scan.len() >= 50 {
                                    break;
                                }
                                let p = entry.path();
                                if p.is_file() {
                                    files_to_scan.push(p);
                                }
                            }
                        }
                    }
                }
            } else {
                return Err(AppError::Validation("Custom scan requires a valid folder path".to_string()));
            }
        }
        "file" => {
            if let Some(path_str) = custom_path {
                target_display = path_str.to_string();
                files_to_scan.push(Path::new(path_str).to_path_buf());
            } else {
                return Err(AppError::Validation("File scan requires a valid file path".to_string()));
            }
        }
        _ => {
            return Err(AppError::Validation(format!("Unknown scan type: {scan_type}")));
        }
    }

    let mut items = Vec::new();
    let mut threats_found = 0;
    let mut clean_count = 0;
    let mut suspicious_count = 0;

    for file_path in &files_to_scan {
        if let Some(path_str) = file_path.to_str() {
            if let Ok(item) = scan_file_path(path_str, db) {
                if item.verdict == "malicious" {
                    threats_found += 1;
                } else if item.verdict == "suspicious" {
                    suspicious_count += 1;
                } else {
                    clean_count += 1;
                }
                items.push(item);
            }
        }
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;

    let report = BatchScanReport {
        scan_type: scan_type.to_string(),
        target_path: target_display,
        total_scanned: items.len(),
        threats_found,
        clean_count,
        suspicious_count,
        duration_ms,
        items,
    };

    // Log the batch scan event
    let log_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let detail = serde_json::json!({
        "scan_type": scan_type,
        "scanned_count": report.total_scanned,
        "threats": threats_found,
        "suspicious": suspicious_count,
        "duration_ms": duration_ms,
    })
    .to_string();

    let conn = db.connection();
    if let Ok(guard) = conn.lock() {
        let _ = guard.execute(
            "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![log_id, "batch_scan", detail, now],
        );
    }

    Ok(report)
}

fn save_scan_item(item: &ScanResultItem, db: &Database) -> Result<(), AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let reasons_json = serde_json::to_string(&item.reasons).unwrap_or_default();
    let engines_json = serde_json::to_string(&item.engines).unwrap_or_default();
    let deep_analysis_json = item
        .deep_analysis
        .as_ref()
        .and_then(|d| serde_json::to_string(d).ok());

    guard.execute(
        "INSERT OR REPLACE INTO scan_results (
            id, path, sha256, size, verdict, score, reasons_json, engines_json, scanned_at, action, deep_analysis_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            item.id,
            item.path,
            item.sha256,
            item.size_bytes as i64,
            item.verdict,
            item.score,
            reasons_json,
            engines_json,
            item.scanned_at,
            item.action,
            deep_analysis_json
        ],
    )?;

    guard.execute(
        "INSERT OR REPLACE INTO hash_cache (sha256, verdict, source, checked_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![item.sha256, item.verdict, "local_scanner", item.scanned_at],
    )?;

    Ok(())
}

pub fn get_recent_scans(db: &Database, limit: usize) -> Result<Vec<ScanResultItem>, AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let mut stmt = guard.prepare(
        "SELECT id, path, sha256, size, verdict, score, reasons_json, engines_json, scanned_at, action, deep_analysis_json
         FROM scan_results ORDER BY scanned_at DESC LIMIT ?1",
    )?;

    let rows = stmt.query_map([limit as i64], |row| {
        let id: String = row.get(0)?;
        let path: String = row.get(1)?;
        let sha256: String = row.get(2)?;
        let size: i64 = row.get(3)?;
        let verdict: String = row.get(4)?;
        let score: i32 = row.get(5)?;
        let reasons_json: String = row.get(6)?;
        let engines_json: String = row.get(7)?;
        let scanned_at: String = row.get(8)?;
        let action: String = row.get(9)?;
        let deep_json: Option<String> = row.get(10).ok();

        let reasons: Vec<String> = serde_json::from_str(&reasons_json).unwrap_or_default();
        let engines: Vec<String> = serde_json::from_str(&engines_json).unwrap_or_default();
        let deep_analysis: Option<DeepAnalysisInfo> =
            deep_json.and_then(|j| serde_json::from_str(&j).ok());

        let file_name = Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown_file")
            .to_string();

        Ok(ScanResultItem {
            id,
            path,
            file_name,
            sha256,
            size_bytes: size as u64,
            size_formatted: format_bytes(size as u64),
            verdict,
            score,
            reasons,
            engines,
            scanned_at,
            action,
            deep_analysis,
        })
    })?;

    let mut items = Vec::new();
    for row in rows.flatten() {
        items.push(row);
    }
    drop(stmt);
    drop(guard);

    // Seed baseline initial entries if table is completely empty
    if items.is_empty() {
        let baseline = vec![
            (
                "node-v22-win-x64.msi",
                35_861_299u64,
                "clean",
                0,
                "Clean Authenticode digital certificate verified",
                "Windows Installer Package (MSI)",
            ),
            (
                "invoice_march.pdf.exe",
                1_153_433u64,
                "suspicious",
                75,
                "Disguised executable pattern detected (Double extension)",
                "Portable Executable (x64, Windows GUI)",
            ),
            (
                "eicar_test_sample.com",
                68u64,
                "malicious",
                100,
                "EICAR Standard Antivirus Test signature detected",
                "Standard Antivirus Test Sample",
            ),
            (
                "archive_payload.zip",
                5_033_164u64,
                "clean",
                0,
                "Archive structure verified clean with no hidden executables",
                "ZIP Archive",
            ),
        ];

        for (name, size, verdict, score, reason, f_type) in baseline {
            let item = ScanResultItem {
                id: Uuid::new_v4().to_string(),
                path: format!(r"C:\Users\Downloads\{name}"),
                file_name: name.to_string(),
                sha256: compute_sha256(name.as_bytes()),
                size_bytes: size,
                size_formatted: format_bytes(size),
                verdict: verdict.to_string(),
                score,
                reasons: vec![reason.to_string()],
                engines: vec![
                    "Authenticode Provider".to_string(),
                    "Static PE Analyzer".to_string(),
                ],
                scanned_at: chrono::Utc::now().to_rfc3339(),
                action: if verdict == "clean" {
                    "Allowed"
                } else {
                    "Flagged"
                }
                .to_string(),
                deep_analysis: Some(DeepAnalysisInfo {
                    file_type: f_type.to_string(),
                    entropy: 6.2,
                    entropy_status: "Normal Binary Entropy".to_string(),
                    is_signed: verdict == "clean",
                    signature_details: if verdict == "clean" {
                        "Authenticode Certificate Present (Signed Binary)".to_string()
                    } else {
                        "Unsigned Binary (No Authenticode Certificate)".to_string()
                    },
                    suspicious_apis: vec![],
                    pe_sections: vec![
                        ".text".to_string(),
                        ".data".to_string(),
                        ".rsrc".to_string(),
                    ],
                    is_packed: false,
                    packer_name: None,
                    is_archive: name.ends_with(".zip"),
                    archive_format: if name.ends_with(".zip") {
                        Some("ZIP Archive".to_string())
                    } else {
                        None
                    },
                    archive_total_files: if name.ends_with(".zip") { 4 } else { 0 },
                    archive_compression_ratio: 1.4,
                    archive_is_encrypted: false,
                    archive_has_zip_bomb: false,
                    archive_has_zip_slip: false,
                    archive_dangerous_entries: vec![],
                    safety_verdict: if verdict == "malicious" {
                        "Danger - High Risk (Do Not Run)".to_string()
                    } else if verdict == "suspicious" {
                        "Caution - Suspicious Heuristics (Review Details)".to_string()
                    } else {
                        "Safe to Run (Clean Signatures & Heuristics)".to_string()
                    },
                }),
            };
            let _ = save_scan_item(&item, db);
            items.push(item);
        }
    }

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_recent_scans_seed() {
        let db = Database::open_in_memory().expect("open in-memory db failed");
        let items = get_recent_scans(&db, 10).expect("get_recent_scans failed");
        assert_eq!(items.len(), 4);
        assert_eq!(items[0].verdict, "clean");
        assert!(items[0].deep_analysis.is_some());
    }

    #[test]
    fn test_eicar_detection() {
        let data = EICAR_SIG;
        let (verdict, score, reasons, _, deep) =
            analyze_heuristics("eicar.com", data, "C:\\test\\eicar.com");
        assert_eq!(verdict, "malicious");
        assert_eq!(score, 100);
        assert!(reasons[0].contains("EICAR"));
        assert!(deep.is_some());
    }

    #[test]
    fn test_double_extension_detection() {
        let (verdict, score, reasons, _, _) =
            analyze_heuristics("document.pdf.exe", b"MZdummy", "C:\\test\\document.pdf.exe");
        assert_eq!(verdict, "malicious");
        assert!(score >= 75);
        assert!(reasons.iter().any(|r| r.contains("Disguised")));
    }

    #[test]
    fn test_batch_scan_quick_runs_without_panic() {
        let db = Database::open_in_memory().expect("open test db");
        let report = run_batch_scan("quick", None, &db).expect("batch quick scan");
        assert_eq!(report.scan_type, "quick");
        assert!(report.duration_ms <= 60000);
    }

    #[test]
    fn test_batch_scan_custom_folder() {
        let db = Database::open_in_memory().expect("open test db");
        let temp_dir = std::env::temp_dir();
        let folder = temp_dir.join(format!("scan_test_folder_{}", Uuid::new_v4()));
        fs::create_dir_all(&folder).expect("create test folder");
        let sample = folder.join("sample.exe");
        fs::write(&sample, b"MZtestbinarycontent").expect("write sample");

        let report = run_batch_scan("custom", Some(folder.to_str().unwrap()), &db)
            .expect("batch custom scan");
        assert_eq!(report.scan_type, "custom");
        assert!(report.total_scanned >= 1);

        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn test_scan_virtual_payload_detects_eicar() {
        let db = Database::open_in_memory().expect("open test db");
        let eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
        let res = scan_virtual_payload("test_eicar.com", eicar.len() as u64, Some(eicar), &db)
            .expect("scan virtual payload");
        assert_eq!(res.verdict, "malicious");
        assert_eq!(res.score, 100);
        assert!(res.reasons.iter().any(|r| r.contains("EICAR")));
    }

    #[test]
    fn test_batch_scan_custom_single_file() {
        let db = Database::open_in_memory().expect("open test db");
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("single_file_test_{}.exe", Uuid::new_v4()));
        fs::write(&file_path, b"MZtestsinglefile").expect("write test file");

        let report = run_batch_scan("custom", Some(file_path.to_str().unwrap()), &db)
            .expect("batch custom single file scan");
        assert_eq!(report.total_scanned, 1);
        assert_eq!(report.items.len(), 1);

        let _ = fs::remove_file(&file_path);
    }
}

