# 05 — Free Public Release & Open Source

Goal: anyone can **download the installer**, or **clone and build the exe**,
at zero cost. ARIS Guard runs no servers; GitHub hosts everything.

## 1. Repository & license

- Public GitHub repo (name e.g. `aris-guard`) under the ARIS organization/account.
- **License: MIT** (`LICENSE`). Source files need no per-file header.
- Required root files: `README.md`, `LICENSE`, `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `THIRD_PARTY_LICENSES.md`.
- Issue templates: bug report, false-positive report, feature request. PR template with checklist.
- `README.md`: screenshots, one-line install, "How it works", honest limits ("does not replace a full antivirus"), build-from-source, FAQ.

## 2. Third-party licensing (get this right)

| Component | License | How we use it |
|-----------|---------|---------------|
| Rust crates, Tauri, React, Radix, Tailwind, lucide | MIT/Apache-2.0 | bundled; list in `THIRD_PARTY_LICENSES.md` (generate with `cargo-about` / `license-checker`) |
| Inter font | SIL OFL | bundled; include license text |
| **ClamAV** | **GPLv2** | **Not bundled.** Optional, user-installed, called as an external program |
| Windows Defender | Microsoft | Used via built-in `MpCmdRun.exe`, not redistributed |
| VirusTotal API | VT terms (free tier non-commercial) | Optional; **user's own key**; no shared/embedded key |
| MalwareBazaar (abuse.ch) | abuse.ch terms | Optional; user's own key |

Before v1.0, re-read current VirusTotal and abuse.ch terms and record the
check date in `PRIVACY.md`. Do not ship any API key in the repo or binary.

## 3. Build from source (must work for strangers)

Document in README, verified on a clean Windows VM:

```
Prereqs: Windows 10/11, Rust (stable, MSVC toolchain), Node 20 LTS,
         Visual Studio Build Tools (C++), WebView2 (preinstalled on Win 10/11)
git clone <repo> && cd aris-guard
npm ci
npm run tauri dev        # development
npm run tauri build      # release → NSIS .exe + .msi in src-tauri/target/release/bundle
```
Provide a `scripts/setup-windows.ps1` that checks prerequisites and prints what is missing (read-only checks, no auto-installs).

## 4. CI/CD (GitHub Actions, free for public repos)

### `ci.yml` (every push/PR)
- `windows-latest`: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`.
- Security: `cargo audit`, `npm audit --omit=dev`, dependency review action.

### `release.yml` (on tag `vX.Y.Z`)
1. Build with `tauri-action` → NSIS `.exe`, `.msi`, plus portable `.zip`.
2. Generate **SHA-256 checksums** file (`SHA256SUMS.txt`) for all artifacts.
3. Sign updater artifacts with the **Tauri updater key** (minisign; private key in GitHub Secrets, public key in `tauri.conf.json`).
4. Create GitHub Release with auto-generated notes from `CHANGELOG.md`, attach artifacts + checksums.
5. Add build provenance attestation (GitHub artifact attestations) so users can verify the binary came from this repo's CI.

Reproducibility: pin Rust toolchain (`rust-toolchain.toml`), commit `Cargo.lock` and `package-lock.json`.

## 5. Code signing & Windows SmartScreen (honest handling)

- Unsigned exes trigger "Windows protected your PC" (SmartScreen) and are more likely to be flagged by antivirus heuristics. Paid certificates cost money, which conflicts with "fully free".
- **Free option to pursue:** apply to **SignPath Foundation** (free code signing for open-source projects; check current eligibility requirements). Integrates with GitHub Actions. Use it if accepted.
- **Until signed:** README has a short, friendly "Windows says unknown publisher — here's why and how to verify the SHA-256" section with screenshots. Never tell users to disable antivirus.
- Submit each release binary to **Microsoft Security Intelligence** (free) as a false-positive/software submission to speed up reputation.
- Tauri **updater** signatures (minisign) are separate from Windows code signing and are always on.

## 6. Installer behavior (NSIS, per-user by default)

- Per-user install (no admin) to `%LOCALAPPDATA%\Programs\ARIS Guard`, with an optional per-machine MSI for IT/admins.
- Shortcuts: Start Menu (always), Desktop (checkbox, default off).
- "Start with Windows" is a **setting inside the app** (default ON, clearly explained in onboarding), not silently forced by the installer.
- Uninstaller: stops the agent, removes autostart entry, removes files; checkbox "Also delete settings, history and quarantine" (default off, with warning that quarantine would be lost).
- WebView2: bootstrapper embedded in installer only if missing (it is preinstalled on Windows 10 21H2+/11).
- Silent flags documented (`/S`).

## 7. Auto-update (optional, privacy-respecting)

- Uses `tauri-plugin-updater` against the **GitHub Releases** manifest (`latest.json`).
- Check at most once per day, only if "Check for updates" is on (default ON), no identifying data sent beyond what a normal HTTPS request implies.
- Signed updates only; refuse unsigned or mismatched signatures.
- User sees "Update available — Install / Later". Never forced, never silent during use.

## 8. Privacy policy (`PRIVACY.md`) must state

- No telemetry, analytics, ads, or accounts. ARIS runs no servers.
- Files never leave the PC. Optional online checks send **only SHA-256 hashes** to VirusTotal/MalwareBazaar, off by default, using the user's own key.
- Update check contacts GitHub only.
- What is stored locally and where; how to delete it (uninstall checkbox or delete `%LOCALAPPDATA%\ARIS Guard`).
- Data is never sold or shared.

## 9. Security policy (`SECURITY.md`)

- Private vulnerability reporting via GitHub Security Advisories.
- Response targets (e.g. acknowledge in 72 h, fix critical in 14 days) — best effort, stated honestly for a solo-maintained project.
- Supported versions: latest release only.
- Clear statement of scope and limits of detection.

## 10. Sustainability (still free)

- Optional "Support ARIS" link (GitHub Sponsors / Ko-fi) in About only. No nagging, no feature gating, no ads.
- Contribution flow: good-first-issue labels, translation guide for new languages, simple rules for startup-rule additions (`startup_rules.json` PRs with evidence).

## 11. Release checklist (every version)

1. Update `CHANGELOG.md` and version in `Cargo.toml`, `package.json`, `tauri.conf.json`.
2. All CI green, perf budgets re-measured.
3. Fresh-VM install → use → update → uninstall test.
4. Tag → CI builds → verify checksums and attestation locally.
5. Test the updater from the previous version to the new one.
6. Publish release notes, submit binaries to Microsoft for analysis.
