# Patchable Interface (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop build serves its interface from a writable directory on
disk, falling back to the bundle compiled into the binary, so a later stage can
replace the interface without a new executable.

**Architecture:** A `lumen://` URI scheme handler resolves each request against
`<data dir>/interface/<version>/` when a pointer names an applied version, and
against Tauri's embedded asset resolver otherwise. A version that never reports
having booted is rolled back on the next start. All filesystem decisions live in
`crates/lumen-kernel`, tested without a WebView; the host crate only wires them
to Tauri.

**Tech Stack:** Rust (Tauri 2, serde, tempfile for tests), TypeScript (React 19,
Vitest), the existing `@lumen/platform` host bridge.

**Spec:** `docs/superpowers/specs/2026-09-08-interface-patch-updates-design.md`

## Global Constraints

- Rust: `clippy -D warnings` clean; no `unwrap`/`expect` outside tests
  (`#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]` is
  already set in the host crate).
- Every command validates its path through the sandbox or through the
  interface store; no path from outside is joined without normalisation.
- TypeScript strict, `noUncheckedIndexedAccess`. No `any` without a comment.
- Tests next to code, `*.test.ts(x)` / `#[cfg(test)]`; logic without tests is
  not done.
- Conventional Commits. `pnpm check` and `pnpm deslop` green before each
  commit.
- The data directory is `dirs::data_local_dir()/LumenOS`, the same root
  `HostConfig` already uses via `APP_DIR`.
- Stage 1 adds no network code and no new Rust dependency.

---

### Task 1: The interface store — where versions live and which one is live

**Files:**
- Create: `crates/lumen-kernel/src/interface.rs`
- Modify: `crates/lumen-kernel/src/lib.rs` (add `pub mod interface;` and re-export)

**Interfaces:**
- Consumes: `KernelError`, `Result` from `crate::error`.
- Produces:
  - `pub struct InterfaceStore { root: PathBuf }`
  - `InterfaceStore::new(root: impl Into<PathBuf>) -> Self`
  - `InterfaceStore::pointer(&self) -> Result<Option<Pointer>>`
  - `InterfaceStore::write_pointer(&self, p: &Pointer) -> Result<()>`
  - `InterfaceStore::version_dir(&self, version: &str) -> PathBuf`
  - `pub struct Pointer { pub version: String, pub applied_at: u64, pub previous: Option<String> }`

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, InterfaceStore) {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = InterfaceStore::new(dir.path());
        (dir, store)
    }

    #[test]
    fn no_pointer_means_the_embedded_bundle_is_live() {
        let (_dir, store) = store();
        assert!(store.pointer().expect("read").is_none());
    }

    #[test]
    fn a_written_pointer_reads_back() {
        let (_dir, store) = store();
        let p = Pointer {
            version: "0.2.0".into(),
            applied_at: 17,
            previous: Some("0.1.0".into()),
        };
        store.write_pointer(&p).expect("write");
        assert_eq!(store.pointer().expect("read"), Some(p));
    }

    #[test]
    fn a_pointer_that_is_not_json_is_no_pointer_rather_than_an_error() {
        // A truncated write must not stop the OS from opening: the floor is
        // the embedded bundle, and unreadable state falls to the floor.
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path()).expect("mkdir");
        std::fs::write(dir.path().join("current.json"), b"{ not json").expect("write");
        assert!(store.pointer().expect("read").is_none());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p lumen-kernel interface`
Expected: FAIL — `interface` module does not exist.

- [ ] **Step 3: Write the minimal implementation**

```rust
//! Where the interface lives on disk, and which version of it is live.
//!
//! The bundle compiled into the binary is the floor: no pointer, an
//! unreadable pointer, or a pointer naming a directory that is not there all
//! mean the same thing — serve the embedded interface. Nothing here can stop
//! Lumen from opening, which is the property that makes replacing the
//! interface behind the user's back defensible at all.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{KernelError, Result};

/// The file naming the live version, written last and read first.
const POINTER: &str = "current.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pointer {
    pub version: String,
    pub applied_at: u64,
    /// The version this replaced, kept so a rollback has somewhere to go.
    pub previous: Option<String>,
}

#[derive(Debug, Clone)]
pub struct InterfaceStore {
    root: PathBuf,
}

