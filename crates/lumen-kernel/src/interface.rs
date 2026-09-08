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

/// What the front end is told about itself.
///
/// The interface and the binary are reported separately because a patch moves
/// only one of them. A release that needs the other has to say so, and it can
/// only say so if the two numbers are visible side by side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceState {
    /// The applied version, or `None` for the bundle inside the binary.
    pub version: Option<String>,
    /// The host binary's version. No patch can change this.
    pub host: String,
    pub previous: Option<String>,
    /// Set when the last start gave up on a version that never reported.
    pub rolled_back_from: Option<String>,
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

    /// What is running, for the interface to show. A pointer that cannot be
    /// read reports the embedded bundle rather than failing, for the same
    /// reason it serves it: this call must not be a way for the OS to break.
    pub fn state(&self, host: &str, rolled_back_from: Option<String>) -> InterfaceState {
        let pointer = self.pointer().ok().flatten();
        InterfaceState {
            version: pointer.as_ref().map(|p| p.version.clone()),
            host: host.to_owned(),
            previous: pointer.and_then(|p| p.previous),
            rolled_back_from,
        }
    }

    /// A marker file per version, rather than a field in the pointer: the
    /// pointer is rewritten by a rollback, and the fact that a version once
    /// worked has to survive that.
    fn booted_marker(&self, version: &str) -> PathBuf {
        self.root.join(format!(".booted-{version}"))
    }

    pub fn has_booted(&self, version: &str) -> bool {
        self.booted_marker(version).is_file()
    }

    /// Written when a version is about to be served for the first time, and
    /// removed when it reports. Its presence at the next start is the whole
    /// evidence that a version was given its chance and did not answer.
    fn attempt_marker(&self, version: &str) -> PathBuf {
        self.root.join(format!(".trying-{version}"))
    }

    fn attempted(&self, version: &str) -> bool {
        self.attempt_marker(version).is_file()
    }

    fn mark_attempted(&self, version: &str) -> Result<()> {
        self.write_marker(&self.attempt_marker(version))
    }

    fn write_marker(&self, path: &Path) -> Result<()> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| KernelError::io(&e, Some(&self.root.display().to_string())))?;
        std::fs::write(path, b"")
            .map_err(|e| KernelError::io(&e, Some(&path.display().to_string())))
    }

    /// The interface reporting that it got as far as drawing itself.
    ///
    /// The attempt marker goes with it. A version that answered must not keep
    /// carrying the evidence of a start that did not, or the next one would
    /// read it as a failure and give up a version that works.
    pub fn mark_booted(&self, version: &str) -> Result<()> {
        self.write_marker(&self.booted_marker(version))?;
        match std::fs::remove_file(self.attempt_marker(version)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(KernelError::io(&e, None)),
        }
    }

    /// Remove the pointer, which puts the embedded bundle back in charge.
    fn clear_pointer(&self) -> Result<()> {
        let path = self.root.join(POINTER);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(KernelError::io(&e, Some(&path.display().to_string()))),
        }
    }

    /// Called once at start, before anything is served, and the reason a bad
    /// patch cannot brick an installation.
    ///
    /// A live version that has never reported reaching the interface did not
    /// work, so far as anything here can tell, and the pointer goes back to
    /// what it replaced — or away entirely, which serves the bundle inside the
    /// binary. Returns the version that was given up, for the interface to
    /// say so once it is up.
    pub fn settle(&self) -> Result<Option<String>> {
        let Some(pointer) = self.pointer()? else {
            return Ok(None);
        };
        if self.has_booted(&pointer.version) {
            return Ok(None);
        }
        /*
         * A version that has never run gets exactly one start to prove
         * itself. Without this a freshly applied patch — which has of course
         * never reported — would be given up before it was ever served, and
         * no patch could take effect at all. The marker is written before the
         * interface is served, so a start that never reaches it leaves the
         * evidence behind for the next one to read.
         */
        if !self.attempted(&pointer.version) {
            self.mark_attempted(&pointer.version)?;
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
            _ => self.clear_pointer()?,
        }
        Ok(Some(pointer.version))
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

    fn pointer(version: &str, previous: Option<&str>) -> Pointer {
        Pointer {
            version: version.into(),
            applied_at: 1,
            previous: previous.map(Into::into),
        }
    }

    #[test]
    fn settle_gives_a_version_that_has_never_run_its_one_chance() {
        // The point of applying a version is that it gets to run. A freshly
        // applied one has of course never reported, and giving up on that
        // would mean no patch could ever take effect — which is exactly what
        // the first build of this did.
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.1.0")).expect("mkdir");
        store
            .write_pointer(&pointer("0.2.0", Some("0.1.0")))
            .expect("write");
        assert_eq!(store.settle().expect("settle"), None);
        assert_eq!(store.pointer().expect("read").expect("p").version, "0.2.0");
    }

    #[test]
    fn reporting_a_boot_ends_the_probation() {
        // The attempt marker is what makes a second start give up. A version
        // that answered must not keep carrying it, or a later start would
        // read it as a failure.
        let (_dir, store) = store();
        store.write_pointer(&pointer("0.2.0", None)).expect("write");
        store.settle().expect("its chance");
        store.mark_booted("0.2.0").expect("mark");
        assert_eq!(store.settle().expect("settled"), None);
        assert_eq!(store.pointer().expect("read").expect("p").version, "0.2.0");
    }

    #[test]
    fn a_version_that_reported_once_is_trusted_from_then_on() {
        let (_dir, store) = store();
        assert!(!store.has_booted("0.2.0"));
        store.mark_booted("0.2.0").expect("mark");
        assert!(store.has_booted("0.2.0"));
    }

    #[test]
    fn settle_reverts_on_the_start_after_the_one_that_never_reported() {
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.1.0")).expect("mkdir");
        store
            .write_pointer(&pointer("0.2.0", Some("0.1.0")))
            .expect("write");

        assert_eq!(store.settle().expect("its chance"), None);
        assert_eq!(store.settle().expect("given up"), Some("0.2.0".into()));
        let now = store.pointer().expect("read").expect("pointer");
        assert_eq!(now.version, "0.1.0");
        assert_eq!(now.previous, None);
    }

    #[test]
    fn settle_leaves_a_version_that_has_booted_alone() {
        let (_dir, store) = store();
        store.write_pointer(&pointer("0.2.0", None)).expect("write");
        store.mark_booted("0.2.0").expect("mark");
        assert_eq!(store.settle().expect("settle"), None);
        assert_eq!(store.pointer().expect("read").expect("p").version, "0.2.0");
    }

    #[test]
    fn settle_falls_to_the_embedded_bundle_when_there_is_nothing_to_revert_to() {
        let (_dir, store) = store();
        store.write_pointer(&pointer("0.2.0", None)).expect("write");
        assert_eq!(store.settle().expect("its chance"), None);
        assert_eq!(store.settle().expect("given up"), Some("0.2.0".into()));
        assert!(store.pointer().expect("read").is_none());
    }

    #[test]
    fn settle_falls_to_the_embedded_bundle_when_the_previous_version_is_gone() {
        // The directory was swept, or removed by hand. Reverting to a version
        // that is not there would serve nothing at all.
        let (_dir, store) = store();
        store
            .write_pointer(&pointer("0.2.0", Some("0.1.0")))
            .expect("write");
        assert_eq!(store.settle().expect("its chance"), None);
        assert_eq!(store.settle().expect("given up"), Some("0.2.0".into()));
        assert!(store.pointer().expect("read").is_none());
    }

    #[test]
    fn settle_does_nothing_when_the_embedded_bundle_is_already_live() {
        let (_dir, store) = store();
        assert_eq!(store.settle().expect("settle"), None);
    }

    #[test]
    fn a_version_that_booted_stays_trusted_across_a_rollback() {
        // The marker is a file per version rather than a field in the
        // pointer, because a rollback rewrites the pointer and the fact that
        // a version once worked has to survive that.
        let (dir, store) = store();
        std::fs::create_dir_all(dir.path().join("0.1.0")).expect("mkdir");
        store.mark_booted("0.1.0").expect("mark");
        store
            .write_pointer(&pointer("0.2.0", Some("0.1.0")))
            .expect("write");
        store.settle().expect("its chance");
        store.settle().expect("given up");
        assert!(store.has_booted("0.1.0"));
        // Back on 0.1.0, which has reported before, so nothing more is given up.
        assert_eq!(store.settle().expect("settled"), None);
    }

    #[test]
    fn the_state_names_the_embedded_bundle_when_no_patch_is_applied() {
        let (_dir, store) = store();
        let state = store.state("0.1.0", None);
        assert_eq!(state.version, None);
        assert_eq!(state.host, "0.1.0");
        assert_eq!(state.previous, None);
        assert_eq!(state.rolled_back_from, None);
    }

    #[test]
    fn the_state_names_the_applied_version_and_what_it_replaced() {
        let (_dir, store) = store();
        store
            .write_pointer(&pointer("0.2.0", Some("0.1.0")))
            .expect("write");
        let state = store.state("0.1.0", Some("0.3.0".into()));
        assert_eq!(state.version.as_deref(), Some("0.2.0"));
        // The binary's version is its own and no patch can move it: that is
        // the whole reason the two are reported separately.
        assert_eq!(state.host, "0.1.0");
        assert_eq!(state.previous.as_deref(), Some("0.1.0"));
        assert_eq!(state.rolled_back_from.as_deref(), Some("0.3.0"));
    }

    #[test]
    fn an_unreadable_pointer_reports_the_embedded_bundle_rather_than_failing() {
        let (dir, store) = store();
        std::fs::write(dir.path().join("current.json"), b"{ not json").expect("write");
        assert_eq!(store.state("0.1.0", None).version, None);
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
