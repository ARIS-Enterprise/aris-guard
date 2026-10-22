use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::errors::AppError;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, AppError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    #[allow(dead_code)]
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    fn current_version(conn: &Connection) -> Result<i32, AppError> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
            [],
        )?;

        let mut stmt = conn.prepare("SELECT COALESCE(MAX(version), 0) FROM schema_version")?;
        let version: i32 = stmt.query_row([], |row| row.get(0))?;
        Ok(version)
    }

    pub fn migrate(&self) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Internal(format!("Failed to lock DB connection: {e}")))?;

        let current = Self::current_version(&conn)?;

        if current < 1 {
            let tx = conn.transaction()?;

            tx.execute_batch(
                "CREATE TABLE IF NOT EXISTS scan_results (
                    id TEXT PRIMARY KEY,
                    path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    verdict TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    reasons_json TEXT NOT NULL,
                    engines_json TEXT NOT NULL,
                    scanned_at TEXT NOT NULL,
                    action TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_scan_results_scanned_at ON scan_results(scanned_at);
                CREATE INDEX IF NOT EXISTS idx_scan_results_sha256 ON scan_results(sha256);

                CREATE TABLE IF NOT EXISTS hash_cache (
                    sha256 TEXT PRIMARY KEY,
                    verdict TEXT NOT NULL,
                    source TEXT NOT NULL,
                    checked_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS quarantine (
                    id TEXT PRIMARY KEY,
                    original_path TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    quarantined_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS actions_log (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    detail_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_actions_log_created_at ON actions_log(created_at);

                CREATE TABLE IF NOT EXISTS startup_changes (
                    id TEXT PRIMARY KEY,
                    entry_key TEXT NOT NULL,
                    previous_state TEXT NOT NULL,
                    changed_at TEXT NOT NULL
                );",
            )?;

            let now = chrono::Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?1, ?2)",
                params![1, now],
            )?;

            tx.commit()?;
            tracing::info!("Database migrated to schema version 1");
        }

        if current < 2 {
            let tx = conn.transaction()?;
            let _ = tx.execute(
                "ALTER TABLE scan_results ADD COLUMN deep_analysis_json TEXT;",
                [],
            );
            let now = chrono::Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?1, ?2)",
                params![2, now],
            )?;
            tx.commit()?;
            tracing::info!("Database migrated to schema version 2");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_and_version() {
        let db = Database::open_in_memory().expect("in-memory db open failed");
        let conn = db.conn.lock().unwrap();
        let version = Database::current_version(&conn).expect("fetch version failed");
        assert_eq!(version, 2);

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert!(tables.contains(&"schema_version".to_string()));
        assert!(tables.contains(&"scan_results".to_string()));
        assert!(tables.contains(&"hash_cache".to_string()));
        assert!(tables.contains(&"quarantine".to_string()));
        assert!(tables.contains(&"actions_log".to_string()));
        assert!(tables.contains(&"startup_changes".to_string()));
    }
}
