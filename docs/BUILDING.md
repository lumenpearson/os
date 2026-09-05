# Building Lumen OS

Three things can be built from this repository: the browser build, the landing
site, and the desktop application. The first two need only Node; the third
needs a Rust toolchain and each platform's own webview development files.

```bash
pnpm install          # once, for anything below
pnpm dev:web          # http://localhost:5173
pnpm dev:landing      # http://localhost:5174
pnpm check            # lint, typecheck, test, build across the workspace
```

## The desktop application

The desktop build wraps the same front end in a Tauri 2 window and gives it a
real file system through the Rust crate in `crates/lumen-kernel`.

```bash
pnpm dev:desktop      # a dev window against the Vite server
pnpm build:desktop    # bundles for whichever platform you are on
```

Tauri builds for the host it runs on. There is no cross-compiling here: a
Windows installer is produced on Windows, a `.dmg` on macOS, and the Linux
packages on Linux. The CI matrix in `.github/workflows/desktop.yml` is what
produces all three, and a tag matching `v*` attaches them to a release.

### What each platform produces

| Platform | Bundles | Notes |
| --- | --- | --- |
| Windows | `.exe` (NSIS), `.msi` | Installs per user. The WebView2 runtime is fetched by the installer if it is missing. |
| macOS | `.app`, `.dmg` | Minimum system version 10.15. Unsigned — see below. |
| Linux | `.deb`, `.rpm`, `.AppImage` | The AppImage is the portable one. |

### Prerequisites

**All platforms** — Node from `.nvmrc`, pnpm, and a stable Rust toolchain
(`rustup toolchain install stable`).

**Windows** — the Microsoft C++ build tools, and the WebView2 runtime (already
present on Windows 11 and on updated Windows 10).

**macOS** — the Xcode command line tools (`xcode-select --install`).

**Linux** — the WebKitGTK development files and their friends. On Debian and
Ubuntu:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

On Fedora the equivalents are `webkit2gtk4.1-devel`, `openssl-devel`,
`libappindicator-gtk3-devel`, `librsvg2-devel` and `@development-tools`.

## How far "runs on Linux" actually goes

The AppImage is the widely portable build, and it is worth being precise about
what that means rather than claiming every distribution.

An AppImage bundles the application and its libraries but still links against
the host's glibc, and glibc is only forward compatible. A binary built against
a given version runs on that version and newer, never older. CI builds on
**Ubuntu 22.04, which is glibc 2.35**, so the AppImage runs on distributions
shipping glibc 2.35 or later — Ubuntu 22.04+, Debian 12+, Fedora 36+, and
current rolling releases. It will not start on anything older, and the error
when it fails that way names the glibc version.

The runner is pinned to 22.04 for exactly this reason. Moving it to
`ubuntu-latest` would silently raise the floor and drop older distributions
without anything failing in CI.

Beyond glibc, the app needs WebKitGTK 4.1 at runtime. The `.deb` and `.rpm`
declare it as a dependency so the package manager installs it; the AppImage
expects it to be present already, which it is on any desktop system with a
current GNOME or a browser that uses it.

## Signing

None of the bundles are signed. In practice:

- **macOS** will refuse to open the app on first launch. Right-click the app
  and choose Open, or clear the quarantine attribute with
  `xattr -dr com.apple.quarantine "/Applications/Lumen OS.app"`.
- **Windows** shows a SmartScreen warning until the download builds reputation.

Signing needs certificates that belong to whoever publishes a build, so the
workflow deliberately does not carry any. Tauri reads its signing configuration
from environment variables, so adding them to the release job is all that is
required once certificates exist.

## Where the desktop build keeps its data

The Rust side stores its configuration as JSON under the platform's config
directory — `%APPDATA%\LumenOS\config.json` on Windows,
`~/Library/Application Support/LumenOS/` on macOS, `~/.config/LumenOS/` on
Linux — and the file system the OS presents lives in a single folder, by
default under the platform's local data directory.

That folder is configurable: Settings → Storage shows where it is and can move
it. Everything the OS writes stays inside it, and every path a command receives
is resolved against it before any file is touched, so a path that would escape
the folder — through `..`, through a symlink, or through a junction — is
refused rather than followed.
