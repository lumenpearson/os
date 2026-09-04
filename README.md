# Lumen OS

A desktop operating environment written in TypeScript and React 19. The same
code runs in a browser tab and natively on Windows through Tauri 2, where a
Rust kernel provides sandboxed file access and system information.

```bash
pnpm install
pnpm dev:web        # the OS at http://localhost:5173
pnpm dev:landing    # the site at http://localhost:5175
pnpm dev:desktop    # the Tauri window (needs Rust + platform prerequisites)
```

## What it is

- **A shell.** Menubar with the focused app's menus, taskbar with Start,
  windows that drag, resize from any edge and snap to screen edges, a custom
  cursor drawn by the OS, Spotlight search, Control Center, notifications,
  Mission Control, a lock screen with a recovery-key flow, and a screensaver.
- **Applications.** Files, Terminal, Text Editor, Writer, Sheets, Slides,
  Browser, Task Manager, Settings, Calculator, Notes, Preview, Media Player,
  PDF Viewer, Calendar, Clock, System Information, Storage, Paint,
  Minesweeper, Software Center, Console and Help.
- **Pseudo-programs.** A `.app` file is a JSON manifest that either aliases a
  built-in app, runs a shell script, or embeds an HTML document that runs in a
  sandboxed frame with a small `window.lumen` API. The Software Center
  installs and authors them.
- **Where data lives.** In the browser, the origin-private file system (with
  IndexedDB as a fallback). On the desktop, a folder you choose, which the
  Rust kernel confines every file operation to.

## Layout

```
apps/
  web/        Vite build of the OS, deployed as a static site
  desktop/    Tauri 2 host; src-tauri/ is the Rust binary
  landing/    Marketing and documentation site with a three.js hero
packages/
  tokens/     Design tokens: colour, type, space, motion
  ui/         Atomic component library (atoms → molecules → organisms → templates)
  platform/   Host bridge: one interface, web and Tauri implementations
  vfs/        Virtual file system: paths, adapters (OPFS, IndexedDB, Tauri, memory)
  kernel/     Processes, windows, app registry, settings, users, events
  apps/       The built-in applications and the app SDK
  shell/      The desktop environment itself
crates/
  lumen-kernel/  Sandboxed file system, system information, configuration
```

`ARCHITECTURE.md` explains the layers and the decisions behind them.
`CONTRIBUTING.md` covers the workflow. `CLAUDE.md` and `AGENTS.md` are the
instructions coding agents follow in this repository.

## Checks

```bash
pnpm check      # lint, typecheck, unit tests and builds for every package
pnpm deslop     # design review with the vendored kill-ai-slop skill
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Licence

MIT. See `LICENSE`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and
`AI_USAGE_POLICY.md`.
