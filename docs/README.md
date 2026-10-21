# ARIS Guard — Documentation & Architecture Index

Welcome to the **ARIS Guard** technical specifications and documentation library.
All specifications follow a strict implementation roadmap and design principles outlined below.

---

## 📑 Specification Index

| # | Specification Document | Description / Focus |
|---|------------------------|---------------------|
| 00 | [Master Handoff & Rules](00_README_FOR_ANTIGRAVITY.md) | High-level summary, non-negotiable architectural rules, locked tech stack, and definition of done. |
| 01 | [Product & Architecture](01_PRODUCT_AND_ARCHITECTURE.md) | Process model, flat module repository layout, performance budgets (≤ 30MB idle RAM), IPC, and database design. |
| 02 | [Security Scanner Spec](02_SECURITY_SCANNER_SPEC.md) | Real-time download watcher, scan pipeline (hash, Authenticode, MOTW, static checks, Defender adapter), and quarantine. |
| 03 | [Optimizer Spec](03_OPTIMIZER_SPEC.md) | Safe & reversible temp junk cleaner, startup manager, background process optimizer, and PC health scoring. |
| 04 | [UI/UX Design System](04_UI_UX_DESIGN_SYSTEM.md) | Visual design tokens, dark/light themes, typography (Inter + Nirmala UI), layout, screens, and bilingual copy (EN/BN). |
| 05 | [Distribution & Open Source](05_DISTRIBUTION_OPEN_SOURCE.md) | Public release strategy, packaging (NSIS .exe, .msi, portable .zip), CI/CD workflows, and code signing. |
| 06 | [Roadmap & Testing Plan](06_ROADMAP_AND_TESTING.md) | Phased implementation milestones (Phase 0 through Phase 6), acceptance criteria, and validation matrix. |

---

## 🛡️ Core Architectural Principles

1. **Safety over aggressiveness:** Disable rather than delete; quarantine rather than destroy. Every destructive action is reversible.
2. **True Low Footprint:** Agent runs quietly in the tray using $\le 30\text{ MB}$ RAM and $\approx 0\%$ CPU at idle. The heavy WebView2 UI is destroyed when closed.
3. **Local-First & Private:** No telemetry, no background analytics, no cloud sync, and no user accounts.
