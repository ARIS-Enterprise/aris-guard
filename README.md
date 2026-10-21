<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/arisai.png">
    <img src="assets/arisai.png" alt="ARIS Guard Logo" width="110" style="border-radius: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.25);" />
  </picture>
</p>

<h1 align="center">ARIS Guard</h1>

<p align="center">
  <strong>A lightweight, private, and honest Windows PC protector and system optimizer.</strong><br>
  Runs quietly in the background · ≤ 30 MB idle RAM · Zero telemetry · 100% Free & Open Source
</p>

<p align="center">
  <a href="https://github.com/ARIS-Enterprise/aris-guard/releases"><img src="https://img.shields.io/github/v/release/ARIS-Enterprise/aris-guard?style=flat-square&color=2F6FED&label=Release" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-success.svg?style=flat-square" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20(21H2%2B)%20%7C%2011-0078D6.svg?style=flat-square&logo=windows" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Backend-Rust%20%7C%20Tauri%20v2-DEA584.svg?style=flat-square&logo=rust" alt="Rust Tauri" />
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%7C%20TS%20%7C%20Tailwind-38BDF8.svg?style=flat-square&logo=react" alt="React TS" />
  <img src="https://img.shields.io/badge/Idle%20Memory-%E2%89%A4%2030%20MB-10B981.svg?style=flat-square" alt="Idle RAM Budget" />
  <img src="https://img.shields.io/badge/Telemetry-None%20(100%25%20Local)-blueviolet.svg?style=flat-square" alt="Zero Telemetry" />
</p>

---

## 💡 Why ARIS Guard?

Most PC cleaners and security tools have become the very thing they promised to fix: bloated, full of intrusive popups, heavy background processes eating battery and RAM, and aggressive upsells.

**ARIS Guard** takes the opposite approach. Built from scratch with **Rust** and **Tauri v2**, it is designed to be an invisible, trustworthy utility that stays out of your way and respects your system resources.

| Feature | Typical Antivirus | Commercial "PC Cleaners" | ARIS Guard |
| :--- | :---: | :---: | :---: |
| **Idle Memory Consumption** | 250 MB – 800 MB+ | 120 MB – 300 MB | **≤ 30 MB** |
| **Idle CPU Usage** | Periodic spikes & scanning | Constant background activity | **~0% (event-driven)** |
| **Telemetry & Data Collection** | Heavy device analytics | User tracking & ads | **Zero (100% local-first)** |
| **Safety Standard** | Aggressive silent quarantine | Destructive registry wipes | **Safe, non-destructive, reversible** |
| **UI Lifecycle** | Constant background renderer | Persistent Electron/Webview | **Destroyed on close (0 MB overhead)** |
| **License** | Paid / Annual Subscription | Freemium nagware | **Free Forever (MIT)** |

---

## ⚡ Core Capabilities

### 🛡️ 1. Real-Time Download Sentinel
Watches your download directories (`Downloads`, browser staging paths) and automatically triages every incoming executable, installer, script, and archive before you execute it.
- **Authenticode Verification:** Evaluates digital signatures and publisher certificates via native Win32 APIs (`WinVerifyTrust`).
- **Mark-of-the-Web (MOTW) Analysis:** Detects Internet Zone provenance (`Zone.Identifier` ADS) and deceptive double extensions (`.pdf.exe`).
- **Windows Defender Integration:** Leverages the native Windows Defender engine via on-demand scan IPC without installing redundant background drivers.
- **Isolated Quarantine:** Safely moves suspicious payloads into an encrypted, non-executable quarantine vault with one-click restore capabilities.

### 🧹 2. Safe & Reversible System Optimizer
Removes accumulated system junk and browser temporary files without breaking installed applications.
- **Junction & Symlink Aware:** Proactively guards against symlink recursion and junction traversal attacks.
- **Age-Gated Cleaning:** Only touches files older than 24 hours to prevent clashing with active application installers.
- **Dry-Run Previews:** Shows exactly what will be removed and how much disk space will be reclaimed before touching a single byte.
- **No Dangerous Registry "Cleaning":** Avoids blind registry alterations that destabilize Windows.

### 🚀 3. Startup & Process Management
Gives you control over what software runs on your computer.
- **Raw Startup Fidelity:** Reads both registry autorun keys (`HKCU`/`HKLM`) and Startup folders directly without third-party abstraction layers.
- **Reversible Disabling:** Uses native Windows `StartupApproved` keys so startup items can be toggled on/off without deleting their configuration.
- **Memory Footprint Inspector:** Identifies background processes holding excessive private working set memory.

