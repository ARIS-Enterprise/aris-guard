# 01 — Product & Architecture

## 1. Goals

1. Protect the PC from risky downloads (detect, warn, quarantine).
2. Keep the PC fast: auto-clean temp files, tame startup and background apps.
3. Be extremely light: the app that optimizes the PC must not slow the PC.
4. Be free, open-source, easy to install, easy to understand for non-technical users.
5. Be secure itself: a security tool must have a minimal attack surface.

## 2. Non-goals (v1)

- Writing a custom antivirus engine or signature database.
- Kernel drivers, real-time process injection, or hooking.
- Registry "cleaners" (high risk, low benefit).
- macOS/Linux support.
- Cloud accounts, sync, or any server component run by ARIS.

## 3. Design principles

- **Safe by default, reversible always.** Disable, don't delete. Quarantine, don't destroy.
- **Transparent.** Every action is logged and visible in History.
- **Least privilege.** Runs as a standard user. Admin is requested only per task through UAC.
- **Local-first and private.** Nothing leaves the PC except opt-in hash lookups (hashes only, never files).
- **Honest.** The scanner reduces risk; it does not guarantee safety.

## 4. Process model (key to low RAM)

Two logical parts, one binary:

| Part | When alive | Contains | Budget |
|------|-----------|----------|--------|
| **Agent** | Always (tray, starts with Windows, `--minimized`) | Rust only: watcher, scanner, scheduler, tray, notifications | **≤ 30 MB RAM idle, ~0% CPU** |
| **UI window** | Only while the user opens it | WebView2 + React | ≤ 150 MB while open |

**Critical rule:** when the user closes the window, the webview window is
**destroyed** (not hidden) so WebView2 memory is released. The agent keeps
running in the tray. Re-opening creates the window again.

Use `tauri-plugin-single-instance` so a second launch just focuses/opens the UI.

## 5. Performance budgets (hard requirements)

| Metric | Budget |
|--------|--------|
| Installer size | ≤ 20 MB |
| Installed size | ≤ 60 MB |
| Agent idle RAM | ≤ 30 MB |
| Agent idle CPU | < 0.5% average |
| UI cold open | ≤ 1.5 s |
| Startup delay impact | Agent must not add measurable boot time; delay heavy work 90 s after logon |
| Scan CPU | Runs at below-normal priority; never starves foreground apps |
| Disk writes | Log + DB writes batched; no write loops |

## 6. Repository layout (flat modules)

```
aris-guard/
├─ README.md  LICENSE  SECURITY.md  CONTRIBUTING.md  PRIVACY.md  CHANGELOG.md
├─ docs/                      (these MD specs)
├─ .github/workflows/         (ci.yml, release.yml)
├─ src/                       (React frontend)
│  ├─ main.tsx  App.tsx
│  ├─ pages/    Dashboard.tsx Protection.tsx Optimizer.tsx Quarantine.tsx History.tsx Settings.tsx
│  ├─ components/  (design-system components, see 04)
│  ├─ lib/      ipc.ts  store.ts  i18n.ts  format.ts
│  └─ locales/  en.json  bn.json
└─ src-tauri/
   ├─ Cargo.toml  tauri.conf.json  capabilities/default.json
   └─ src/                    (FLAT — no nested mod folders)
      ├─ main.rs              entry, builder, plugin wiring, single-instance
      ├─ agent.rs             lifecycle, task orchestration, shutdown
      ├─ tray.rs              tray icon + menu + status states
      ├─ commands.rs          all #[tauri::command] handlers (thin, call modules)
      ├─ config.rs            settings load/save/validate/defaults
      ├─ db.rs                SQLite schema, migrations, queries
      ├─ logger.rs            rotating file log (size-capped)
      ├─ errors.rs            AppError enum (thiserror), serializable to UI
      ├─ watcher.rs           folder watching, debounce, file-stable detection
      ├─ scanner.rs           scan pipeline orchestration + verdict engine
      ├─ scan_hash.rs         streaming SHA-256 + local cache
      ├─ scan_defender.rs     Windows Defender on-demand scan adapter
      ├─ scan_clamav.rs       optional ClamAV adapter
      ├─ scan_online.rs       opt-in VirusTotal / MalwareBazaar hash lookups
      ├─ scan_static.rs       static checks: PE, signature, extension tricks, MOTW
      ├─ scan_archive.rs      safe archive inspection
      ├─ quarantine.rs        quarantine store, restore, delete
      ├─ cleaner.rs           temp/junk cleaner
      ├─ startup_mgr.rs       startup entries list/enable/disable
      ├─ process_mgr.rs       running processes, memory stats, safe close
      ├─ health.rs            RAM/CPU/disk/boot-time metrics + health score
      ├─ scheduler.rs         startup-delayed jobs, daily jobs
      ├─ notifier.rs          native toast notifications
      ├─ win_registry.rs      registry helpers (winreg)
      ├─ win_elevate.rs       on-demand UAC elevation helper
      ├─ win_fs.rs            reparse-point checks, ADS (Zone.Identifier), locked-file handling
      └─ win_trust.rs         Authenticode verification (WinVerifyTrust)
```