impl InterfaceStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn version_dir(&self, version: &str) -> PathBuf {
        self.root.join(version)
    }

    /// The live version, or `None` for the embedded bundle. Anything that
    /// cannot be read as a pointer is `None`: see the module comment.
    pub fn pointer(&self) -> Result<Option<Pointer>> {
        let path = self.root.join(POINTER);
        match std::fs::read(&path) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(KernelError::io(&e, Some(&path.display().to_string()))),
        }
    }

    pub fn write_pointer(&self, pointer: &Pointer) -> Result<()> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| KernelError::io(&e, Some(&self.root.display().to_string())))?;
        let path = self.root.join(POINTER);
        let body = serde_json::to_vec_pretty(pointer)
            .map_err(|e| KernelError::host(format!("cannot serialise the pointer: {e}")))?;
        std::fs::write(&path, body)
            .map_err(|e| KernelError::io(&e, Some(&path.display().to_string())))
    }
}
```

Add to `crates/lumen-kernel/src/lib.rs`, beside the existing modules:

```rust
pub mod interface;
pub use interface::{InterfaceStore, Pointer};
```

Add to `crates/lumen-kernel/Cargo.toml` under `[dev-dependencies]`:

```toml
tempfile = { workspace = true }
```

- [ ] **Step 4: Run the tests**

Run: `cargo test -p lumen-kernel interface`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add crates/lumen-kernel/src/interface.rs crates/lumen-kernel/src/lib.rs crates/lumen-kernel/Cargo.toml Cargo.toml
git commit -m "feat(kernel): the interface has a place on disk and a pointer to the live one"
```

---

### Task 2: Resolving a request inside a version, and refusing one that escapes

**Files:**
- Modify: `crates/lumen-kernel/src/interface.rs`

