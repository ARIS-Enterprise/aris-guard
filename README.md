<p align="center">
  <img src="assets/arisai.png" alt="ARIS Guard Logo" width="100" style="border-radius: 18px;" />
</p>

<h1 align="center">ARIS Guard</h1>

<p align="center">
  <strong>High-performance, private, and lightweight Windows PC protection and system optimization.</strong><br>
  Open source under the MIT License. Free of advertisements, third-party trackers, and telemetry.
</p>

<p align="center">
  <a href="https://github.com/ARIS-Enterprise/aris-guard/releases"><img src="https://img.shields.io/github/v/release/ARIS-Enterprise/aris-guard?style=flat-square&color=2563EB&label=Release" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D4?style=flat-square" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Architecture-Rust%20%7C%20Tauri%20v2-B7410E?style=flat-square" alt="Backend" />
  <img src="https://img.shields.io/badge/Frontend-React%20%7C%20TypeScript-3178C6?style=flat-square" alt="Frontend" />
  <img src="https://img.shields.io/badge/Memory-under%2030%20MB%20idle-059669?style=flat-square" alt="Idle Memory" />
  <img src="https://img.shields.io/badge/Telemetry-None%20(Local--First)-6D28D9?style=flat-square" alt="Zero Telemetry" />
</p>

---

## Overview

Modern endpoint utilities often become resource-intensive background burdens, consuming excessive memory and introducing intrusive alerts or data collection.

ARIS Guard provides an efficient, honest alternative. Engineered with Rust and Tauri v2, it operates as a silent system tray utility designed to maintain system cleanliness and inspect incoming downloaded files while adhering to strict resource constraints.

### Comparison Matrix

| Property | Standard Antivirus Suites | Commercial PC Utilities | ARIS Guard |
| :--- | :--- | :--- | :--- |
| **Idle Memory** | 250 MB – 800 MB+ | 120 MB – 300 MB | **under 30 MB** |
| **Idle CPU Activity** | Periodic intensive scans | Continuous background polling | **Near 0% (event-driven)** |
| **Data Collection** | Extensive device telemetry | User tracking and analytics | **Zero (strictly local)** |
| **Remediation Model** | Silent or destructive removal | Destructive registry alterations | **Non-destructive and reversible** |
| **UI Process Lifecycle**| Always-active renderer | Resident Electron/Webview | **Terminated on window close** |
| **License** | Paid subscription | Freemium | **MIT (Open Source)** |

---

## Core Capabilities

### 1. Real-Time Download Sentinel
Continuously monitors designated download directories and incoming files across web browsers and staging paths.
- **Authenticode Verification:** Evaluates publisher certificates and digital signatures utilizing Win32 APIs (`WinVerifyTrust`).
- **Mark-of-the-Web (MOTW) Inspection:** Detects external zone provenance (`Zone.Identifier` Alternate Data Streams) and double-extension obfuscation patterns.
- **Windows Defender Integration:** Coordinates on-demand file analysis via the native Windows Defender engine (`MpCmdRun`) without redundant driver overhead.
- **Isolated Quarantine:** Relocates high-risk artifacts to an encrypted, unexecutable vault with complete restoration capability.

### 2. System and Cache Cleanup
Eliminates obsolete temporary files and browser cache accumulations without compromising application integrity.
- **Reparse Point Defense:** Verifies paths against junction traversal and symbolic link redirects.
- **Age-Restricted Deletion:** Enforces a 24-hour modification threshold to protect active installers.
- **Non-Destructive Operations:** Excludes Windows registry tampering, driver removals, and system critical directories.
- **Dry-Run Analysis:** Provides preview metrics of recoverable disk space prior to execution.

### 3. Startup and Process Management
Presents visibility into configured boot items and resident system processes.
- **Direct Registry Enumeration:** Inspects `Run` paths directly across `HKCU` and `HKLM`.
- **Reversible Disabling:** Interfaces with the Windows `StartupApproved` architecture to toggle services without deletion.
- **Memory Footprint Reporting:** Identifies background processes consuming excessive private working set memory.

---

## Process Model and Architecture

ARIS Guard separates persistent operational tasks from the user interface:

