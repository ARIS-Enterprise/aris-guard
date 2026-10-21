# 02 — Security Scanner Spec

> Honest scope: ARIS Guard **orchestrates** trusted engines and adds smart
> static checks. It does not replace a full antivirus and must never claim
> 100% detection. Primary engine = Windows Defender (already on every Windows PC).

## 1. Detection sources (layered)

| Layer | Engine | Cost | Notes |
|-------|--------|------|-------|
| L0 | Fast filters (extension, size, location, MOTW) | free | decides how deep to go |
| L1 | Local hash cache + local known-bad list | free | instant |
| L2 | **Windows Defender** on-demand scan | free, built in | primary engine; skipped if Defender is disabled/replaced by another AV |
| L3 | **ClamAV** (optional) | free, open source | only if user installed it; **not bundled** (GPL separation) |
| L4 | Static analysis (our code) | free | signature, PE anomalies, archive risks, double extensions |
| L5 | Online hash lookup (opt-in) | free tier | VirusTotal (user's own API key) and MalwareBazaar (user's own free key). **Hash only, never upload files.** |

Engines are adapters behind one trait: `fn scan(&self, ctx: &ScanContext) -> EngineResult`.
Adding/removing an engine must not change the pipeline code.

## 2. Watching downloads (`watcher.rs`)

- Watch configured folders (default: Downloads, Desktop; also detect browser custom download folders if easy). Non-recursive by default, recursive optional.
- Use `notify` (ReadDirectoryChangesW). One watcher thread; events go through a bounded channel.
- Ignore temp/partial names: `.crdownload`, `.part`, `.tmp`, `.download`, `.partial`.
- Act on **create/rename-to-final-name** events.
- **File-stable check:** wait until size and mtime are unchanged for ≥ 2 s and the file can be opened with shared read. Retry up to 30 s, then give up and re-queue once.
- Debounce duplicates; de-duplicate by `(path, size, mtime)`.
- Skip files already in cache with the same hash.
- Queue is bounded (e.g. 256). On overflow, drop oldest low-priority items and log it.
- Scan worker count: **1** by default (low resource use), below-normal thread priority.

## 3. Risk-based depth (L0)

| File type | Depth |
|-----------|-------|
| `.exe .msi .scr .dll .sys .com .bat .cmd .ps1 .vbs .js .jse .wsf .hta .lnk .jar .reg .cpl .iso .img .vhd` | **Full** (L1–L5) |
| `.zip .rar .7z .tar .gz .cab` | **Full** + archive inspection |
| Office with macros (`.docm .xlsm .pptm .doc .xls`), `.pdf`, `.rtf`, `.one` | Medium (L1, L2, L4 light) |
| Images, video, audio, plain text | Hash-only + L2 if Defender fast path is cheap; otherwise skip |

User can raise to "scan everything".

## 4. Scan pipeline (`scanner.rs`)

```
file stable → L0 classify → hash (stream SHA-256) → cache hit? → verdict
          └→ L1 local bad-list → L2 Defender → L3 ClamAV → L4 static
          └→ L5 online lookup (only if opted in AND earlier layers didn't already say malicious)
          → verdict engine → action → notify → log
```

Rules:
- Stream hashing, constant memory, any file size.
- Early exit on **Malicious** from a trusted engine.
- Each engine has a timeout (Defender 120 s default, configurable). Timeout = `Unknown` for that engine, not "clean".
- All engine results are stored in `engines_json` for transparency.

## 5. Windows Defender adapter (`scan_defender.rs`)

- Locate `MpCmdRun.exe`: prefer newest `C:\ProgramData\Microsoft\Windows Defender\Platform\<version>\MpCmdRun.exe`, fallback `C:\Program Files\Windows Defender\MpCmdRun.exe`.
- Command (args passed separately, never a joined string):
  `MpCmdRun.exe -Scan -ScanType 3 -File <path> -DisableRemediation`
- `-DisableRemediation` so ARIS Guard decides the action and the user stays in control.
- Interpret exit code: `0` = no threat found, `2` = threat found, anything else = engine error. **Verify exit codes on a test VM during Phase 2** and document the verified mapping in code comments.
- Detect "Defender unavailable" (missing exe, service stopped, another AV active) → mark adapter `Unavailable`, show a one-time friendly note in Settings, continue with other layers.

## 6. ClamAV adapter (`scan_clamav.rs`) — optional

- Detect `clamscan.exe`/`clamdscan.exe` in PATH or a user-chosen folder.
- Never bundle ClamAV in the installer. Settings page shows a link and instructions to install it.
- Call with `--no-summary --infected` and an explicit file path argument; parse exit code (`0` clean, `1` infected, `2` error).

## 7. Online lookups (`scan_online.rs`) — opt-in only

- Off by default. A clear consent screen explains: *only the file's SHA-256 hash is sent*.
- **VirusTotal:** user pastes their own free API key (stored in Credential Manager). Honor free-tier limits (about 4 requests/min, 500/day; verify current limits in VT docs). Local rate limiter + backoff. VT free API is for non-commercial use; document this in `PRIVACY.md`.
- **MalwareBazaar (abuse.ch):** user's own free key; hash lookup only.
- Interpretation: ≥ 5 engine detections on VT → `Malicious`; 1–4 → `Suspicious`; 0 with file known → `Clean` signal; not found → `Unknown` (never treated as clean).
- Never block the UI or the pipeline waiting on network: short timeouts (5 s), failures are silent and logged.

## 8. Static analysis (`scan_static.rs`, `win_trust.rs`, `win_fs.rs`)

