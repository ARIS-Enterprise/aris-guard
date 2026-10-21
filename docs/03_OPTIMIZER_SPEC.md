# 03 — Optimizer Spec

> Principle: **safe, reversible, honest.** Disable instead of delete. Always
> preview first. Never promise magic speedups.

## 1. Temp & junk cleaner (`cleaner.rs`, `win_fs.rs`)

### 1.1 Categories

| ID | Location | Default | Admin? |
|----|----------|---------|--------|
| `user_temp` | `%TEMP%` (`%LOCALAPPDATA%\Temp`) | ON | no |
| `thumbnails` | `%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache_*.db` | ON | no |
| `crash_dumps` | `%LOCALAPPDATA%\CrashDumps` | ON | no |
| `wer_reports` | `%LOCALAPPDATA%\Microsoft\Windows\WER` | ON | no |
| `browser_cache` | Chrome/Edge/Firefox/Brave **cache folders only** (never cookies, history, passwords, profiles) | OFF (opt-in) | no |
| `recycle_bin` | Recycle Bin (via Shell API) | OFF (opt-in) | no |
| `windows_temp` | `C:\Windows\Temp` | OFF (opt-in) | **yes** (UAC on demand) |
| `delivery_optimization` / `win_update_cache` | v1.1, requires stopping services | not in v1 | yes |

**Never touch:** Prefetch, SuperFetch, registry, `WinSxS`, installed program
folders, user documents, `Downloads`, browser profiles/cookies/passwords.

### 1.2 Safety rules (all mandatory)

1. **Allowed-roots only.** Each category has a fixed list of roots. Canonicalize every candidate path and verify it is inside a root before deleting.
2. **No reparse points.** If a directory/file is a symlink or junction, skip it and never follow it (prevents junction-redirect attacks).
3. **Age filter:** delete only files not modified within `cleaner_min_age_hours` (default 24 h).
4. **Locked files:** if delete fails with a sharing/access error, skip silently and count as "in use".
5. **Never delete directory roots** themselves, only their contents.
6. **Dry run first.** `cleaner_preview` returns per-category file counts and bytes; UI shows it before `cleaner_run`.
7. **Cancelable** and **throttled** (below-normal priority, small yields between batches).
8. **Atomic reporting:** log bytes freed, files deleted, files skipped, duration to `actions_log`.
9. Browser cache cleaning is skipped for a browser while its process is running (avoids corruption); report "skipped (browser open)".

### 1.3 Automatic run on startup

- `scheduler.rs` triggers the cleaner **90 seconds after logon** (not at boot instant) so it never competes with Windows startup.
- Runs only when: on AC power **or** battery > 30%, and CPU < 50% for the last 10 s. Otherwise retry after 10 min, max 3 tries, then skip.
- Runs once per day maximum (track `last_auto_clean`), plus a manual "Clean now".
- Silent by default; a small toast "Freed 1.2 GB" only if more than 100 MB freed and notifications are on.

## 2. Startup manager (`startup_mgr.rs`, `win_registry.rs`)

### 2.1 Sources to enumerate

