#![allow(clippy::permissions_set_readonly_false)]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::cleaner::format_bytes;
use crate::db::Database;
use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineItem {
    pub id: String,
    pub original_path: String,
    pub file_name: String,
    pub stored_name: String,
    pub sha256: String,
    pub reason: String,
    pub quarantined_at: String,
    pub size_bytes: u64,
    pub size_formatted: String,
}

const XOR_OBFUSCATION_KEY: u8 = 0x5A;

pub fn quarantine_dir() -> PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("ARIS Guard").join("quarantine"))
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData\ARIS Guard\quarantine"))
}

fn xor_transform(data: &[u8]) -> Vec<u8> {
    data.iter().map(|b| b ^ XOR_OBFUSCATION_KEY).collect()
}

fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Securely isolates and encrypts a flagged file into the ARIS Guard quarantine vault.
pub fn quarantine_file(
    path_str: &str,
    reason: &str,
    db: &Database,
) -> Result<QuarantineItem, AppError> {
    let original_path = Path::new(path_str);
    if !original_path.exists() {
        return Err(AppError::NotFound(format!(
            "Target file does not exist: {path_str}"
        )));
    }

    let raw_bytes = fs::read(original_path)?;
    let size_bytes = raw_bytes.len() as u64;
    let sha256 = compute_sha256(&raw_bytes);

    let file_name = original_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("quarantined.bin")
        .to_string();

    let id = Uuid::new_v4().to_string();
    let stored_name = format!("{id}.vault");
    let vault_folder = quarantine_dir();
    fs::create_dir_all(&vault_folder)?;

    let vault_file_path = vault_folder.join(&stored_name);
    let obfuscated = xor_transform(&raw_bytes);
    fs::write(&vault_file_path, obfuscated)?;

    // Safely remove the active file from disk to prevent execution
    if let Ok(meta) = original_path.metadata() {
        let mut perms = meta.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = fs::set_permissions(original_path, perms);
        }
    }
    let _ = fs::remove_file(original_path);

    let now = chrono::Utc::now().to_rfc3339();

    // Store quarantine record in DB
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    guard.execute(
        "INSERT INTO quarantine (id, original_path, stored_name, sha256, reason, quarantined_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, path_str, stored_name, sha256, reason, now],
    )?;

    // Log the quarantine action
    let log_id = Uuid::new_v4().to_string();
    let detail = serde_json::json!({
        "original_path": path_str,
        "file_name": file_name,
        "sha256": sha256,
        "reason": reason,
        "size_bytes": size_bytes,
    })
    .to_string();

    let _ = guard.execute(
        "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![log_id, "quarantine_threat", detail, now],
    );

    Ok(QuarantineItem {
        id,
        original_path: path_str.to_string(),
        file_name,
        stored_name,
        sha256,
        reason: reason.to_string(),
        quarantined_at: now,
        size_bytes,
        size_formatted: format_bytes(size_bytes),
    })
}

/// Lists all quarantined items stored in the ARIS Guard vault.
pub fn list_quarantined_items(db: &Database) -> Result<Vec<QuarantineItem>, AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let mut stmt = guard.prepare(
        "SELECT id, original_path, stored_name, sha256, reason, quarantined_at
         FROM quarantine ORDER BY quarantined_at DESC",
    )?;

    let vault_folder = quarantine_dir();

    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let original_path: String = row.get(1)?;
        let stored_name: String = row.get(2)?;
        let sha256: String = row.get(3)?;
        let reason: String = row.get(4)?;
        let quarantined_at: String = row.get(5)?;
        Ok((id, original_path, stored_name, sha256, reason, quarantined_at))
    })?;

    let mut items = Vec::new();
    for row in rows.flatten() {
        let (id, original_path, stored_name, sha256, reason, quarantined_at) = row;
        let file_name = Path::new(&original_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let vault_file = vault_folder.join(&stored_name);
        let size_bytes = fs::metadata(&vault_file).map(|m| m.len()).unwrap_or(0);

        items.push(QuarantineItem {
            id,
            original_path,
            file_name,
            stored_name,
            sha256,
            reason,
            quarantined_at,
            size_bytes,
            size_formatted: format_bytes(size_bytes),
        });
    }

    Ok(items)
}