**Interfaces:**
- Consumes: `InterfaceStore`, `Pointer` from Task 1.
- Produces: `InterfaceStore::resolve(&self, version: &str, request: &str) -> Option<PathBuf>`

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn resolves_a_file_inside_the_version() {
        let (dir, store) = store();
        let v = dir.path().join("0.2.0/assets");
        std::fs::create_dir_all(&v).expect("mkdir");
        std::fs::write(v.join("app.js"), b"x").expect("write");
        assert_eq!(
            store.resolve("0.2.0", "/assets/app.js"),
            Some(dir.path().join("0.2.0").join("assets").join("app.js"))
        );
    }

    #[test]
    fn refuses_a_request_that_climbs_out_of_the_version() {
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.2.0")).expect("mkdir");
        std::fs::write(dir.path().join("secret"), b"x").expect("write");
        for request in [
            "/../secret",
            "/assets/../../secret",
            "../secret",
            "/..%2Fsecret",
            "//other/secret",
        ] {
            assert_eq!(store.resolve("0.2.0", request), None, "{request}");
        }
    }

    #[test]
    fn a_file_that_is_not_there_resolves_to_nothing() {
        let (_dir, store) = store();
        assert_eq!(store.resolve("0.2.0", "/index.html"), None);
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p lumen-kernel interface`
Expected: FAIL — `resolve` not found.

- [ ] **Step 3: Write the minimal implementation**

```rust
    /// The file a request names inside one version, or `None` when there is
    /// no such file or the request tries to leave the directory.
    ///
    /// The check is on the resolved path rather than on the text of the
    /// request: a rule written against `..` alone is a rule against one
    /// spelling of the problem.
    pub fn resolve(&self, version: &str, request: &str) -> Option<PathBuf> {
        let decoded = percent_decode(request);
        let base = self.version_dir(version).canonicalize().ok()?;
        let mut path = base.clone();
        for part in decoded.split(['/', '\\']) {
            if part.is_empty() || part == "." {
                continue;
            }
            path.push(part);
        }
        let full = path.canonicalize().ok()?;
        if !full.starts_with(&base) {
            return None;
        }
        full.is_file().then_some(full)
    }
```

with, beside it:

```rust
/// `%2F` and friends, decoded before the path is walked, because a request
/// arrives percent-encoded and `..` written as `%2E%2E` is still `..`.
fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&raw[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
```

- [ ] **Step 4: Run the tests**

Run: `cargo test -p lumen-kernel interface`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add crates/lumen-kernel/src/interface.rs
git commit -m "feat(kernel): a request resolves inside its version or not at all"
```

---

### Task 3: A version that never reported, and the rollback that follows

**Files:**
- Modify: `crates/lumen-kernel/src/interface.rs`

**Interfaces:**
- Consumes: `InterfaceStore`, `Pointer`.
- Produces:
  - `InterfaceStore::mark_booted(&self, version: &str) -> Result<()>`
  - `InterfaceStore::has_booted(&self, version: &str) -> bool`
  - `InterfaceStore::settle(&self) -> Result<Option<String>>` — called once at
    start; returns the version rolled back *from*, if any.

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn a_version_that_reported_once_is_trusted_from_then_on() {
        let (_dir, store) = store();
        assert!(!store.has_booted("0.2.0"));
        store.mark_booted("0.2.0").expect("mark");
        assert!(store.has_booted("0.2.0"));
    }

    #[test]
    fn settle_reverts_to_the_previous_version_when_the_live_one_never_reported() {
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.1.0")).expect("mkdir");
        store
            .write_pointer(&Pointer {
                version: "0.2.0".into(),
                applied_at: 1,
                previous: Some("0.1.0".into()),
            })
            .expect("write");

        assert_eq!(store.settle().expect("settle"), Some("0.2.0".into()));
        let now = store.pointer().expect("read").expect("pointer");
        assert_eq!(now.version, "0.1.0");
        assert_eq!(now.previous, None);
    }

    #[test]
    fn settle_leaves_a_version_that_has_booted_alone() {
        let (_dir, store) = store();
        store
            .write_pointer(&Pointer { version: "0.2.0".into(), applied_at: 1, previous: None })
            .expect("write");
        store.mark_booted("0.2.0").expect("mark");
        assert_eq!(store.settle().expect("settle"), None);
        assert_eq!(store.pointer().expect("read").expect("p").version, "0.2.0");
    }

    #[test]
    fn settle_falls_to_the_embedded_bundle_when_there_is_nothing_to_revert_to() {
        let (_dir, store) = store();
        store
            .write_pointer(&Pointer { version: "0.2.0".into(), applied_at: 1, previous: None })
            .expect("write");
        assert_eq!(store.settle().expect("settle"), Some("0.2.0".into()));
        assert!(store.pointer().expect("read").is_none());
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p lumen-kernel interface`
Expected: FAIL — `mark_booted` not found.

- [ ] **Step 3: Write the minimal implementation**

```rust
    /// A marker file per version, rather than a field in the pointer: the
    /// pointer is rewritten by a rollback, and the fact that a version once
    /// worked must survive that.
    fn booted_marker(&self, version: &str) -> PathBuf {
        self.root.join(format!(".booted-{version}"))
    }

    pub fn has_booted(&self, version: &str) -> bool {
        self.booted_marker(version).is_file()
    }

    pub fn mark_booted(&self, version: &str) -> Result<()> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| KernelError::io(&e, Some(&self.root.display().to_string())))?;
        let path = self.booted_marker(version);
        std::fs::write(&path, b"")
            .map_err(|e| KernelError::io(&e, Some(&path.display().to_string())))
    }

    /// Called once at start, before anything is served. A live version that
    /// has never reported reaching the interface is assumed not to work, and
    /// the pointer goes back to what it replaced — or away entirely, which
    /// serves the embedded bundle.
    pub fn settle(&self) -> Result<Option<String>> {
        let Some(pointer) = self.pointer()? else { return Ok(None) };
        if self.has_booted(&pointer.version) {
            return Ok(None);
        }
        match &pointer.previous {
            Some(previous) if self.version_dir(previous).is_dir() => {
                self.write_pointer(&Pointer {
                    version: previous.clone(),
                    applied_at: pointer.applied_at,
                    previous: None,
                })?;
            }
            _ => {
                let path = self.root.join(POINTER);
                if let Err(e) = std::fs::remove_file(&path) {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        return Err(KernelError::io(&e, Some(&path.display().to_string())));
                    }
                }
            }
        }
        Ok(Some(pointer.version))
    }
```

- [ ] **Step 4: Run the tests**

Run: `cargo test -p lumen-kernel interface`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add crates/lumen-kernel/src/interface.rs
git commit -m "feat(kernel): an interface that never reports is rolled back on the next start"
```

