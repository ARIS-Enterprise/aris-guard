use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeAnalysis {
    pub is_pe: bool,
    pub architecture: String, // "x86 (32-bit)" | "x64 (64-bit)" | "ARM64" | "Unknown"
    pub subsystem: String,    // "Windows GUI" | "Windows Console" | "Native Driver" | "Unknown"
    pub has_authenticode_signature: bool,
    pub sections: Vec<PeSectionInfo>,
    pub is_packed_or_protected: bool,
    pub detected_packer: Option<String>,
    pub suspicious_apis: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeSectionInfo {
    pub name: String,
    pub virtual_size: u32,
    pub raw_size: u32,
    pub entropy: f64,
    pub is_writable_and_executable: bool,
}

/// Calculate Shannon entropy (0.0 to 8.0 bits per byte).
/// Normal compiled binaries: 5.5 to 6.8.
/// High entropy (> 7.1): Packed, encrypted, or obfuscated malware/ransomware.
pub fn calculate_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let mut counts = [0u64; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }

    let len = data.len() as f64;
    let mut entropy = 0.0;

    for &count in &counts {
        if count > 0 {
            let p = count as f64 / len;
            entropy -= p * p.log2();
        }
    }

    entropy
}

/// Known high-risk Windows APIs frequently abused by malware for injection, keylogging, and evasion.
const SUSPICIOUS_API_PATTERNS: &[(&str, &str)] = &[
    // Process Injection & Memory Tampering
    (
        "VirtualAllocEx",
        "Remote memory allocation (Process Injection)",
    ),
    (
        "WriteProcessMemory",
        "Writing into external process memory (Code Injection)",
    ),
    (
        "CreateRemoteThread",
        "Spawning remote execution thread (Process Injection)",
    ),
    (
        "NtUnmapViewOfSection",
        "Process Hollowing primitive (Evasion)",
    ),
    ("QueueUserAPC", "Early bird APC injection primitive"),
    ("SetThreadContext", "Thread hijacking primitive"),
    // Keylogging & Surveillance
    ("GetAsyncKeyState", "Keystroke polling / Keylogger"),
    (
        "SetWindowsHookExA",
        "Global system hook (Keylogger/Spyware)",
    ),
    (
        "SetWindowsHookExW",
        "Global system hook (Keylogger/Spyware)",
    ),
    ("GetForegroundWindow", "Active window spying"),
    // Defense Evasion & Anti-Analysis
    ("IsDebuggerPresent", "Anti-debugging check"),
    ("CheckRemoteDebuggerPresent", "Anti-analysis detection"),
    (
        "AmsiScanBuffer",
        "AMSI Anti-Malware Scan Interface tampering",
    ),
    ("EtwEventWrite", "ETW Telemetry evasion check"),
    // Ransomware & Shadow Copy Destruction
    (
        "vssadmin delete shadows",
        "VSS Shadow copy destruction (Ransomware)",
    ),
    ("bcdedit /set", "Boot configuration tampering"),
    ("CryptEncrypt", "Cryptographic file encryption"),
    // Download & Remote Payload Execution
    ("URLDownloadToFile", "Direct internet payload downloader"),
    (
        "powershell.exe -enc",
        "Obfuscated Base64 PowerShell execution",
    ),
];

/// Known packer section markers (e.g. UPX, Themida, VMProtect, ASPack)
const PACKER_SIGNATURES: &[(&str, &str)] = &[
    ("UPX0", "UPX Executable Packer"),
    ("UPX1", "UPX Executable Packer"),
    ("UPX2", "UPX Executable Packer"),
    (".vmp0", "VMProtect Virtualizer"),
    (".vmp1", "VMProtect Virtualizer"),
    (".themida", "Themida / WinLicense Protector"),
    (".aspack", "ASPack Compressor"),
    ("MPRESS1", "MPRESS Packer"),
    (".petite", "Petite Compressor"),
    (".nsp", "NsPack Compressor"),
];

/// Inspect binary byte array for known suspicious Windows API signatures.
pub fn inspect_suspicious_apis(data: &[u8]) -> Vec<String> {
    let mut detected = Vec::new();

    for &(api_name, description) in SUSPICIOUS_API_PATTERNS {
        let ascii_bytes = api_name.as_bytes();
        if data.windows(ascii_bytes.len()).any(|w| w == ascii_bytes) {
            detected.push(format!("{api_name}: {description}"));
        }
    }

    detected
}

