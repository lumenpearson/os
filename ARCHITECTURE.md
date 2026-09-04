# Architecture

Lumen OS is a desktop environment written in TypeScript and React 19. The same
code runs in a browser tab and inside a Tauri 2 window on Windows. This
document explains the layers, the data flow, and the reasons behind the main
decisions.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ apps/desktop (Tauri)          apps/web (Vite SPA)           │  hosts
├──────────────────────────────────────────────────────────────┤
│ packages/shell   boot · OOBE · lock · desktop · menubar ·    │  desktop
│                  taskbar · start · windows · cursor · …      │  environment
├──────────────────────────────────────────────────────────────┤
│ packages/apps    files · settings · terminal · office · …    │  programs
├──────────────────────────────────────────────────────────────┤
│ packages/kernel  processes · windows · registry · settings · │  core
│                  events · notifications · clipboard · users  │
├───────────────────────┬──────────────────────────────────────┤
│ packages/vfs          │ packages/platform                    │  I/O
│ paths · adapters      │ web (OPFS/IDB) · tauri (invoke)      │
├───────────────────────┴──────────────────────────────────────┤
│ packages/ui (atoms → molecules → organisms → templates)      │  presentation
│ packages/tokens (colour, type, space, motion)                │
└──────────────────────────────────────────────────────────────┘
                                │ tauri commands
┌──────────────────────────────────────────────────────────────┐
│ crates/lumen-kernel (Rust)  sandboxed fs · sysinfo · config  │  native
└──────────────────────────────────────────────────────────────┘
```

## Kernel

The kernel is a set of Zustand stores plus a typed event bus. It has no DOM
dependency and is fully unit-tested.

- **Process table.** Launching an app creates a process (`pid`, `appId`,
  `startedAt`, `args`). Killing a process closes its windows and fires
  `process:exit`. The Task Manager reads this table.
- **Window manager.** Windows belong to processes. State: bounds, z-order,
  minimised/maximised/fullscreen, snap side, focus. Operations are pure
  functions on the store; the shell renders them. Bounds are clamped to the
  work area on every viewport change so the system survives any resolution.
- **App registry.** Built-in apps register an `AppDefinition` (id, name,
  icon, `component`, default window size, file associations, menus). User
  pseudo-programs are `.app` JSON manifests in `/Applications` that either
  alias a built-in app or embed an HTML document rendered in a sandboxed
  iframe.
- **Settings.** A single typed settings object persisted to
  `/System/settings.json`. Appearance, desktop, lock screen, display scale,
  accessibility, region.
- **Users and lock screen.** One local user with a password hashed with
  PBKDF2-SHA256 (Web Crypto) and a recovery key shown once at setup. The
  recovery flow verifies the key and lets the user set a new password, or
  wipes the home directory to factory state.
- **Notifications, clipboard, session log.** Small stores; every app can post
  a notification, and the Console app tails the session log.

## Virtual file system

`packages/vfs` defines `VfsAdapter` (`stat`, `readDir`, `readFile`,
`writeFile`, `mkdir`, `remove`, `rename`, `copy`) and path helpers. Two
adapters ship:

- **OPFS** for the web build (falls back to IndexedDB when OPFS is not
  available, e.g. Firefox private windows).
- **Tauri** for the desktop build: every call is a `invoke` into the Rust
  crate, which resolves the path inside the configured home directory and
  refuses anything that escapes it.

On first boot the kernel seeds `/Users/<name>` (Desktop, Documents, Downloads,
Pictures, Music), `/Applications`, `/System`, and `/Trash`.

## Shell

The shell is a state machine: `boot → setup | lock → desktop → (sleep | lock |
shutdown)`. Screens are lazy-loaded. The desktop layer holds the wallpaper,
icons, the top menubar (global menu + status items), the taskbar with the
Start menu, the window layer, and overlays (Spotlight, Control Center,
Notification Center, Mission Control, the custom cursor, the screensaver).

The custom cursor hides the native cursor on the OS root and draws its own,
following the pointer with `requestAnimationFrame` and switching shape based
on the element under the pointer (`data-cursor` attributes and computed
`cursor` styles). It steps aside when the pointer leaves the window.

## Hosts

- **apps/web** builds the shell with Vite and deploys as a static SPA. A
  service worker caches assets so the OS opens offline after the first visit.
- **apps/desktop** wraps the same bundle in a Tauri window without native
  decorations. The Rust side exposes: `fs_*` commands over the sandbox,
  `system_info`, `system_processes`, `config_get/set`, and window helpers.
  The home directory defaults to `%LOCALAPPDATA%\LumenOS\home` on Windows and
  can be moved from Settings → Storage.

## Why these choices

- **Zustand over Redux/Context.** Window dragging updates at 60–120 Hz; store
  selectors keep re-renders scoped to the window being dragged.
- **Tailwind 4 with CSS tokens.** One `@theme` in `packages/tokens` feeds both
  the utility classes and plain CSS. The theme is the single source of truth
  for colour, radius, and motion, which is what keeps the system visually
  consistent.
- **Vite for every app, no SSR.** The OS is a client application; the
  landing page has nothing to render on a server. One build tool, one config.
- **A Rust crate separate from the Tauri binary.** `lumen-kernel` compiles and
  tests on Linux CI without a WebView; the Tauri binary only wires commands.