---

### Task 4: The host serves `lumen://` from the store, or from the binary

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/commands/interface.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (window `url`)

**Interfaces:**
- Consumes: `InterfaceStore`, `Pointer`, `settle`, `resolve`, `mark_booted`.
- Produces:
  - Tauri commands `interface_state() -> InterfaceState`,
    `interface_ready() -> ()`, `interface_roll_back() -> InterfaceState`
  - `pub struct InterfaceState { pub version: Option<String>, pub host: String,
    pub previous: Option<String>, pub rolled_back_from: Option<String> }`

- [ ] **Step 1: Write the failing test**

```rust
// apps/desktop/src-tauri/src/commands/interface.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_state_names_the_embedded_bundle_when_no_patch_is_applied() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = lumen_kernel::InterfaceStore::new(dir.path());
        let state = state_of(&store, None);
        assert_eq!(state.version, None);
        assert_eq!(state.host, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn the_state_names_the_applied_version_and_what_it_replaced() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = lumen_kernel::InterfaceStore::new(dir.path());
        store
            .write_pointer(&lumen_kernel::Pointer {
                version: "0.2.0".into(),
                applied_at: 1,
                previous: Some("0.1.0".into()),
            })
            .expect("write");
        let state = state_of(&store, Some("0.3.0".into()));
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        assert_eq!(state.previous.as_deref(), Some("0.1.0"));
        assert_eq!(state.rolled_back_from.as_deref(), Some("0.3.0"));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test -p lumen-desktop interface`
Expected: FAIL — module `interface` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`apps/desktop/src-tauri/src/commands/interface.rs`:

```rust
//! `interface_*` commands, and the state the front end reads to say which
//! interface it is.

use std::sync::Mutex;

use lumen_kernel::{InterfaceStore, KernelError};
use serde::Serialize;
use tauri::State;

use crate::lock;

/// What was rolled back at start, if anything. Held for the session so the
/// interface can say so once it is up.
pub struct RolledBack(pub Mutex<Option<String>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceState {
    /// The applied version, or `None` for the bundle inside the binary.
    pub version: Option<String>,
    /// The host binary's version, which no patch can change.
    pub host: String,
    pub previous: Option<String>,
    pub rolled_back_from: Option<String>,
}

pub fn state_of(store: &InterfaceStore, rolled_back_from: Option<String>) -> InterfaceState {
    let pointer = store.pointer().ok().flatten();
    InterfaceState {
        version: pointer.as_ref().map(|p| p.version.clone()),
        host: env!("CARGO_PKG_VERSION").to_owned(),
        previous: pointer.and_then(|p| p.previous),
        rolled_back_from,
    }
}

type Store<'a> = State<'a, Mutex<InterfaceStore>>;

#[tauri::command]
pub async fn interface_state(
    store: Store<'_>,
    rolled: State<'_, RolledBack>,
) -> Result<InterfaceState, KernelError> {
    let from = lock(&rolled.0)?.clone();
    Ok(state_of(&lock(&store)?, from))
}

/// The interface reporting that it mounted. Until this arrives, the version
/// is on probation and the next start will revert it.
#[tauri::command]
pub async fn interface_ready(store: Store<'_>) -> Result<(), KernelError> {
    let store = lock(&store)?;
    let Some(pointer) = store.pointer()? else { return Ok(()) };
    store.mark_booted(&pointer.version)
}
```

In `commands/mod.rs`, add `pub mod interface;`.

In `lib.rs`, inside `setup`, after the sandbox is opened:

```rust
            let store = InterfaceStore::new(lumen_kernel::interface_dir());
            let rolled_back = store.settle().unwrap_or(None);
            app.manage(commands::interface::RolledBack(Mutex::new(rolled_back)));
            app.manage(Mutex::new(store));
```

and add `commands::interface::interface_state`, `commands::interface::interface_ready`
to `generate_handler!`.

Add to `crates/lumen-kernel/src/interface.rs`:

```rust
/// `<local data dir>/LumenOS/interface`, beside the host configuration.
pub fn interface_dir() -> PathBuf {
    crate::config::default_home_dir()
        .parent()
        .map(|d| d.join("interface"))
        .unwrap_or_else(|| PathBuf::from("interface"))
}
```