---

## 🏗️ Architecture: The Two-Process Model

To keep system overhead minimal, ARIS Guard is strictly split into two operational layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ARIS Guard Architecture                     │
├────────────────────────────────┬────────────────────────────────┤
│    Persistent Background Agent │       On-Demand Desktop UI     │
│             (Rust Core)        │         (Tauri + React)        │
├────────────────────────────────┼────────────────────────────────┤
│ • System Tray & Native Toast   │ • Dashboard & Visual Metrics   │
│ • Directory Watcher (notify)   │ • Threat Quarantine Manager    │
│ • SQLite Database (rusqlite)   │ • Interactive Settings         │
│ • Low-priority scan threadpool │ • History & Audit Trail        │
│                                │                                │
│ Budget: ≤ 30 MB RAM | ~0% CPU  │ Budget: ≤ 150 MB (WHEN OPEN)   │
│ Lifetime: System boot to exit  │ Lifetime: Destroyed when closed│
└────────────────────────────────┴────────────────────────────────┘
```

> **Memory Rule:** When you close the ARIS Guard window, the entire WebView2 rendering instance is **terminated from memory**, leaving only the lean Rust agent (≤ 30 MB) running in the tray.

---

## ⚖️ Honest Boundaries (What ARIS Guard is NOT)

We believe in complete technical honesty:
- **Not a replacement for Windows Defender:** ARIS Guard collaborates with Windows Defender; it does not replace kernel-level endpoint threat detection.
- **No kernel-mode drivers:** ARIS Guard runs entirely in user-space using standard Windows security APIs. It will never install kernel drivers that could cause system instability or Blue Screens (BSOD).
- **No miraculous "PC Boost":** We do not manipulate system clocks, disable essential OS services, or run unsafe registry cleaners.

---

## 📁 Repository Structure

```text
aris-guard/
├── assets/                       # Branding, icons, and visual assets
├── docs/                         # Technical specs & engineering blueprints
│   ├── 00_README_FOR_ANTIGRAVITY.md
│   ├── 01_PRODUCT_AND_ARCHITECTURE.md
│   ├── 02_SECURITY_SCANNER_SPEC.md
│   ├── 03_OPTIMIZER_SPEC.md
│   ├── 04_UI_UX_DESIGN_SYSTEM.md
│   ├── 05_DISTRIBUTION_OPEN_SOURCE.md
│   ├── 06_ROADMAP_AND_TESTING.md
│   └── README.md
├── src/                          # Frontend UI (React, Vite, TypeScript, Tailwind)
├── src-tauri/                    # Core Engine (Rust, Tauri v2, SQLite, Win32)
├── CONTRIBUTING.md               # Developer setup & guidelines
├── LICENSE                       # MIT License
├── PRIVACY.md                    # Zero-telemetry policy
├── README.md                     # Project landing documentation
└── SECURITY.md                   # Security vulnerability reporting
```

---

## 🛠️ Building from Source

### Prerequisites
- **OS:** Windows 10 (21H2 or newer) / Windows 11 (x64)
- **Rust:** Stable toolchain (`rustup default stable-x86_64-pc-windows-msvc`)
- **Node.js:** Node 20 LTS or later with `npm`
- **C++ Build Tools:** Visual Studio Build Tools with Desktop C++ workload
- **WebView2 Runtime:** Included by default in Windows 10/11

### Quick Build
```powershell
# 1. Clone the repository
git clone https://github.com/ARIS-Enterprise/aris-guard.git
cd aris-guard

# 2. Install dependencies
npm install

# 3. Launch in development mode (with Hot Module Replacement)
npm run tauri dev

# 4. Compile optimized production release (NSIS installer + portable binary)
npm run tauri build
```

---

## 🔒 Privacy & Security

- **Privacy Policy:** ARIS Guard does not transmit any files, hardware telemetry, or analytics. Read [`PRIVACY.md`](PRIVACY.md).
- **Vulnerability Disclosure:** If you identify a security issue, please review [`SECURITY.md`](SECURITY.md) for responsible disclosure procedures.

---

## 📄 License

ARIS Guard is open-source software licensed under the **[MIT License](LICENSE)**.
Free for personal and commercial use.
