# 04 — UI / UX Design System

**Feel:** clean, calm, modern, trustworthy. A security tool should feel
confident, not scary. Lots of whitespace, one clear action per screen,
no clutter, no fake urgency.

## 1. Brand

- Name: **ARIS Guard** (by ARIS)
- Tone of voice: friendly, plain language, short sentences, never alarmist, never "100% safe".
- Logo: simple shield outline with a subtle gradient (cyan → blue). Provide SVG (app icon, tray icon in 16/20/24/32 px, mono variants for light/dark tray).
- Tray states: **Protected** (shield, normal), **Working** (subtle animation/dot), **Attention** (amber dot), **Paused** (grey).

## 2. Design tokens

### 2.1 Color (dark is the default look; light supported; follow system by default)

| Token | Dark | Light |
|-------|------|-------|
| `--bg` | `#0B0F17` | `#F6F8FC` |
| `--surface` | `#121826` | `#FFFFFF` |
| `--surface-2` | `#1A2234` | `#EEF2F9` |
| `--border` | `#243049` | `#DDE3EE` |
| `--text` | `#E6EAF2` | `#0F172A` |
| `--text-muted` | `#8B96AD` | `#5B6780` |
| `--primary` | `#4F8CFF` | `#2F6FED` |
| `--accent` | `#22D3EE` | `#0EA5C6` |
| `--success` | `#22C55E` | `#16A34A` |
| `--warning` | `#F59E0B` | `#D97706` |
| `--danger` | `#EF4444` | `#DC2626` |
| `--brand-gradient` | `linear-gradient(135deg,#4F8CFF,#22D3EE)` | same |

Contrast: text/background ≥ 4.5:1 in both themes. Color is never the only
signal; always pair with an icon or label.

### 2.2 Typography
- UI font: **Inter** (bundled locally, variable font subset; no CDN).
- Mono (hashes, paths): **JetBrains Mono** or system monospace fallback.
- Bangla: system **Nirmala UI** (ships with Windows) as fallback; do not bundle a large Bangla font.
- Scale: 12 / 14 (base) / 16 / 20 / 28 / 40. Line-height 1.5 body, 1.2 headings.
- Weights: 400, 500, 600 only.

### 2.3 Spacing, shape, depth
- 8-pt grid (4, 8, 12, 16, 24, 32, 48).
- Radius: 8 (inputs), 12 (cards), 16 (panels), 999 (pills).
- Shadows: soft and low (`0 4px 20px rgba(0,0,0,.25)` dark; lighter in light mode). No heavy glow.
- Borders 1 px `--border`. Glass/blur effects: **none** (performance).

### 2.4 Motion
- Transitions 120–200 ms ease-out, CSS only (no heavy animation library).
- Health ring animates once on load.
- Respect `prefers-reduced-motion`: disable non-essential animation.
- No animation runs while the window is hidden/unfocused.

## 3. Layout

- Window: 1000 × 680 default, min 860 × 560, custom-styled title bar (native min/max/close behavior preserved).
- Left **sidebar** (72 px collapsed icons, 220 px expanded) with: Dashboard · Protection · Optimizer · Quarantine · History · Settings. Bottom: version + "Free & open source" link.
- Content area: max-width 960 px, centered, 24–32 px padding.
- Responsive within the window size range; no horizontal scroll.

## 4. Screens

### 4.1 Dashboard
- **Hero card:** big circular **Health Score** ring (0–100) with a one-line status ("Your PC is in good shape" / "3 things can be improved").
- **Primary button:** "Smart Fix" → runs safe recommended actions after a confirmation sheet showing exactly what will happen.
- 4 stat cards: Protection (On/Paused, last scan), Junk found (size), Startup apps (enabled / recommended), Memory (used %).
- "Recent activity" list (last 5 actions).

### 4.2 Protection
- Status banner (Watching: Downloads, Desktop · Engine: Windows Defender ✓ / ClamAV ✗).
- Folder list with add/remove; toggle "Scan new downloads".
- Drag-and-drop zone: "Drop a file or folder to scan".
- Recent scan results table: file, verdict pill, time, action. Click → detail drawer (hash, engines, reasons in plain language, "Quarantine"/"Allow").
- Optional section "Extra checks (online)" with consent explanation and key field.