```text
+-------------------------------------------------------------------+
|                     ARIS Guard Architecture                       |
+---------------------------------+---------------------------------+
| Persistent Background Agent     | On-Demand User Interface        |
| (Rust Core)                     | (Tauri v2 + React)              |
+---------------------------------+---------------------------------+
| - System Tray & Notifications   | - System Status & Metrics       |
| - Directory Watcher (notify)    | - Quarantine Inspection         |
| - Embedded SQLite (rusqlite)    | - Settings Management           |
| - Task Execution & Scheduler    | - Audit History Log             |
|                                 |                                 |
| Memory: under 30 MB (idle)      | Memory: Active only when open   |
| CPU: Near 0% average            | Lifetime: Destroyed on close    |
+---------------------------------+---------------------------------+
```

When the desktop window is closed, the WebView2 renderer process is completely terminated from memory. The background agent remains resident in the system tray, consuming minimal resources.

---

## Boundaries and Non-Goals

- **Not a replacement for Windows Defender:** ARIS Guard interfaces with Defender; it does not implement custom kernel-level antivirus drivers.
- **No kernel-mode drivers:** Executes strictly within user mode permissions.
- **No unsafe registry optimization:** Avoids arbitrary registry key pruning that can introduce OS instability.

---

## Repository Structure

```text
aris-guard/
|-- .github/                      # Workflows, contribution, and security policies
|   |-- workflows/ci.yml
|   |-- CONTRIBUTING.md
|   `-- SECURITY.md
|-- assets/                       # Branding and media assets
|   `-- arisai.png
|-- docs/                         # Technical specifications and design documents
|   |-- 00_README_FOR_ANTIGRAVITY.md
|   |-- 01_PRODUCT_AND_ARCHITECTURE.md
|   |-- 02_SECURITY_SCANNER_SPEC.md
|   |-- 03_OPTIMIZER_SPEC.md
|   |-- 04_UI_UX_DESIGN_SYSTEM.md
|   |-- 05_DISTRIBUTION_OPEN_SOURCE.md
|   |-- 06_ROADMAP_AND_TESTING.md
|   |-- PRIVACY.md
|   `-- README.md
|-- src/                          # React + TypeScript frontend
|-- src-tauri/                    # Rust core agent and Tauri configuration
|-- .gitignore                    # Artifact exclusions
|-- LICENSE                       # MIT License
`-- README.md                     # Project landing documentation
```

---

## Technical Specifications

The engineering blueprints are documented within [`docs/`](docs/):

| Document | Area | Scope |
| :--- | :--- | :--- |
| [00 - Master Handoff](docs/00_README_FOR_ANTIGRAVITY.md) | Guidelines | Architecture rules, locked stack, and acceptance standards |
| [01 - Architecture](docs/01_PRODUCT_AND_ARCHITECTURE.md) | Core Design | Process model, flat module layout, and memory budgets |
| [02 - Security Scanner](docs/02_SECURITY_SCANNER_SPEC.md) | File Inspection | Download watcher, analysis stages, and quarantine format |
| [03 - Optimizer](docs/03_OPTIMIZER_SPEC.md) | Maintenance | Temp file cleanup, startup management, and health scoring |
| [04 - UI/UX Design](docs/04_UI_UX_DESIGN_SYSTEM.md) | Interface | Visual tokens, dark/light themes, and bilingual support |
| [05 - Distribution](docs/05_DISTRIBUTION_OPEN_SOURCE.md) | Deployment | NSIS packaging, CI/CD pipelines, and signing strategy |
| [06 - Roadmap & QA](docs/06_ROADMAP_AND_TESTING.md) | Verification | Phased implementation criteria and testing matrix |

---

## Building from Source

### Prerequisites
- Windows 10 (version 21H2 or later) or Windows 11 (x64)
- Rust stable toolchain (`x86_64-pc-windows-msvc`)
- Node.js (version 20 LTS or newer)
- Visual Studio Build Tools (C++ workload)

### Compilation
```powershell
# Clone repository
git clone https://github.com/ARIS-Enterprise/aris-guard.git
cd aris-guard

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Compile production release binary and installer
npm run tauri build
```

---

## Policy and Governance

- **License:** Licensed under the [MIT License](LICENSE).
- **Privacy:** Review our complete zero-telemetry policy in [docs/PRIVACY.md](docs/PRIVACY.md).
- **Security:** Security disclosures and vulnerability reporting procedures are located in [.github/SECURITY.md](.github/SECURITY.md).
- **Contributions:** Review developer standards and requirements in [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).
