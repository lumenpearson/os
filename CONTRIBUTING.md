# Contributing to Lumen OS

Thanks for taking the time. This guide covers the tooling, the layout, and the
conventions the repository enforces.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22+ | `.nvmrc` pins 22 |
| pnpm | 10+ | `corepack enable` installs the pinned version |
| Rust | stable (1.85+) | `rustup` with `rustfmt` and `clippy` |
| Tauri prerequisites | per platform | <https://v2.tauri.app/start/prerequisites/> — on Windows: WebView2 (preinstalled on Windows 11) + MSVC build tools |

## Getting started

```bash
pnpm install          # installs JS deps and git hooks
pnpm dev:web          # OS in the browser at http://localhost:5173
pnpm dev:landing      # landing page at http://localhost:5174
pnpm dev:desktop      # Tauri window (needs Rust + platform prerequisites)
```

`pnpm check` runs lint, typecheck, unit tests, and builds for every package.
`cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`
cover the Rust side.

## Repository layout

```
apps/
  desktop/    Tauri 2 host (src-tauri/ is the Rust binary)
  web/        Vite SPA build of the OS (deployed to Vercel)
  landing/    Marketing / documentation site with a three.js hero (Vercel)
packages/
  tokens/     Design tokens: colours, type scale, spacing, motion, Tailwind theme
  ui/         Atomic component library: atoms → molecules → organisms → templates
  platform/   Host bridge: one interface, web and Tauri implementations
  vfs/        Virtual file system, path utilities, adapters
  kernel/     Processes, windows, app registry, settings, events, notifications
  apps/       Built-in applications, one folder per app
  shell/      The desktop environment itself (boot, lock, desktop, menubar…)
  config/     Shared tsconfig, vitest, tailwind presets
crates/
  lumen-kernel/  Rust: sandboxed file system, system info, config
```

The rule of dependency direction: `tokens ← ui ← kernel ← apps ← shell ← apps/*`.
`platform` and `vfs` sit under `kernel`. Nothing imports upward.

## Component hierarchy

`packages/ui` follows atomic design:

- **atoms** — a button, an input, an icon, a divider. No business logic, no
  kernel imports.
- **molecules** — small compositions: a search field, a menu item with a
  shortcut, a toolbar group.
- **organisms** — self-contained regions: a sidebar, a toolbar, a dialog.
- **templates** — page-level skeletons an app fills in (a two-pane layout, a
  settings page).

Apps and the shell compose these; they do not restyle them ad hoc.

## Conventions

- **Commits** follow Conventional Commits. `commitlint` runs on `commit-msg`.
  Scopes: `kernel vfs shell apps ui tokens platform desktop web landing rust ci docs deps release tooling`.
- **Formatting and linting** are Biome (`pnpm lint:fix`) and `rustfmt`/`clippy`.
  `lint-staged` runs on `pre-commit`.
- **Tests** live next to the code as `*.test.ts(x)` and run with Vitest.
  Anything with logic (path resolution, formula evaluation, the terminal
  parser, window snapping) needs a test.
- **Design** follows `CLAUDE.md` → "Design rules" and is checked with
  `pnpm deslop`.
- **Accessibility**: every interactive element is keyboard reachable, has a
  visible focus ring, and respects `prefers-reduced-motion`.

## Adding an app

1. Create `packages/apps/src/<app-id>/` with `index.ts` exporting an
   `AppDefinition` (see `packages/kernel/src/apps/types.ts`).
2. Register it in `packages/apps/src/registry.ts`.
3. Add a 24px and 64px icon to `packages/apps/src/<app-id>/icon.tsx`.
4. If the app opens files, declare `fileAssociations`.
5. Add tests for any non-trivial logic.

## Pull requests

- Open as a draft until CI is green.
- Fill in the template. Screenshots or a short recording for anything visual.
- One concern per pull request. Refactors travel separately from features.