Each finding adds to a score with a human-readable reason.

| Check | Score | Reason text |
|-------|-------|-------------|
| Double extension (`invoice.pdf.exe`) or RTL-override character in name | +40 | "File name tries to look like a different file type." |
| Executable with **no valid Authenticode signature** from user-writable download path | +10 | "Program is not digitally signed." |
| Signature present but **invalid/revoked/expired** | +35 | "Digital signature is not valid." |
| Valid signature from a trusted publisher | −20 | "Signed by a verified publisher." |
| PE: very high section entropy (>7.2) / packer-like section names / tiny import table | +20 | "File looks packed or obfuscated." |
| PE: mismatched extension vs. header (e.g. `.pdf` that is a PE) | +50 | "File type does not match its extension." |
| Mark-of-the-Web (`Zone.Identifier`, ZoneId=3) present | +0 (info) | Used to prioritize; shown in details. |
| Script file (`.ps1 .vbs .js .bat .hta`) containing obvious download-and-execute patterns (`IEX`, `DownloadString`, `FromBase64String`, `-enc`) | +30 | "Script tries to download or hide commands." |
| `.lnk` pointing to `cmd`, `powershell`, `mshta`, `wscript` | +40 | "Shortcut runs a command interpreter." |
| Macro-enabled Office document | +15 | "Document contains macros." |
| Known bad hash (local list) | → Malicious | |

Static analysis alone can produce at most **Suspicious**, never **Malicious**
(to limit false positives), except on a known-bad hash.

## 9. Archive inspection (`scan_archive.rs`)

Inspect without extracting to disk first (read entry metadata via `zip` crate).

Limits (hard-coded safe defaults):
- Max entries 10,000 · max total uncompressed 2 GB · max nesting depth 3
- Compression ratio > 100:1 → flag as possible archive bomb, stop expanding
- Reject entry names with `..`, absolute paths, drive letters (zip-slip) and flag them
- Password-protected → Suspicious (+25: "Archive is password protected, contents can't be checked.")
- Contains executable/script/shortcut entries → +15 ("Archive contains programs.")

Deep scan (when Defender/ClamAV is available): extract to a sandbox temp dir
under `%LOCALAPPDATA%\ARIS Guard\sandbox\<uuid>\` with the same limits and
zip-slip protection, scan, then **always delete the sandbox** (even on error).
`.rar/.7z`: v1 relies on Defender/ClamAV behavior; no custom parser.

## 10. Verdict engine

| Verdict | Condition |
|---------|-----------|
| **Malicious** | Any trusted engine (Defender, ClamAV) reports a threat, or known-bad hash, or VT ≥ 5 detections |
| **Suspicious** | Static score ≥ 50, or VT 1–4, or password-protected archive with executables |
| **Low risk** | Static score 20–49 |
| **Clean** | No engine flagged and static score < 20 and at least one real engine returned clean |
| **Unknown** | No engine was able to scan (unavailable/timeouts) — shown honestly, never as "Clean" |

## 11. Actions & notifications (`quarantine.rs`, `notifier.rs`)

- **Malicious:** default action by setting `auto_quarantine` (`ask` / `always` / `never`). Notification with buttons: *Quarantine*, *Keep (not recommended)*, *Details*.
- **Suspicious:** notification "Be careful with this file" + *Details*; never auto-quarantine.
- **Clean/Low risk:** silent (optional "quiet toast" setting).
- **Unknown:** one low-key notice per day max.
- Notification text is plain and calm, no scary jargon. Examples live in `04`.
- If the user chooses *Keep*, store the hash as user-allowed so the same file never nags again.

### Quarantine store
- Move file to `%LOCALAPPDATA%\ARIS Guard\quarantine\<uuid>.quar`.
- Obfuscate content with a simple reversible XOR/stream transform so it cannot execute and does not retrigger AV scans in a loop. (Document clearly that this is not encryption.)
- Preserve original path, hash, reason, timestamp in SQLite.
- **Restore** returns the file to its original location (or a chosen one) after a confirmation dialog with a warning.
- **Delete permanently** overwrites nothing fancy; normal delete is fine.
- Auto-purge quarantined items older than 30 days only if the user enabled it.

## 12. Manual scans

- "Scan a file" (drag & drop) and "Scan a folder" with progress, cancel, and result list.
- Optional "Scan Downloads now" quick button.
- Never recurse into reparse points; skip system folders unless the user picks them.

## 13. False positives & safety valves

- Allowlist by hash and by folder, editable in Settings.
- Never touch files in `C:\Windows`, `C:\Program Files*` unless the user manually scans them, and never auto-quarantine there.
- Re-scan on restore is optional.
- Provide "Report a wrong result" link to GitHub issues (opens browser; no auto-sent data).

## 14. Acceptance criteria

1. EICAR test file downloaded/copied into Downloads is detected (Defender path) and quarantined/notified within 10 s of becoming stable.
2. A renamed copy (`document.pdf.exe` containing benign data) triggers the double-extension finding.
3. A password-protected zip containing an `.exe` is flagged Suspicious.
4. A zip bomb sample (test-generated, 100:1+ ratio) is not fully expanded and is flagged.
5. A zip-slip sample (`../evil.txt`) never writes outside the sandbox.
6. With Defender stopped, verdict is `Unknown` (or static-only), never `Clean`.
7. With online lookups off, **zero** outbound network calls from the scanner (verify with a firewall log/proxy).
8. Scanning a 4 GB file keeps agent RAM within budget.
9. Agent survives and logs when a file is deleted mid-scan.
