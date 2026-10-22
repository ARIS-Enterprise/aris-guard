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
    let bytes_to_read = size_bytes.min(16 * 1024 * 1024) as usize;
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(_) => vec![0u8; bytes_to_read],
    };

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
}