re-exported from `lib.rs` as `pub use interface::{interface_dir, InterfaceStore, Pointer};`.

- [ ] **Step 4: Run the tests**

Run: `cargo test -p lumen-desktop interface`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the scheme and point the window at it**

In `lib.rs`, on the builder, before `.setup`:

```rust
        .register_uri_scheme_protocol("lumen", |ctx, request| {
            interface_response(ctx.app_handle(), request)
        })
```

with, in `commands/interface.rs`:

```rust
/// Serve one request: the applied version first, the bundle in the binary
/// second. A path that is not in either is a 404 rather than a panic.
pub fn interface_response<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let path = request.uri().path().to_owned();
    let path = if path == "/" { "/index.html".to_owned() } else { path };

    let patched = app
        .try_state::<Mutex<InterfaceStore>>()
        .and_then(|store| {
            let store = store.lock().ok()?;
            let pointer = store.pointer().ok().flatten()?;
            let file = store.resolve(&pointer.version, &path)?;
            let body = std::fs::read(&file).ok()?;
            Some((body, mime_for(&path)))
        });

    let (body, mime) = match patched {
        Some(found) => found,
        None => match app.asset_resolver().get(path.clone()) {
            Some(asset) => (asset.bytes, asset.mime_type.unwrap_or_else(|| mime_for(&path))),
            None => {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap_or_default()
            }
        },
    };

    tauri::http::Response::builder()
        .header("Content-Type", mime)
        .body(body)
        .unwrap_or_default()
}

fn mime_for(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
    .to_owned()
}
```

In `tauri.conf.json`, give the main window `"url": "lumen://localhost/index.html"`.

- [ ] **Step 6: Prove it in the running application**

```bash
pnpm build:desktop
./target/release/lumen-desktop.exe
```

Expected: the desktop opens on the embedded bundle. Then copy
`apps/desktop/dist` to `%LOCALAPPDATA%\LumenOS\interface\0.9.9\`, write
`current.json` naming `0.9.9`, start again, and confirm from Settings that the
interface version reads `0.9.9`. Delete the marker file and start once more:
it must come back on the embedded bundle and say it rolled back.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri crates/lumen-kernel/src
git commit -m "feat(desktop): the interface is served from disk, with the binary's copy as the floor"
```

---

### Task 5: The platform bridge learns about the interface

**Files:**
- Modify: `packages/platform/src/types.ts`
- Modify: `packages/platform/src/tauri.ts`
- Modify: `packages/platform/src/web.ts`
- Test: `packages/platform/src/web.test.ts`

**Interfaces:**
- Consumes: the Tauri commands from Task 4.
- Produces, on `Platform`:

```ts
  interface: {
    /** Which interface is running, and which binary is under it. */
    state(): Promise<InterfaceState>;
    /** Report that the interface mounted; until this, it is on probation. */
    ready(): Promise<void>;
  };
```

with

```ts
export interface InterfaceState {
  /** The applied version, or null when the one inside the binary is live. */
  version: string | null;
  /** The host binary's version. No patch can change this. */
  host: string;
  previous: string | null;
  /** Set when the last start reverted a version that never reported. */
  rolledBackFrom: string | null;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/platform/src/web.test.ts
it('reports the interface it is running, and that it cannot be patched', async () => {
  const platform = createWebPlatform();
  const state = await platform.interface.state();
  expect(state.version).toBeNull();
  expect(state.rolledBackFrom).toBeNull();
  // The web build is current whenever the page loads, so `ready` is a no-op
  // rather than a call into a host that is not there.
  await expect(platform.interface.ready()).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @lumen/platform exec vitest run src/web.test.ts`
Expected: FAIL — `platform.interface` is undefined.

- [ ] **Step 3: Write the minimal implementation**

In `web.ts`:

```ts
  interface: {
    // Served fresh by whoever is hosting it, so the version it is running is
    // the version there is, and there is nothing to report or roll back.
    state: async () => ({
      version: null,
      host: __APP_VERSION__,
      previous: null,
      rolledBackFrom: null,
    }),
    ready: async () => {},
  },
```

In `tauri.ts`:

