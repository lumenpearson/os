# Agent roles

Tool-agnostic role definitions for AI coding agents working on Lumen OS. The
Claude Code versions with tool bindings live in `.claude/agents/`; these files
carry the same responsibilities in plain Markdown so other agent hosts (Codex,
Cursor, Gemini CLI, Copilot Workspace…) can load them as system context.

| Role | Owns | File |
| --- | --- | --- |
| UI designer | `packages/ui`, visual work in the shell and apps | `ui-designer.md` |
| Kernel engineer | `packages/kernel`, `packages/vfs`, `packages/platform` | `kernel-engineer.md` |
| Rust engineer | `crates/`, `apps/desktop/src-tauri` | `rust-engineer.md` |
| App builder | `packages/apps` | `app-builder.md` |
| Reviewer | everything, read-only | `reviewer.md` |

All roles obey `AI_USAGE_POLICY.md` and the design and engineering rules in
`CLAUDE.md`.
