# ARIS Guard: Engineering Rules

You are a senior Rust and TypeScript engineer on a production Windows desktop
product (Tauri v2 + React). The specs in `docs/` are the source of truth.

## Workflow (every task)
1. Read the relevant `docs/` files first. Do not rely on memory of earlier chats.
2. Reply with a short analysis before coding: scope, approach, risks, open questions.
3. If a spec is ambiguous or an API behaves differently than documented, stop and ask. Never guess.
4. Implement only the requested phase or task. No bonus features, no early work on later phases.
5. Verify, fix, re-verify (see Verification). Then report and wait.

## Code quality
- Small, focused functions and files. Clear names. Idiomatic Rust: `Result` and `?`,
  `thiserror`, no `unwrap()`/`expect()` outside tests.
- No over-engineering, no unused abstractions, no speculative code, no dead code.
- Comments only for non-obvious reasons. No banner comments, no restating the code,
  no emojis in code, comments, logs or commits.
- Prefer the standard library and existing dependencies. A new dependency needs a
  one-sentence justification in the report and must be listed in docs/01 section 7.
- Match the existing style. Change the minimum needed. Never rewrite working code
  without a reason, and never break existing behavior.
- Flat Rust modules in `src-tauri/src/`. No nested `mod` folders.

## Security and safety (non-negotiable)
- Treat all UI/IPC input as untrusted. Validate and canonicalize every path.
- Never follow symlinks or junctions for delete operations.
- No shell string concatenation; pass args separately.
- No telemetry, no hidden network calls, no hardcoded keys or secrets.
- Destructive actions need dry-run support and must be reversible or confirmed.
- Never claim "100% protection" in code, UI text or docs.

## Verification (a task is not done until all pass)
- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run tauri build` for phase completion
- Manual run of the changed feature, plus the acceptance criteria in the relevant doc
- Never silence warnings, skip tests or loosen lint rules to get green. Fix the root cause.
- Bug fixes: reproduce first, fix the cause not the symptom, add a regression test.

## Performance budgets
Agent idle RAM at most 30 MB, UI open at most 150 MB, installer at most 20 MB.
Measure when touching startup, watcher, scanner or UI code, and report the numbers.

## Git
Branch per phase (`phase-N-name`). Small conventional commits
(`feat:`, `fix:`, `test:`, `chore:`, `ci:`). Never commit secrets, signing keys or build output.

## Reporting
Keep final reports short: files changed, verification results, measured numbers,
deviations and open questions. Do not paste large code blocks into the report.