# Agent instructions

Tool-agnostic instructions for any coding agent (Codex, Cursor, Copilot,
Gemini, Claude…) working in this repository. `CLAUDE.md` is the canonical
version; this file mirrors it.

- Read `ARCHITECTURE.md` before touching `packages/kernel`, `packages/vfs`, or
  `crates/`.
- Run `pnpm check` before proposing a change. Rust changes also run
  `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`.
- Follow the design rules in `CLAUDE.md` and run `pnpm deslop` on UI work.
- Follow `AI_USAGE_POLICY.md`: draft pull requests only, never merge, never
  publish, disclose AI authorship in commit trailers.
- Role definitions live in `.agents/`.
