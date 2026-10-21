# 06 — Roadmap & Testing

> Implement **one phase at a time**. Do not start a phase until the previous
> one passes its exit criteria. After each phase: run all earlier tests to
> confirm nothing broke.

## Phase 0 — Project skeleton
**Build:** repo, Tauri v2 + React/TS/Vite/Tailwind scaffold, flat Rust modules (empty stubs per `01`), `config.rs`, `logger.rs`, `errors.rs`, `db.rs` with migrations, single-instance, tray icon with basic menu (Open / Pause / Quit), CI (`ci.yml`).
**Exit:** `npm run tauri dev` works; tray works; closing window destroys the webview and agent stays alive; agent idle RAM measured and recorded.

## Phase 1 — Design system & app shell
**Build:** tokens, theme switching (system/dark/light), Inter font bundled, all base components (`04` §5), sidebar layout, empty pages, i18n with `en.json` + `bn.json`, onboarding flow (UI only), Settings page wired to `config.rs`.
**Exit:** every page renders with mock data; theme and language switching work; keyboard navigation works; UI memory ≤ 150 MB.

## Phase 2 — Scanner core (manual)
**Build:** `scan_hash`, `scan_defender`, `scan_static`, `win_trust`, `win_fs`, verdict engine, `scanner.rs` pipeline, DB results, manual "scan a file/folder" in UI with drawer details.
**Exit:** EICAR detected via Defender; double-extension and unsigned-exe findings work; Defender-off yields `Unknown`; **verify and document the real MpCmdRun exit codes** on the test VM.

## Phase 3 — Real-time download protection
**Build:** `watcher.rs` (debounce, stable-file check), bounded queue, worker with low priority, `notifier.rs` with actions, `quarantine.rs` (store/restore/delete), Quarantine page, allowlist, settings for auto-quarantine.
**Exit:** acceptance criteria 1–9 in `02` pass; scanning a 4 GB file stays within RAM budget.

## Phase 4 — Archives & extra engines
**Build:** `scan_archive` (limits, zip-slip protection, sandbox deep scan), `scan_clamav` (optional detection), `scan_online` (opt-in, rate-limited, Credential Manager storage), consent UI.
**Exit:** zip-bomb, zip-slip, password-protected tests pass; zero network calls when online lookups are off.

## Phase 5 — Cleaner
**Build:** `cleaner.rs` categories, preview/run, safety rules, UI tab, `win_elevate` helper for `windows_temp`, History logging.
**Exit:** `03` §7 criteria 1–2 pass, including the junction test; elevation only on demand.

## Phase 6 — Startup manager & processes
**Build:** `startup_mgr`, `win_registry`, `startup_rules.json`, classification, impact display, undo; `process_mgr` list/close with identity re-check.
**Exit:** `03` §7 criteria 3, 4, 6 pass; Protected entries enforced in backend.

## Phase 7 — Scheduler, health & dashboard
**Build:** `scheduler.rs` (90 s post-logon cleaner, daily limits, power/CPU gating), `health.rs` (metrics, boot time, score), Dashboard with health ring and "Smart Fix" confirmation sheet, History page with Undo.
**Exit:** `03` §7 criterion 5 passes; dashboard numbers match Task Manager within reason.

## Phase 8 — Hardening, polish, release
**Build:** panic isolation + job restart, log rotation, empty/error states, accessibility pass, `bn.json` review, installer polish, `cargo audit`/`npm audit` clean, docs (`README`, `PRIVACY`, `SECURITY`), updater, `release.yml`, checksums, attestation, SignPath application.
**Exit:** Definition of Done in `00` fully satisfied; v1.0.0 tagged.

## Post-v1 ideas (do not build in v1)
Scheduled task enable/disable, Windows Update cache cleanup, `.rar/.7z` native inspection, more languages, portable mode, community startup-rules updates, Defender exclusion/health warnings.

---

## Test Strategy

### Unit tests (Rust, `cargo test`)
- Verdict engine: table-driven cases for every row in `02` §10.
- Static checks: double extension, RTL override, script patterns, LNK targets.
- Path safety: reject `..`, UNC, device paths, out-of-root, reparse points.
- Archive limits: ratio, depth, entry count, zip-slip names.
- Startup bytes: encode/decode StartupApproved values exactly.
- Cleaner: age filter, allowed-roots enforcement, dry-run equals real run.
- Config: validation, defaults, migration of old settings.

### Integration tests (Windows CI where possible)
- Watcher: create/rename/partial-download patterns produce exactly one scan per file.
- DB migrations from every previous schema version.
- Quarantine round trip: quarantine → restore → byte-identical file.
- IPC: invalid inputs from UI are rejected with typed errors.

### End-to-end manual tests on a clean Windows 10 and Windows 11 VM

| # | Test | Expected |
|---|------|----------|
| 1 | Save EICAR test file to Downloads | Detected, notification, quarantine works |
| 2 | Download real browser file (Chrome, Edge, Firefox) | One scan after download completes, no scan of `.crdownload` |
| 3 | Disable Defender | Verdicts become Unknown; friendly Settings note |
| 4 | Junction inside `%TEMP%` pointing at a test folder | Target untouched |
| 5 | Disable then re-enable a startup app | State identical to original |
| 6 | Reboot | Agent starts minimized; cleaner runs ~90 s later; once per day |
| 7 | Close window | Webview process gone; agent RAM ≤ 30 MB |
| 8 | Unplug AC at low battery before auto clean | Cleaner skipped and rescheduled |
| 9 | Firewall log with online lookups off | No outbound traffic from scanner |
| 10 | Install, update, uninstall | No leftover files/registry/autostart (unless user kept data) |
| 11 | Standard (non-admin) account | All v1 features work except admin-only cleaner category, which prompts UAC |

### Performance tests
- Measure and record: installer size, idle RAM/CPU (30 min soak), UI open RAM, cold open time, scan throughput on 1 GB / 4 GB files, boot-time delta with/without agent. Fail the phase if budgets in `01` §5 are exceeded.
- Soak test: 24 h idle + 1,000 simulated download events, no memory growth > 5 MB.

### Security tests
- Fuzz archive and PE-parsing paths (`cargo fuzz` on the static/archive parsers).
- Attempt path traversal via every IPC command that accepts a path.
- Verify Tauri capabilities contain only the required permissions.
- CSP blocks any remote resource load.

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Antivirus flags our unsigned exe as suspicious | Users can't install | SignPath application, Microsoft submissions, clean build provenance, avoid packers/obfuscation, no process injection |
| False positives from static checks | Users lose trust | Static alone caps at Suspicious; allowlist; clear "Report wrong result" |
| Defender unavailable (third-party AV) | Weak scanning | Honest `Unknown` verdict; optional ClamAV; guidance in UI |
| VirusTotal terms/limits change | Online layer breaks | Optional, user keys, adapter isolated, fails silently |
| Disabling a needed startup item | User confusion | Protected list, reversible via StartupApproved, History Undo |
| Cleaner deletes something important | Data loss | Allowed roots, age filter, no reparse points, preview first |
| Solo maintenance load | Stalled project | Small scope, clear contribution guide, automated CI, best-effort support policy |
| WebView2 memory seen as "high" | Bad perception | Destroy window on close; document agent vs UI memory honestly |