```ts
  interface: {
    state: () => invoke<InterfaceState>('interface_state'),
    ready: () => invoke<void>('interface_ready'),
  },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @lumen/platform exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src
git commit -m "feat(platform): the host says which interface is running"
```

---

### Task 6: The shell reports that the interface mounted

**Files:**
- Modify: `packages/shell/src/LumenOS.tsx`
- Test: `packages/shell/src/LumenOS.test.tsx`

**Interfaces:**
- Consumes: `platform.interface.ready()`.
- Produces: nothing new; this is the call that ends a version's probation.

- [ ] **Step 1: Write the failing test**

```tsx
it('tells the host the interface mounted, so the version is not rolled back', async () => {
  const ready = vi.fn(async () => {});
  renderOS({ interface: { state: async () => embedded, ready } });
  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @lumen/shell exec vitest run src/LumenOS.test.tsx`
Expected: FAIL — `ready` never called.

- [ ] **Step 3: Write the minimal implementation**

In `LumenOS.tsx`, after the shell has mounted and the desktop is on screen:

```tsx
  // The interface saying it got this far. A version that never reaches this
  // line is reverted on the next start, so it belongs after the first paint
  // rather than beside the imports.
  useEffect(() => {
    void platform.interface.ready();
  }, [platform]);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @lumen/shell exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src
git commit -m "feat(shell): the interface reports that it came up"
```

---

### Task 7: Settings shows which interface is running

**Files:**
- Create: `packages/apps/src/settings/pages/Updates.tsx`
- Create: `packages/apps/src/settings/pages/Updates.test.tsx`
- Modify: `packages/apps/src/settings/sections.ts` (a row for the search index)
- Modify: `packages/apps/src/settings/pages/index.ts` (register the page)

**Interfaces:**
- Consumes: `platform.interface.state()`.
- Produces: the screen Stage 2 fills in with checking, progress and buttons.

- [ ] **Step 1: Write the failing test**

```tsx
it('names the interface and the binary separately, because a patch moves only one', async () => {
  render(<UpdatesPage state={{ version: '0.2.0', host: '0.1.0', previous: '0.1.0', rolledBackFrom: null }} />);
  expect(await screen.findByText('0.2.0')).toBeInTheDocument();
  expect(screen.getByText('0.1.0')).toBeInTheDocument();
});

it('says when the last start had to go back', async () => {
  render(<UpdatesPage state={{ version: '0.1.0', host: '0.1.0', previous: null, rolledBackFrom: '0.2.0' }} />);
  expect(
    await screen.findByText(/0\.2\.0 did not start, so Lumen went back to 0\.1\.0/),
  ).toBeInTheDocument();
});

it('says plainly that the web build has nothing to update', async () => {
  render(<UpdatesPage state={{ version: null, host: '0.1.0', previous: null, rolledBackFrom: null }} web />);
  expect(await screen.findByText(/updates when the page is reloaded/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @lumen/apps exec vitest run src/settings/pages/Updates.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Follow the shape of the neighbouring pages in `packages/apps/src/settings/pages/`
(a `Section` per group, `Row` per line, values in the mono face per design rule
1). The page shows: Interface version, System version, and — when
`rolledBackFrom` is set — one sentence naming what happened. On the web build
it shows the one sentence and nothing else.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @lumen/apps exec vitest run src/settings`
Expected: PASS.

- [ ] **Step 5: Check the design rules**

Run: `pnpm deslop`
Expected: no new signals.

- [ ] **Step 6: Commit**

```bash
git add packages/apps/src/settings
git commit -m "feat(apps): Settings says which interface is running and which binary is under it"
```

---

### Task 8: The whole check, and the desktop opening on the served interface

- [ ] **Step 1: Run everything**

```bash
pnpm check
pnpm deslop
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Expected: green.

- [ ] **Step 2: Build and open the desktop once more**

```bash
pnpm build:desktop
```

Expected: the application opens on `lumen://`, Settings names the embedded
interface, and the version applied by hand in Task 4 still comes up when its
pointer is restored.

- [ ] **Step 3: Commit anything the checks changed**

```bash
git commit -am "chore: the checks after the patchable interface"
```

---

## Stage 2

The manifest, signature verification, the background download with progress,
the notification with its buttons and the release workflow get their own plan
once this one has landed: they are only worth writing against a resolver that
is already in place and already rolls back.
