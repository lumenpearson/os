//! `interface_*` commands, and the scheme that serves the interface itself.
//!
//! Lumen's interface is a web bundle. The copy compiled into this binary is
//! the floor; a bundle applied under the data directory takes precedence when
//! there is one, which is what lets the interface be replaced without
//! replacing the executable.
//!
//! Every decision here — which version is live, whether a path stays inside
//! it, whether a version that never reported should be given up — is made in
//! `lumen_kernel::interface`, where it is tested without a WebView. What is
//! left in this file is the wiring: a request in, bytes out.

use std::sync::Mutex;

use lumen_kernel::{InterfaceState, InterfaceStore, KernelError};
use tauri::{Manager, State};

use crate::lock;

/// The version given up at start, if any. Held for the session so the
/// interface can say what happened once it is up to say it.
pub struct RolledBack(pub Mutex<Option<String>>);

/// The binary's own version, which no patch can move.
pub const HOST_VERSION: &str = env!("CARGO_PKG_VERSION");

type Store<'a> = State<'a, Mutex<InterfaceStore>>;

#[tauri::command]
pub async fn interface_state(
    store: Store<'_>,
    rolled: State<'_, RolledBack>,
) -> Result<InterfaceState, KernelError> {
    let from = lock(&rolled.0)?.clone();
    Ok(lock(&store)?.state(HOST_VERSION, from))
}

/// The interface reporting that it drew itself. Until this arrives the live
/// version is on probation, and the next start would give it up.
#[tauri::command]
pub async fn interface_ready(store: Store<'_>) -> Result<(), KernelError> {
    let store = lock(&store)?;
    let Some(pointer) = store.pointer()? else {
        // The bundle inside the binary needs no probation: it shipped with
        // the executable and there is nothing to fall back to.
        return Ok(());
    };
    store.mark_booted(&pointer.version)
}

/// One media type per extension, because the interface is a fixed set of file
/// kinds and a lookup table is the whole of what is needed. Anything else is
/// served as bytes rather than guessed at.
fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "wasm" => "application/wasm",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// The applied bundle first, the one inside the binary second, a 404 third.
///
/// Nothing here may panic: a request for a path that is in neither place is
/// an ordinary miss, and the window is already open by the time it arrives.
pub fn respond<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let raw = request.uri().path();
    let path = if raw.is_empty() || raw == "/" {
        "/index.html"
    } else {
        raw
    };

    let patched = app.try_state::<Mutex<InterfaceStore>>().and_then(|store| {
        let store = store.lock().ok()?;
        let pointer = store.pointer().ok().flatten()?;
        let file = store.resolve(&pointer.version, path)?;
        std::fs::read(&file).ok()
    });

    let body = match patched {
        Some(bytes) => Some(bytes),
        None => app
            .asset_resolver()
            .get(path.to_owned())
            .map(|asset| asset.bytes),
    };

    let build = tauri::http::Response::builder();
    match body {
        Some(bytes) => build
            .header("Content-Type", mime_for(path))
            // The interface is served from disk on every start, and a cached
            // copy of a version that has since been rolled back is exactly
            // the state this must never get into.
            .header("Cache-Control", "no-store")
            .body(bytes),
        None => build.status(404).body(Vec::new()),
    }
    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}