| Source | Path |
|--------|------|
| HKCU Run | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| HKLM Run (read; change needs admin) | `HKLM\Software\Microsoft\Windows\CurrentVersion\Run` |
| HKLM Run 32-bit | `HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run` |
| Startup folders | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` and the all-users equivalent |
| Scheduled tasks with logon trigger | via Task Scheduler API/`schtasks` (list in v1; enable/disable in v1.1) |
| Services set to Automatic (third-party only) | list only in v1; no changes |

### 2.2 How to disable (reversible, the Windows-native way)

Use the same mechanism Task Manager uses — the **StartupApproved** keys:

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
- `...\StartupApproved\Run32`
- `...\StartupApproved\StartupFolder`
- HKLM equivalents (admin required)

The value is a 12-byte binary with the same value name as the entry: first
byte `0x02` = enabled, `0x03` = disabled (remaining 8 bytes = FILETIME of the
change). **Disable = set that value; never delete the original Run value or
shortcut.** Enable = restore to `0x02`. Save previous state in
`startup_changes` so "Undo" is exact.

### 2.3 Classification (knowledge base)

Ship a small JSON file `startup_rules.json` (matched by executable name,
publisher, and path), plus a heuristic fallback.

| Class | Examples | UI behavior |
|-------|----------|-------------|
| **Protected** | Microsoft/Windows components, security software (Defender, other AV), drivers/input/audio/GPU control services, ARIS Guard itself | Cannot be toggled (lock icon) |
| **Recommended to disable** | Updaters (Adobe, Java, Spotify auto-start, Discord, Steam, Teams personal, OneDrive optional), chat/launcher apps with no need at boot, bloat from OEMs | Toggle + "Recommended" badge |
| **Unknown** | Everything else | Shown neutral with publisher/path; user decides |

Never classify by name alone for Protected: also require a valid
Authenticode signature from the expected publisher for the "protected
Microsoft" class, so malware named `explorer.exe` isn't auto-trusted.

### 2.4 Impact display

Show estimated **startup impact** per entry: Low / Medium / High, using
Windows' own data where available (StartupInfo / Diagnostics-Performance
events) and falling back to file size + process RAM when the app runs.
Display a total "Startup apps: 14 enabled, 6 recommended to disable".

### 2.5 UX safeguards
- Bulk action "Disable all recommended" shows a confirm sheet listing every item.
- Every change is logged and undoable from History in one click.
- Changes needing admin show a shield icon and trigger UAC only when clicked.

## 3. Background apps & memory (`process_mgr.rs`)

### 3.1 Honest approach to RAM

Windows already manages RAM well; "RAM boosters" that trim working sets
mostly cause temporary slowdowns. ARIS Guard therefore does **not** run
a constant RAM cleaner. It does:

1. **Show** top memory-using processes grouped by app, with plain names/icons.
2. **Suggest** closing background apps the user is not using (e.g. high RAM, no visible window, idle CPU).
3. **Close on request**: graceful close first (`WM_CLOSE`), then offer "Force close" after a few seconds and a warning about unsaved work.
4. **Optional "Free memory now"** button: trims working sets of *user-session, non-protected, background* processes only; clearly labelled "temporary, Windows will reload what it needs"; **off by default and never automatic**.
5. Show **real before/after** numbers (available RAM) so the user sees the true effect.

### 3.2 Hard safety rules
- Never terminate or trim: Windows/system processes, session 0 services, security software, anything in the Protected list, the foreground window's process, ARIS Guard.
- Never act on a PID without re-verifying the process identity (exe path + start time) to avoid PID-reuse mistakes.
- Processes of other users are read-only.

### 3.3 Background auto-start control for the future
v1.1: optionally suggest disabling "background apps" permissions and scheduled tasks. Not in v1.

## 4. Health dashboard (`health.rs`)

Metrics (sampled only while the UI is open, every 2 s; agent keeps no heavy sampling):

- RAM used/available, CPU %, disk free per drive, disk activity
- **Last boot duration:** Event Log `Microsoft-Windows-Diagnostics-Performance/Operational`, Event ID 100 (`BootDuration`). If unavailable, show "N/A".
- Startup app counts, junk size estimate (from last preview), last scan, last clean

**Health score (0–100):** transparent, explainable formula:

```
score = 100
  - min(25, startup_enabled_nonessential * 2)
  - disk_free_penalty        (0 if >20% free; up to 25 if <5%)
  - ram_pressure_penalty     (0 if avail >30%; up to 15)
  - junk_penalty             (up to 15 based on cleanable GB)
  - protection_penalty       (20 if watcher off; 10 if no engine available)
```
Each penalty is shown as a "Fix" card the user can click. No fake numbers.

## 5. Scheduler (`scheduler.rs`)

- Single lightweight timer loop (e.g. wake every 60 s), no busy loops.
- Jobs: `auto_clean_after_logon`, `daily_hash_cache_prune`, `weekly_quarantine_purge` (if enabled), `update_check` (see 05).
- Persist last-run times; skip if run recently; survive sleep/wake correctly.

## 6. Elevation (`win_elevate.rs`)

- Main app never runs as admin.
- For admin-only tasks, spawn a short-lived elevated helper of the same signed binary with a narrow argument (`--task windows-temp-clean`), UAC prompt shown once, helper exits immediately after.
- Helper validates its own arguments strictly and accepts only the predefined task IDs.

## 7. Acceptance criteria

1. Preview then run frees the same bytes (±locked files) and never deletes outside allowed roots (test with a crafted junction in `%TEMP%`).
2. Files younger than 24 h are untouched.
3. Disabling a startup item flips StartupApproved only; the original Run value remains; Undo restores the exact state.
4. Protected items cannot be disabled via UI or IPC (backend enforces, not just UI).
5. Auto clean fires ~90 s after logon, only once per day, and does not run on low battery.
6. Closing a background app never kills the foreground app or a system process.
7. All actions appear in History with accurate numbers.
