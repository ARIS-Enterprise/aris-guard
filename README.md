<p align="center">
  <img src="assets/arisai.png" alt="ARIS Guard Logo" width="120" style="border-radius: 16px;" />
</p>

<h1 align="center">ARIS Guard</h1>

<p align="center">
  <strong>Lightweight, private, and honest Windows PC protector & optimizer.</strong><br>
  Free forever · No ads · Zero telemetry · 100% open source
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6.svg?style=flat-square&logo=windows" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Backend-Rust%20%2B%20Tauri%20v2-orange.svg?style=flat-square&logo=rust" alt="Rust Tauri" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20TS%20%2B%20Tailwind-61DAFB.svg?style=flat-square&logo=react" alt="React TS" />
  <img src="https://img.shields.io/badge/Idle%20RAM-%E2%89%A4%2030%20MB-success.svg?style=flat-square" alt="Idle RAM" />
</p>

---

## 📖 Overview

**ARIS Guard** runs quietly in your system tray, using almost zero CPU and under 30 MB of RAM. It protects your PC from risky downloads, cleans junk files automatically after boot, and tames unnecessary background and startup apps safely and reversibly.

### 🌟 Key Pillars
- **🛡️ Real-Time Download Scanner:** Watches download directories and evaluates new files (executables, scripts, archives, installers) using Authenticode signature verification, Mark-of-the-Web (MOTW) checks, Windows Defender integration, and an isolated quarantine chamber.
- **⚡ Safe & Reversible Optimizer:** Safely cleans temp and cache files, manages startup items (registry and startup folders), and helps you identify memory-hungry background processes.
- **🪶 Extremely Lightweight:** Two-process model with a persistent Rust background agent ($\le 30\text{ MB}$ RAM) and an on-demand WebView2 UI that completely terminates when closed to free memory.
- **🔒 True Privacy:** Zero analytics, no tracking, no cloud accounts. All scans and operations happen locally on your PC.

---

## 📁 Repository Structure

```
aris-guard/
├── assets/                       # Branding assets, icons, and diagrams
│   └── arisai.png
├── docs/                         # Architecture specifications & roadmap
│   ├── 00_README_FOR_ANTIGRAVITY.md
│   ├── 01_PRODUCT_AND_ARCHITECTURE.md
│   ├── 02_SECURITY_SCANNER_SPEC.md
│   ├── 03_OPTIMIZER_SPEC.md
│   ├── 04_UI_UX_DESIGN_SYSTEM.md
│   ├── 05_DISTRIBUTION_OPEN_SOURCE.md
│   └── 06_ROADMAP_AND_TESTING.md
├── src/                          # React + TypeScript frontend (Vite, Tailwind, Radix UI)
├── src-tauri/                    # Rust core agent (Tauri v2, flat module architecture)
├── CONTRIBUTING.md               # Contribution guidelines & dev workflow
├── LICENSE                       # MIT License
├── PRIVACY.md                    # Privacy policy & local-first guarantee
├── README.md                     # Project homepage
└── SECURITY.md                   # Vulnerability disclosure policy
```

---

## 📚 Technical Specifications

Detailed design specifications can be found in the [`docs/`](docs/) directory:

| Document | Topic | Description |
|---|---|---|
| [**00 — Master Handoff**](docs/00_README_FOR_ANTIGRAVITY.md) | Overview & Rules | Core constraints, locked tech stack, and non-negotiables. |
| [**01 — Architecture**](docs/01_PRODUCT_AND_ARCHITECTURE.md) | System Design | Process model, flat Rust modules, and performance budgets. |
| [**02 — Security Scanner**](docs/02_SECURITY_SCANNER_SPEC.md) | Protection Engine | Download watcher, multi-stage scan pipeline, and quarantine. |
| [**03 — Optimizer**](docs/03_OPTIMIZER_SPEC.md) | System Maintenance | Temp junk cleaner, startup app manager, and health score. |
| [**04 — UI / UX Design**](docs/04_UI_UX_DESIGN_SYSTEM.md) | Interface & Tokens | Dark/light theme design system, typography, and copy guidelines. |
| [**05 — Distribution**](docs/05_DISTRIBUTION_OPEN_SOURCE.md) | Release & CI/CD | NSIS packaging, signing strategies, and open-source release. |
| [**06 — Roadmap & Testing**](docs/06_ROADMAP_AND_TESTING.md) | Milestones & QA | Phased roadmap, acceptance criteria, and test matrix. |

---

## 🚀 Building from Source

### Prerequisites
1. Windows 10 (21H2+) or Windows 11 (x64).
2. [Rust](https://rustup.rs/) (stable MSVC toolchain: `x86_64-pc-windows-msvc`).
3. [Node.js](https://nodejs.org/) (version 20 LTS or newer).
4. Visual Studio Build Tools (C++ development workload).

### Commands
```powershell
# 1. Clone the repository
git clone https://github.com/ARIS-Enterprise/aris-guard.git
cd aris-guard

# 2. Install dependencies
npm install

# 3. Run in development mode with hot-reload
npm run tauri dev

# 4. Build production installer (.exe and .msi)
npm run tauri build
```

---

## 📄 License & Privacy

- **License:** Licensed under the [MIT License](LICENSE).
- **Privacy:** 100% private. Read our full [Privacy Policy](PRIVACY.md).
- **Security:** To report security concerns, see [SECURITY.md](SECURITY.md).