/// Parse Windows Portable Executable (PE) headers and extract architecture, subsystem,
/// security directory (Authenticode signature presence), and section characteristics.
pub fn parse_pe_heuristics(data: &[u8]) -> Option<PeAnalysis> {
    if data.len() < 64 {
        return None;
    }

    // 1. Check DOS MZ Header
    if data[0] != b'M' || data[1] != b'Z' {
        return None;
    }

    // 2. Read e_lfanew at offset 0x3c (little-endian 32-bit integer)
    let e_lfanew = u32::from_le_bytes([data[0x3c], data[0x3d], data[0x3e], data[0x3f]]) as usize;
    if e_lfanew + 4 > data.len() {
        return None;
    }

    // 3. Verify PE signature
    if &data[e_lfanew..e_lfanew + 4] != b"PE\0\0" {
        return None;
    }

    let file_header_offset = e_lfanew + 4;
    if file_header_offset + 20 > data.len() {
        return None;
    }

    // Architecture (Machine)
    let machine = u16::from_le_bytes([data[file_header_offset], data[file_header_offset + 1]]);
    let architecture = match machine {
        0x014c => "x86 (32-bit)",
        0x8664 => "x64 (64-bit)",
        0xaa64 => "ARM64",
        _ => "Unknown Machine",
    }
    .to_string();

    let num_sections =
        u16::from_le_bytes([data[file_header_offset + 2], data[file_header_offset + 3]]) as usize;

    let size_of_optional_header =
        u16::from_le_bytes([data[file_header_offset + 16], data[file_header_offset + 17]]) as usize;

    let optional_header_offset = file_header_offset + 20;
    if optional_header_offset + size_of_optional_header > data.len() {
        return None;
    }

    // Optional header magic: 0x10b = PE32, 0x20b = PE32+ (64-bit)
    let magic = u16::from_le_bytes([
        data[optional_header_offset],
        data[optional_header_offset + 1],
    ]);
    let is_64bit = magic == 0x20b;

    // Subsystem offset at optional_header_offset + 68
    let subsystem_offset = optional_header_offset + 68;

    let subsystem = if subsystem_offset + 2 <= data.len() {
        let sub_val = u16::from_le_bytes([data[subsystem_offset], data[subsystem_offset + 1]]);
        match sub_val {
            2 => "Windows GUI",
            3 => "Windows Console",
            1 => "Native Driver",
            _ => "Standard Subsystem",
        }
        .to_string()
    } else {
        "Unknown".to_string()
    };

    // Authenticode Certificate Table check: Data Directory index 4
    // In PE32: Data directories start at optional_header_offset + 96
    // In PE32+: Data directories start at optional_header_offset + 112
    let data_dir_offset = if is_64bit {
        optional_header_offset + 112
    } else {
        optional_header_offset + 96
    };

    let security_dir_offset = data_dir_offset + (4 * 8); // Index 4: IMAGE_DIRECTORY_ENTRY_SECURITY
    let has_authenticode_signature = if security_dir_offset + 8 <= data.len() {
        let rva = u32::from_le_bytes([
            data[security_dir_offset],
            data[security_dir_offset + 1],
            data[security_dir_offset + 2],
            data[security_dir_offset + 3],
        ]);
        let size = u32::from_le_bytes([
            data[security_dir_offset + 4],
            data[security_dir_offset + 5],
            data[security_dir_offset + 6],
            data[security_dir_offset + 7],
        ]);
        rva > 0 && size > 0
    } else {
        false
    };

    // Parse Sections
    let section_headers_offset = optional_header_offset + size_of_optional_header;
    let mut sections = Vec::new();
    let mut detected_packer: Option<String> = None;

    for i in 0..num_sections.min(16) {
        let sec_offset = section_headers_offset + (i * 40);
        if sec_offset + 40 > data.len() {
            break;
        }

        // Section name (up to 8 bytes, null terminated or truncated)
        let name_bytes = &data[sec_offset..sec_offset + 8];
        let name_end = name_bytes.iter().position(|&b| b == 0).unwrap_or(8);
        let name = String::from_utf8_lossy(&name_bytes[..name_end])
            .trim()
            .to_string();

        let virtual_size = u32::from_le_bytes([
            data[sec_offset + 8],
            data[sec_offset + 9],
            data[sec_offset + 10],
            data[sec_offset + 11],
        ]);

        let raw_size = u32::from_le_bytes([
            data[sec_offset + 16],
            data[sec_offset + 17],
            data[sec_offset + 18],
            data[sec_offset + 19],
        ]);

        let raw_data_ptr = u32::from_le_bytes([
            data[sec_offset + 20],
            data[sec_offset + 21],
            data[sec_offset + 22],
            data[sec_offset + 23],
        ]) as usize;

        let characteristics = u32::from_le_bytes([
            data[sec_offset + 36],
            data[sec_offset + 37],
            data[sec_offset + 38],
            data[sec_offset + 39],
        ]);

        // IMAGE_SCN_MEM_EXECUTE (0x20000000) and IMAGE_SCN_MEM_WRITE (0x80000000)
        let is_writable_and_executable =
            (characteristics & 0x20000000 != 0) && (characteristics & 0x80000000 != 0);

        // Section entropy calculation
        let sec_entropy = if raw_data_ptr + (raw_size as usize) <= data.len() && raw_size > 0 {
            calculate_entropy(&data[raw_data_ptr..raw_data_ptr + (raw_size as usize).min(65536)])
        } else {
            0.0
        };

        // Check packer signatures
        for &(packer_sec, packer_label) in PACKER_SIGNATURES {
            if name.eq_ignore_ascii_case(packer_sec) {
                detected_packer = Some(packer_label.to_string());
            }
        }

        sections.push(PeSectionInfo {
            name,
            virtual_size,
            raw_size,
            entropy: sec_entropy,
            is_writable_and_executable,
        });
    }

    let suspicious_apis = inspect_suspicious_apis(data);
    let overall_entropy = calculate_entropy(data);
    let has_wx_section = sections.iter().any(|s| s.is_writable_and_executable);
    let is_packed_or_protected =
        detected_packer.is_some() || overall_entropy > 7.15 || has_wx_section;

    Some(PeAnalysis {
        is_pe: true,
        architecture,
        subsystem,
        has_authenticode_signature,
        sections,
        is_packed_or_protected,
        detected_packer,
        suspicious_apis,
    })
}
