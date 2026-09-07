//! Where the interface lives on disk, and which version of it is live.
//!
//! Lumen's interface is a web bundle, and the copy compiled into the binary is
//! the floor: no pointer, an unreadable pointer, or a pointer naming a
//! directory that is not there all mean the same thing — serve the embedded
//! interface. Nothing in this file can stop Lumen from opening, which is the
//! property that makes replacing the interface behind the user's back
//! defensible at all.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::APP_DIR;
use crate::error::{KernelError, Result};

/// The file naming the live version. Written last when a version is applied,
/// read first when one is served.
const POINTER: &str = "current.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pointer {
    pub version: String,
    pub applied_at: u64,
    /// The version this replaced, kept so a rollback has somewhere to go.
    pub previous: Option<String>,
}

/// `<local data dir>/LumenOS/interface`, beside the host configuration.
pub fn interface_dir() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .map(|d| d.join(APP_DIR).join("interface"))
        .unwrap_or_else(|| PathBuf::from(APP_DIR).join("interface"))
}

/// One hex digit, or nothing.
fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// A request arrives percent-encoded, and it is decoded before the path is
/// walked rather than after: `%2e%2e` is `..`, and a guard that runs on the
/// undecoded text is a guard against the spelling it happened to see.
///
/// Done over bytes rather than over the string, because a `%` may be followed
/// by the middle of a multi-byte character and slicing a `str` there panics.
fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        let decoded = (bytes[at] == b'%' && at + 2 < bytes.len())
            .then(|| {
                let high = from_hex(bytes[at + 1])?;
                let low = from_hex(bytes[at + 2])?;
                Some(high * 16 + low)
            })
            .flatten();
        match decoded {
            Some(byte) => {
                out.push(byte);
                at += 3;
            }
            None => {
                out.push(bytes[at]);
                at += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
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

    /// The live version, or `None` for the bundle inside the binary. Anything
    /// that cannot be read as a pointer is `None`: see the module comment.
    pub fn pointer(&self) -> Result<Option<Pointer>> {
        let path = self.root.join(POINTER);
        match std::fs::read(&path) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(KernelError::io(&e, Some(&path.display().to_string()))),
        }
    }

    /// The file a request names inside one version, or `None` when there is
    /// no such file or the request tries to leave the directory.
    ///
    /// The check is on the resolved path rather than on the text of the
    /// request. A rule written against `..` is a rule against one spelling of
    /// the problem: the request arrives percent-encoded, so `%2e%2e` is the
    /// same climb wearing a different coat, and on Windows the separator can
    /// be a backslash. Resolving first and asking afterwards whether the
    /// answer is still inside the directory holds for every spelling there is.
    pub fn resolve(&self, version: &str, request: &str) -> Option<PathBuf> {
        let base = self.version_dir(version).canonicalize().ok()?;
        let mut path = base.clone();
        for part in percent_decode(request).split(['/', '\\']) {
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
    fn resolves_a_file_inside_the_version() {
        let (dir, store) = store();
        let assets = dir.path().join("0.2.0").join("assets");
        std::fs::create_dir_all(&assets).expect("mkdir");
        std::fs::write(assets.join("app.js"), b"x").expect("write");
        let found = store.resolve("0.2.0", "/assets/app.js").expect("resolved");
        assert!(found.ends_with("app.js"));
        assert_eq!(std::fs::read(found).expect("read"), b"x");
    }

    #[test]
    fn refuses_a_request_that_climbs_out_of_the_version() {
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.2.0").join("assets")).expect("mkdir");
        std::fs::write(dir.path().join("secret"), b"x").expect("write");
        for request in [
            "/../secret",
            "/assets/../../secret",
            "../secret",
            "/..%2Fsecret",
            "/%2e%2e/secret",
        ] {
            assert_eq!(store.resolve("0.2.0", request), None, "{request}");
        }
    }

    #[test]
    fn a_file_that_is_not_there_resolves_to_nothing() {
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.2.0")).expect("mkdir");
        assert_eq!(store.resolve("0.2.0", "/index.html"), None);
        // A directory is not a file, and serving one would be a 200 with the
        // wrong body rather than the 404 the caller is expecting.
        assert_eq!(store.resolve("0.2.0", "/"), None);
    }

    #[test]
    fn a_version_that_was_never_applied_resolves_to_nothing() {
        let (_dir, store) = store();
        assert_eq!(store.resolve("9.9.9", "/index.html"), None);
    }

    #[test]
    fn a_pointer_that_is_not_json_is_no_pointer_rather_than_an_error() {
        // A truncated write must not stop the OS from opening: the floor is
        // the embedded bundle, and unreadable state falls to the floor.
        let (dir, store) = store();
        std::fs::write(dir.path().join("current.json"), b"{ not json").expect("write");
        assert!(store.pointer().expect("read").is_none());
    }
}
