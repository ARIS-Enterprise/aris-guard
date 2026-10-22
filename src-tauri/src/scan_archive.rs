use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntryItem {
    pub path: String,
    pub uncompressed_size: u64,
    pub is_executable: bool,
    pub is_script: bool,
    pub risk_level: String, // "High" | "Medium" | "Low"
    pub risk_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveAnalysisResult {
    pub is_archive: bool,
    pub archive_format: String,
    pub total_files: usize,
    pub total_uncompressed_bytes: u64,
    pub compression_ratio: f64,
    pub is_encrypted: bool,
    pub has_zip_bomb: bool,
    pub has_zip_slip: bool,
    pub has_hidden_executables: bool,
    pub dangerous_entries: Vec<ArchiveEntryItem>,
    pub all_entries: Vec<ArchiveEntryItem>,
}

const DANGEROUS_EXTENSIONS: &[&str] = &[
    ".exe", ".scr", ".bat", ".cmd", ".vbs", ".ps1", ".js", ".jse", ".hta", ".iso", ".img", ".vhd",
    ".dll", ".sys", ".com", ".pif", ".cpl", ".wsf",
];

const SCRIPT_EXTENSIONS: &[&str] = &[".bat", ".cmd", ".vbs", ".ps1", ".js", ".hta", ".wsf"];

/// Check if byte slice starts with known archive signatures (ZIP, RAR, 7z, GZ, CAB).
pub fn detect_archive_format(data: &[u8]) -> Option<&'static str> {
    if data.len() < 4 {
        return None;
    }

    if data.starts_with(b"PK\x03\x04") || data.starts_with(b"PK\x05\x06") {
        Some("ZIP Archive")
    } else if data.starts_with(b"Rar!\x1a\x07") {
        Some("RAR Archive")
    } else if data.len() >= 6 && &data[0..6] == b"7z\xbc\xaf\x27\x1c" {
        Some("7-Zip Archive")
    } else if data.starts_with(b"\x1f\x8b") {
        Some("GZIP Archive")
    } else if data.starts_with(b"MSCF") {
        Some("Cabinet Archive")
    } else {
        None
    }
}

