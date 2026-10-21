# Contributing to ARIS Guard

Thank you for your interest in contributing to ARIS Guard! We welcome community contributions to help make Windows PC protection and optimization faster, cleaner, and completely free for everyone.

---

## 🛠️ Development Setup

### Prerequisites
- **Operating System:** Windows 10 (21H2+) or Windows 11 (x64)
- **Rust:** Stable toolchain (`rustup default stable-x86_64-pc-windows-msvc`)
- **Node.js:** Node 20 LTS + `npm`
- **Build Tools:** Visual Studio C++ Build Tools (MSVC)
- **WebView2:** Installed by default on modern Windows 10/11

### Quick Start
```powershell
# 1. Clone repository
git clone https://github.com/ARIS-Enterprise/aris-guard.git
cd aris-guard

# 2. Install frontend dependencies
npm install

# 3. Run in development mode (launches Tauri app with hot-reload)
npm run tauri dev
```

---

## 📐 Architecture & Standards

Before writing code, please review the specifications in [`docs/`](docs/):
- **[`docs/00_README_FOR_ANTIGRAVITY.md`](docs/00_README_FOR_ANTIGRAVITY.md):** Master rules & constraints.
- **[`docs/01_PRODUCT_AND_ARCHITECTURE.md`](docs/01_PRODUCT_AND_ARCHITECTURE.md):** Module structure and performance budgets.
- **[`docs/04_UI_UX_DESIGN_SYSTEM.md`](docs/04_UI_UX_DESIGN_SYSTEM.md):** Design tokens and components.

### Code Style & Quality Checks
Before submitting a pull request, ensure all checks pass:
```powershell
# Format check
cargo fmt --check

# Rust linter
cargo clippy -- -D warnings

# Rust tests
cargo test

# Frontend typecheck & lint
npm run typecheck
npm run lint
```

---

## 🔒 Non-Negotiable Rules

1. **Safety over aggressiveness:** Never permanently delete user files without explicit confirmation or safe quarantine mechanisms.
2. **Zero telemetry:** Do not introduce any third-party tracking, analytics, or remote telemetry libraries.
3. **Flat module structure:** Backend Rust files live side-by-side in `src-tauri/src/` as defined in `01_PRODUCT_AND_ARCHITECTURE.md`.
4. **No hardcoded secrets:** Never commit API keys or sensitive credentials.