## 7. Key crates (keep dependency count low; justify any addition)

`tauri` v2, `tauri-plugin-notification`, `tauri-plugin-autostart`,
`tauri-plugin-single-instance`, `tauri-plugin-updater`, `tokio` (rt, sync, time,
process; no `full`), `serde`, `serde_json`, `thiserror`, `rusqlite` (bundled),
`notify`, `sha2`, `sysinfo`, `windows` (only needed features), `winreg`,
`zip`, `reqwest` (rustls-tls, no default features), `tracing` +
`tracing-appender`, `uuid`, `chrono`.

Release profile: `opt-level = "z"`, `lto = true`, `codegen-units = 1`,
`panic = "abort"`, `strip = true`.

## 8. IPC contract (commands exposed to the UI)

All inputs validated in Rust. The UI is untrusted input.

| Command | Purpose |
|---------|---------|
| `get_dashboard` | health score, protection status, last scan, freed space |
| `get_settings` / `set_settings` | read/validate/save settings |
| `scan_file(path)` / `scan_folder(path)` | manual scans |
| `get_scan_history(page)` | paged results |
| `list_quarantine` / `restore_item(id)` / `delete_item(id)` | quarantine mgmt |
| `cleaner_preview` / `cleaner_run(categories)` | dry-run first, then run |
| `startup_list` / `startup_set(id, enabled)` | startup manager |
| `process_list` / `process_close(pid)` | background apps |
| `get_logs(page)` | action history |

Events pushed to UI: `scan://progress`, `scan://verdict`, `cleaner://progress`,
`health://tick` (max 1 per 2 s, only while the window is open).

## 9. Data model (SQLite)

- `scan_results(id, path, sha256, size, verdict, score, reasons_json, engines_json, scanned_at, action)`
- `hash_cache(sha256 PRIMARY KEY, verdict, source, checked_at)` — TTL 7 days for clean, never expire malicious
- `quarantine(id, original_path, stored_name, sha256, reason, quarantined_at)`
- `actions_log(id, kind, detail_json, created_at)` — cleaner runs, startup changes, etc.
- `startup_changes(id, entry_key, previous_state, changed_at)` — enables exact undo

Retention: history capped (e.g. 5,000 rows / 90 days), auto-pruned.
Use a `schema_version` table and forward-only migrations.

## 10. Settings (defaults)

```
watch_folders: [Downloads, Desktop]      // user can add/remove
scan_on_download: true
auto_quarantine: "ask"                   // ask | always | never
online_lookups: false                    // opt-in; needs user VT key for VT
clamav_enabled: auto                     // use if detected
cleaner_on_startup: true                 // runs 90 s after logon
cleaner_categories: [user_temp, thumbnails, crash_dumps, wer_reports]
cleaner_min_age_hours: 24
startup_suggestions: true
notifications: true
language: "en"                           // en | bn
theme: "system"                          // system | dark | light
start_with_windows: true
```

## 11. Security of the app itself

- Tauri capabilities: grant only the specific permissions needed; no `shell:*`, no broad `fs:*`. All file work happens in Rust.
- Strict CSP; no remote scripts, fonts, or images. Bundle everything locally.
- Never build shell commands by string concatenation. Use `Command::new(..).arg(..)` with validated paths.
- Canonicalize every path from the UI; reject UNC paths, device paths (`\\.\`), and anything outside allowed roots for destructive operations.
- Refuse to operate on reparse points (symlinks/junctions) for deletion.
- Quarantine files are stored non-executable (renamed, obfuscated) and never auto-opened.
- API keys stored in Windows Credential Manager (DPAPI), not plain text.
- Updater uses signed update manifests (see 05).
- Dependencies audited in CI with `cargo audit` and `npm audit`.

## 12. Error handling & logging

- Single `AppError` enum; every command returns `Result<T, AppError>`.
- Never `unwrap()`/`expect()` in non-test code. A panic in one job must not kill the agent: isolate jobs in tasks and restart on failure with backoff.
- Log file: `%LOCALAPPDATA%\ARIS Guard\logs\`, size-capped rotation (e.g. 5 × 2 MB), no file contents, no secrets, paths allowed.
- User-facing errors are plain language with a suggested action.

## 13. Data locations

- Settings/DB/logs/quarantine: `%LOCALAPPDATA%\ARIS Guard\`
- Uninstall removes the install folder; offers a checkbox to also remove user data. Autostart entry removed on uninstall.