/// Parse and deeply analyze ZIP archive structures for hidden malware, zip bombs, zip slips,
/// password-protected evasions, and nested executables.
pub fn analyze_archive(data: &[u8], file_name: &str) -> Option<ArchiveAnalysisResult> {
    let lower_name = file_name.to_ascii_lowercase();
    let detected_format = detect_archive_format(data);

    if detected_format.is_none()
        && !lower_name.ends_with(".zip")
        && !lower_name.ends_with(".rar")
        && !lower_name.ends_with(".7z")
    {
        return None;
    }

    let format_label = detected_format.unwrap_or("Compressed Archive").to_string();

    // Check if valid ZIP format with Central Directory
    let mut total_files = 0;
    let mut total_uncompressed: u64 = 0;
    let mut total_compressed: u64 = 0;
    let mut is_encrypted = false;
    let mut has_zip_slip = false;
    let mut has_zip_bomb = false;
    let mut all_entries: Vec<ArchiveEntryItem> = Vec::new();
    let mut dangerous_entries: Vec<ArchiveEntryItem> = Vec::new();

    // Look for End of Central Directory record (signature: PK\x05\x06 = 0x06054b50)
    // Scan up to 65KB from the end of the file
    let search_start = data.len().saturating_sub(65536 + 22);
    let mut eocd_pos = None;

    for i in (search_start..data.len().saturating_sub(21)).rev() {
        if &data[i..i + 4] == b"PK\x05\x06" {
            eocd_pos = Some(i);
            break;
        }
    }

    if let Some(pos) = eocd_pos {
        let total_cd_records = u16::from_le_bytes([data[pos + 10], data[pos + 11]]) as usize;
        let cd_size = u32::from_le_bytes([
            data[pos + 12],
            data[pos + 13],
            data[pos + 14],
            data[pos + 15],
        ]) as usize;
        let cd_offset = u32::from_le_bytes([
            data[pos + 16],
            data[pos + 17],
            data[pos + 18],
            data[pos + 19],
        ]) as usize;

        if cd_offset + cd_size <= data.len() {
            let mut cursor = cd_offset;
            for _ in 0..total_cd_records.min(500) {
                if cursor + 46 > data.len() {
                    break;
                }
                if &data[cursor..cursor + 4] != b"PK\x01\x02" {
                    break;
                }

                let flags = u16::from_le_bytes([data[cursor + 8], data[cursor + 9]]);
                if flags & 1 != 0 {
                    is_encrypted = true;
                }

                let comp_size = u32::from_le_bytes([
                    data[cursor + 20],
                    data[cursor + 21],
                    data[cursor + 22],
                    data[cursor + 23],
                ]) as u64;

                let uncomp_size = u32::from_le_bytes([
                    data[cursor + 24],
                    data[cursor + 25],
                    data[cursor + 26],
                    data[cursor + 27],
                ]) as u64;

                let name_len = u16::from_le_bytes([data[cursor + 28], data[cursor + 29]]) as usize;
                let extra_len = u16::from_le_bytes([data[cursor + 30], data[cursor + 31]]) as usize;
                let comment_len =
                    u16::from_le_bytes([data[cursor + 32], data[cursor + 33]]) as usize;

                let name_start = cursor + 46;
                let name_end = (name_start + name_len).min(data.len());
                let raw_name = String::from_utf8_lossy(&data[name_start..name_end]).to_string();

                total_files += 1;
                total_uncompressed += uncomp_size;
                total_compressed += comp_size;

                let norm_name = raw_name.replace('\\', "/");
                let lower_entry_name = norm_name.to_ascii_lowercase();

                // 1. Check Zip Slip (Path Traversal attempt)
                if norm_name.contains("../")
                    || norm_name.contains("..\\")
                    || norm_name.starts_with('/')
                    || norm_name.contains(":/")
                {
                    has_zip_slip = true;
                }

                // 2. Check dangerous extensions
                let is_exec = DANGEROUS_EXTENSIONS
                    .iter()
                    .any(|ext| lower_entry_name.ends_with(ext));
                let is_script = SCRIPT_EXTENSIONS
                    .iter()
                    .any(|ext| lower_entry_name.ends_with(ext));

                let (risk_level, risk_reason) = if is_exec {
                    (
                        "High".to_string(),
                        Some("Disguised/Packed Executable inside archive".to_string()),
                    )
                } else if is_script {
                    (
                        "Medium".to_string(),
                        Some("Directly runnable script inside archive".to_string()),
                    )
                } else if has_zip_slip {
                    (
                        "High".to_string(),
                        Some("Path traversal (Zip-Slip) attack entry".to_string()),
                    )
                } else {
                    ("Low".to_string(), None)
                };

                let entry_item = ArchiveEntryItem {
                    path: norm_name,
                    uncompressed_size: uncomp_size,
                    is_executable: is_exec,
                    is_script,
                    risk_level,
                    risk_reason,
                };

                if is_exec || is_script || has_zip_slip {
                    dangerous_entries.push(entry_item.clone());
                }
                all_entries.push(entry_item);

                cursor += 46 + name_len + extra_len + comment_len;
            }
        }
    } else {
        // Fallback for non-ZIP formats (e.g. RAR, 7z) or raw archive inspection:
        // Search raw data for embedded MZ headers or executable extensions
        let has_embedded_mz = data.windows(2).any(|w| w == b"MZ");
        let has_embedded_exe = data.windows(4).any(|w| w.eq_ignore_ascii_case(b".exe"));

        if has_embedded_mz || has_embedded_exe {
            let item = ArchiveEntryItem {
                path: format!("{file_name} [Embedded Executable Payload]"),
                uncompressed_size: data.len() as u64,
                is_executable: true,
                is_script: false,
                risk_level: "High".to_string(),
                risk_reason: Some("Detected embedded PE binary payload inside archive".to_string()),
            };
            dangerous_entries.push(item.clone());
            all_entries.push(item);
            total_files = 1;
            total_uncompressed = data.len() as u64;
            total_compressed = data.len() as u64;
        }
    }

    let compression_ratio = if total_compressed > 0 {
        total_uncompressed as f64 / total_compressed as f64
    } else {
        1.0
    };

    // Flag Zip Bomb if ratio > 80:1 or total uncompressed size exceeds 500 MB
    if compression_ratio > 80.0 || total_uncompressed > (500 * 1024 * 1024) {
        has_zip_bomb = true;
    }

    let has_hidden_executables = !dangerous_entries.is_empty();

    Some(ArchiveAnalysisResult {
        is_archive: true,
        archive_format: format_label,
        total_files,
        total_uncompressed_bytes: total_uncompressed,
        compression_ratio,
        is_encrypted,
        has_zip_bomb,
        has_zip_slip,
        has_hidden_executables,
        dangerous_entries,
        all_entries,
    })
}