### 4.3 Optimizer (tabs)
- **Cleaner:** category checklist with sizes (after preview), "Preview" → "Clean". Progress bar, result summary ("Freed 1.2 GB").
- **Startup:** table with icon, name, publisher, impact pill, toggle. Filters: All / Recommended / Enabled. Lock icon for protected.
- **Apps & Memory:** top memory users list with "Close" buttons; memory bar with real numbers; "Free memory now" tucked in a secondary menu with explanation.

### 4.4 Quarantine
- List with original path, reason, date; actions: Restore (with warning dialog), Delete permanently. Empty state: friendly illustration + "Nothing in quarantine".

### 4.5 History
- Timeline of scans, cleans, startup changes. Filter by type. "Undo" on reversible items.

### 4.6 Settings
Sections: General (start with Windows, language, theme) · Protection (folders, auto-quarantine, allowlist) · Cleaner (categories, age, auto-run) · Privacy (online lookups, keys) · Advanced (log level, open logs folder, reset settings) · About (version, license, GitHub, check for updates).

### 4.7 First-run onboarding (3 short steps)
1. Welcome + what ARIS Guard does (and what it doesn't).
2. Choose protected folders + auto-start toggle.
3. Optional: online checks (off by default), then "Run first check".

## 5. Components (build once, reuse everywhere)

`Button` (primary/secondary/ghost/danger) · `IconButton` · `Card` · `StatCard`
· `HealthRing` (SVG) · `Pill` (Clean/Low/Suspicious/Malicious/Unknown/
Recommended/Protected) · `Toggle` · `Checkbox` · `Tabs` · `Table` (virtualized
when > 200 rows) · `Drawer` · `Dialog` · `ConfirmSheet` · `Toast` · `Progress`
· `Tooltip` · `EmptyState` · `Skeleton` · `Banner`.
Built on Radix primitives + Tailwind tokens; icons from **lucide-react**.
Charts: custom lightweight SVG only (no heavy chart library).

## 6. Verdict pills

| Verdict | Color | Icon | Copy |
|---------|-------|------|------|
| Clean | success | check | "No threats found" |
| Low risk | accent | info | "Looks okay, a few minor flags" |
| Suspicious | warning | alert-triangle | "Be careful with this file" |
| Malicious | danger | shield-alert | "Threat detected" |
| Unknown | muted | help-circle | "Could not be checked" |

## 7. Notification copy (calm, plain, actionable)

- Malicious: **"Threat blocked"** — "`setup.exe` looks dangerous. We moved it to Quarantine." (when auto) / "…Move it to Quarantine?" [Quarantine] [Details] [Keep]
- Suspicious: **"Be careful with this file"** — "`invoice.pdf.exe` pretends to be a PDF." [Details]
- Cleaner: **"Cleanup done"** — "Freed 1.2 GB of junk files."
- Unknown: **"Couldn't check a download"** — "Turn on Windows Defender or install ClamAV for better checks."
Max 1 toast per 10 s (batch the rest into a summary). Honor Windows Focus Assist.

## 8. Copy rules
- Never say "100% protected", "military-grade", "boost speed by X%".
- Use "reduces risk", "checks", "helps".
- Errors: what happened + what to do next, no codes in the main text (code available in "Details").
- Destructive actions use verbs on buttons ("Delete permanently"), never "OK".

## 9. Accessibility
- Full keyboard navigation, visible focus rings (2 px `--primary`).
- ARIA roles/labels on custom components; screen-reader text for verdict pills and the health ring.
- Minimum hit target 36 px. Contrast per 2.1. Respect system text scaling and reduced motion.

## 10. Internationalization
- Languages v1: **English (default)** and **Bangla (বাংলা)**. All UI strings in `src/locales/en.json` and `bn.json`; no hardcoded text in components.
- Number/date/size formatting via `Intl` with the active locale.
- Layout must tolerate 30% longer strings.
- Easy contribution: documented process to add a language file via PR.

## 11. Frontend performance rules
- Code-split per page (`React.lazy`), keep initial JS ≤ 250 KB gzip.
- No external network resources. Fonts/icons bundled and subsetted.
- Pause all timers/event listeners when the window is hidden.
- Virtualize long lists. Avoid re-render storms: select narrow Zustand slices.

## 12. Acceptance criteria
1. Dark and light themes both pass contrast checks; follows system theme live.
2. UI fully usable by keyboard only.
3. Switching English ↔ Bangla updates everything without reload.
4. Window open memory ≤ 150 MB; closing it returns the agent to ≤ 30 MB.
5. No UI string contains a banned phrase from section 8 (lint check).
