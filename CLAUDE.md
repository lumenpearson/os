# Lumen OS — agent guide

This file is read by Claude Code (and mirrored for other agents in `AGENTS.md`).
It describes how to work in this repository. Read `ARCHITECTURE.md` for the
system design and `CONTRIBUTING.md` for the workflow.

## What this is

A desktop operating environment in TypeScript + React 19. Same code runs in a
browser (`apps/web`) and inside Tauri 2 on Windows, macOS and Linux
(`apps/desktop`). The Rust
crate `crates/lumen-kernel` provides sandboxed file access and system
information for the desktop build. A landing site lives in `apps/landing`.

## Commands

```bash
pnpm install                  # deps + husky hooks
pnpm dev:web                  # http://localhost:5173
pnpm dev:landing              # http://localhost:5174
pnpm dev:desktop              # tauri dev
pnpm check                    # lint + typecheck + test + build (turbo)
pnpm lint:fix                 # biome --write
pnpm test                     # vitest across packages
pnpm deslop                   # kill-ai-slop scan
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Run `pnpm --filter <pkg> <script>` to scope to one package
(`@lumen/kernel`, `@lumen/ui`, `@lumen/shell`, `@lumen/apps`, `@lumen/web`…).

## Layout and dependency direction

`tokens ← ui ← kernel ← apps ← shell ← apps/{web,desktop}`; `platform` and
`vfs` sit under `kernel`. Never import upward. `packages/ui` follows atomic
design (`atoms/`, `molecules/`, `organisms/`, `templates/`); every folder has
an `index.ts` barrel.

## Design rules

The interface is strict and quiet, with the smoothness of macOS. Hold these on
every change:

1. **Type.** UI text is IBM Plex Sans. Accents — labels, values, shortcuts,
   paths, the clock, anything a terminal would print — are JetBrains Mono.
   Tabular lining numerals everywhere a number can change.
2. **One accent colour** (`--color-accent`), used like a proofreader's pen:
   selection, focus, the active state. Everything else is a neutral ramp.
   No gradients as decoration, no glows, no coloured shadows.
3. **Hierarchy from scale and space.** Few type sizes with real jumps. Space
   by relationship: tight inside a group, generous between groups.
4. **Surfaces.** One radius scale (`--radius-sm/md/lg`), nested radii computed
   (inner = outer − padding). Border and radius live on the same element.
   Depth is a hairline plus a small, colourless shadow.
5. **Motion is information.** 120–200 ms, standard ease, only the properties
   that change. Window open/close and menu reveal use the shared spring
   tokens; nothing scales on hover. Respect `prefers-reduced-motion`.
6. **No emoji in UI, no badge spam, no icon tiles in a tint of themselves, no
   kicker labels above every heading, no invented statistics.**
<!-- deslop-ignore-next-line 14 — this line forbids the pattern it quotes. -->
7. **Copy is specific.** Say what a thing does. No "not just X — it's Y".

Check with `pnpm deslop` and by looking at the running app. The vendored skill
in `.claude/skills/kill-ai-slop/` has the full taxonomy.

## Engineering rules

- TypeScript strict, `noUncheckedIndexedAccess`. No `any` without a comment.
- State lives in kernel stores; components select narrowly.
- Anything that moves at pointer rate (drag, resize, cursor) writes to the DOM
  via refs inside `requestAnimationFrame`, never through React state per event.
- Every interactive element is keyboard reachable with a visible focus ring.
- Tests next to code, `*.test.ts(x)`; Vitest. Logic without tests is not done.
- Conventional Commits; Biome formats; never disable a lint rule inline
  without a reason in the comment.
- Rust: `clippy -D warnings` clean, no `unwrap` outside tests, every command
  validates its path through the sandbox.

## Subagents and skills

`.claude/agents/` defines role agents (ui-designer, kernel-engineer,
rust-engineer, app-builder, reviewer). `.agents/` holds the same roles in a
tool-agnostic form. `.claude/skills/kill-ai-slop/` is the design review skill.
