# ARIS Guard — Master Handoff (Read This First)

**Product:** ARIS Guard — a free, open-source Windows PC protector + optimizer.
**Company/Brand:** ARIS
**License:** MIT (app code). Free forever, no ads, no telemetry, no account.
**Platform (v1):** Windows 10 (21H2+) and Windows 11, x64.

## 1. One-paragraph summary

ARIS Guard runs quietly in the system tray using very little RAM and disk. It
(1) watches download locations and scans every new file (exe, zip, scripts,
documents) for threats and notifies the user, (2) cleans temp/junk files
automatically shortly after Windows starts, (3) finds and disables unnecessary
startup and background apps safely and reversibly, and (4) shows a clean
dashboard with the real health of the PC. Anyone can download the installer
from GitHub Releases or build the exe from source.

## 2. Document index (implement in this order)

| # | File | Purpose |
|---|------|---------|
| 01 | `01_PRODUCT_AND_ARCHITECTURE.md` | Goals, stack, process model, repo layout, IPC, data |
| 02 | `02_SECURITY_SCANNER_SPEC.md` | Download watcher, scan pipeline, verdicts, quarantine |
| 03 | `03_OPTIMIZER_SPEC.md` | Temp cleaner, startup manager, processes/RAM, health |
| 04 | `04_UI_UX_DESIGN_SYSTEM.md` | Brand, tokens, screens, components, i18n |
| 05 | `05_DISTRIBUTION_OPEN_SOURCE.md` | Free public release, CI/CD, signing, licensing, privacy |
| 06 | `06_ROADMAP_AND_TESTING.md` | Phases, acceptance criteria, test plan, risks |

## 3. Non-negotiable rules for the implementing agent

1. **One phase at a time.** Follow `06_ROADMAP_AND_TESTING.md`. Finish and
   verify a phase before starting the next. Do not bundle phases.
2. **Do not break existing functionality.** When a phase touches an earlier
   module, change the minimum required and re-run its tests.
3. **No telemetry, no analytics, no hidden network calls.** The only allowed
   network calls are the ones listed in `02` (opt-in hash lookups) and the
   update check in `05`.
4. **No hardcoded secrets or API keys.** Users supply their own optional keys.
5. **Safety over aggressiveness.** Never delete or disable anything that is not
   explicitly allowed by the specs. Everything destructive must be reversible
   or require confirmation, and must support dry-run.
6. **Honesty in UI copy.** Never claim "100% protection". Use the wording in `04`.
7. **Performance budgets in `01` are hard requirements**, not suggestions.
8. **Flat Rust modules:** files live side by side in `src-tauri/src/`
   (no nested `mod` folders), as listed in `01`.
9. **Ask before deviating.** If a spec is ambiguous or a crate/API behaves
   differently than described, stop and report instead of guessing.
10. **Windows-only code is isolated** in `win_*.rs` modules so a future
    port stays possible.

## 4. Locked tech stack

- **Core/backend:** Rust (stable), Tauri v2
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Radix UI primitives
- **State:** Zustand
- **Storage:** SQLite (`rusqlite`, bundled) + one `settings.json`
- **Installer:** Tauri bundler → NSIS `.exe` and `.msi`, plus portable `.zip`
- **CI:** GitHub Actions (`windows-latest`)

## 5. Definition of Done (whole project, v1.0)

- All phases in `06` complete, all acceptance tests green.
- Idle agent RAM and CPU within budget (see `01`).
- EICAR test file detected and quarantined end-to-end.
- Fresh-Windows-VM install, use, and uninstall leaves no leftovers.
- Release artifacts built by CI with published SHA-256 checksums.
