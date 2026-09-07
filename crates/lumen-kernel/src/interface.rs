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
    fn a_pointer_that_is_not_json_is_no_pointer_rather_than_an_error() {
        // A truncated write must not stop the OS from opening: the floor is
        // the embedded bundle, and unreadable state falls to the floor.
        let (dir, store) = store();
        std::fs::write(dir.path().join("current.json"), b"{ not json").expect("write");
        assert!(store.pointer().expect("read").is_none());
    }
}
