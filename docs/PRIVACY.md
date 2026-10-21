# Privacy Policy — ARIS Guard

**Last Updated:** October 2026

ARIS Guard is built on a fundamental principle: **Your PC is your private space.**

---

## 1. Zero Telemetry & No Analytics
- ARIS Guard collects **zero** telemetry, metrics, analytics, or behavioral data.
- There are no tracking pixels, analytics SDKs, session recording tools, or unique device identifiers.
- We do not run any telemetry servers.

## 2. No Accounts or Personal Information
- ARIS Guard requires no user registration, email, or account creation.
- The application runs 100% locally on your machine.

## 3. Local-First Processing
- File scanning, temp cleaning, and startup management happen entirely on your machine.
- Scanned files and their contents never leave your computer.
- Activity history and quarantine metadata are stored in a local SQLite database (`aris-guard.db`) on your disk.

## 4. Optional Cloud Hash Lookups (Explicit Opt-In Only)
- If you optionally enable external threat intelligence lookups (such as VirusTotal or MalwareBazaar), ARIS Guard will only send cryptographic file hashes (SHA-256), **never the file itself**.
- You provide your own personal API keys for these services. No shared keys are used.
- This feature is disabled by default and requires explicit user opt-in.

## 5. Network Activity
The only network calls ARIS Guard will ever perform are:
1. **GitHub Releases check:** Checking for software updates (fetches version JSON from GitHub Releases; no personal data transmitted).
2. **User-configured hash lookups:** Solely if enabled by you with your own API key.