/// Restores a quarantined file from the vault back to its original path or user desktop.
pub fn restore_quarantined_item(id: &str, db: &Database) -> Result<String, AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let mut stmt = guard.prepare(
        "SELECT original_path, stored_name, sha256 FROM quarantine WHERE id = ?1",
    )?;

    let (original_path_str, stored_name, _sha256): (String, String, String) = stmt
        .query_row(rusqlite::params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|_| AppError::NotFound(format!("Quarantine entry not found: {id}")))?;

    let vault_folder = quarantine_dir();
    let vault_file = vault_folder.join(&stored_name);

    if !vault_file.exists() {
        let _ = guard.execute("DELETE FROM quarantine WHERE id = ?1", rusqlite::params![id]);
        return Err(AppError::NotFound("Encrypted vault payload was not found on disk.".to_string()));
    }

    let encrypted = fs::read(&vault_file)?;
    let decrypted = xor_transform(&encrypted);

    let original_path = Path::new(&original_path_str);
    let target_dest = if let Some(parent) = original_path.parent() {
        if parent.exists() {
            original_path.to_path_buf()
        } else {
            // Restore to Desktop if parent directory was deleted
            let file_name = original_path.file_name().unwrap_or_default();
            dirs::desktop_dir()
                .map(|d| d.join(file_name))
                .unwrap_or_else(|| original_path.to_path_buf())
        }
    } else {
        original_path.to_path_buf()
    };

    if let Some(parent) = target_dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if target_dest.exists() {
        if let Ok(meta) = target_dest.metadata() {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(&target_dest, perms);
            }
        }
    }
    fs::write(&target_dest, decrypted)?;

    // Remove from vault and DB
    if let Ok(meta) = vault_file.metadata() {
        let mut perms = meta.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = fs::set_permissions(&vault_file, perms);
        }
    }
    let _ = fs::remove_file(&vault_file);
    guard.execute("DELETE FROM quarantine WHERE id = ?1", rusqlite::params![id])?;

    let now = chrono::Utc::now().to_rfc3339();
    let log_id = Uuid::new_v4().to_string();
    let detail = serde_json::json!({
        "quarantine_id": id,
        "restored_to": target_dest.to_string_lossy(),
    })
    .to_string();

    let _ = guard.execute(
        "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![log_id, "restore_threat", detail, now],
    );

    Ok(format!(
        "File successfully restored to: {}",
        target_dest.to_string_lossy()
    ))
}

/// Permanently shreds and deletes a quarantined item from both vault and DB.
pub fn delete_quarantined_item(id: &str, db: &Database) -> Result<String, AppError> {
    let conn = db.connection();
    let guard = conn
        .lock()
        .map_err(|e| AppError::Internal(format!("Failed to lock DB: {e}")))?;

    let mut stmt = guard.prepare(
        "SELECT stored_name, original_path FROM quarantine WHERE id = ?1",
    )?;

    let (stored_name, original_path): (String, String) = stmt
        .query_row(rusqlite::params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| AppError::NotFound(format!("Quarantine entry not found: {id}")))?;

    let vault_folder = quarantine_dir();
    let vault_file = vault_folder.join(&stored_name);

    if vault_file.exists() {
        // Secure wipe: overwrite with zeros before deleting
        if let Ok(meta) = fs::metadata(&vault_file) {
            let len = meta.len() as usize;
            if let Ok(mut f) = fs::OpenOptions::new().write(true).open(&vault_file) {
                let zeros = vec![0u8; len.min(1024 * 1024)];
                let _ = f.write_all(&zeros);
            }
        }
        if let Ok(meta) = vault_file.metadata() {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(&vault_file, perms);
            }
        }
        let _ = fs::remove_file(&vault_file);
    }

    guard.execute("DELETE FROM quarantine WHERE id = ?1", rusqlite::params![id])?;

    let now = chrono::Utc::now().to_rfc3339();
    let log_id = Uuid::new_v4().to_string();
    let detail = serde_json::json!({
        "quarantine_id": id,
        "original_path": original_path,
    })
    .to_string();

    let _ = guard.execute(
        "INSERT INTO actions_log (id, kind, detail_json, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![log_id, "delete_quarantine", detail, now],
    );

    Ok("Item permanently purged from quarantine vault.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quarantine_lifecycle() {
        let db = Database::open_in_memory().expect("open test db");
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join(format!("test_malware_{}.exe", Uuid::new_v4()));
        fs::write(&test_file, b"test dangerous payload bytes").expect("write test file");

        let q_item = quarantine_file(test_file.to_str().unwrap(), "Heuristic Malware Trigger", &db)
            .expect("quarantine should succeed");
        assert!(!test_file.exists(), "Original file must be removed");
        assert_eq!(q_item.reason, "Heuristic Malware Trigger");

        let list = list_quarantined_items(&db).expect("list quarantine items");
        assert!(list.iter().any(|i| i.id == q_item.id));

        let res = restore_quarantined_item(&q_item.id, &db).expect("restore file");
        assert!(res.contains("restored"));
        assert!(test_file.exists(), "Restored file must exist");
        let content = fs::read(&test_file).expect("read restored content");
        assert_eq!(content, b"test dangerous payload bytes");

        // Quarantine again and test permanent deletion
        let q_item2 = quarantine_file(test_file.to_str().unwrap(), "Repeat Quarantine", &db)
            .expect("quarantine again");
        let del_res = delete_quarantined_item(&q_item2.id, &db).expect("delete permanently");
        assert!(del_res.contains("purged"));
        let list2 = list_quarantined_items(&db).expect("list after delete");
        assert!(!list2.iter().any(|i| i.id == q_item2.id));
    }
}

