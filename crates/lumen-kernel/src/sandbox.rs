//! The security boundary. A `Sandbox` owns one host directory (the Lumen
//! home) and turns POSIX-style VFS paths into host paths that cannot leave
//! it. Every file command resolves through `Sandbox::resolve`; nothing else
//! in the crate touches a path that came from the front end.
//!
//! Two checks run on every path. The lexical one walks the `/`-separated
//! segments, refuses any `..` that would climb above the root and refuses
//! names that Windows cannot store (reserved characters, device names,
//! trailing dots or spaces) so a home directory behaves the same on every
//! host. The physical one canonicalises the deepest existing ancestor of the
//! result and checks that it still sits under the canonical root, which
//! closes the symlink and junction escapes the lexical check cannot see.

use std::path::{Component, Path, PathBuf};

use crate::error::{KernelError, Result};

/// Characters that are illegal in a Windows file name. `/` is the VFS
/// separator so it never reaches a segment; `\` is rejected rather than
/// treated as a separator so a host path can never be smuggled in.
const INVALID_CHARS: [char; 8] = ['<', '>', ':', '"', '\\', '|', '?', '*'];

const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

const MAX_NAME_LEN: usize = 255;

#[derive(Debug, Clone)]
pub struct Sandbox {
    /// The root as configured, absolute, without `\\?\` decoration so it can
    /// be shown to the user and joined with mount points.
    root: PathBuf,
    /// `root.canonicalize()`: what every resolved path is compared against.
    canonical_root: PathBuf,
}

impl Sandbox {
    /// Create the root directory if needed and pin its canonical form.
    pub fn new(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref();
        if root.as_os_str().is_empty() {
            return Err(KernelError::invalid("", "home directory path is empty"));
        }
        let display = root.display().to_string();
        std::fs::create_dir_all(root).map_err(|e| KernelError::io(&e, Some(&display)))?;
        let canonical_root = root
            .canonicalize()
            .map_err(|e| KernelError::io(&e, Some(&display)))?;
        let root = if root.is_absolute() {
            root.to_path_buf()
        } else {
            std::env::current_dir()
                .map_err(|e| KernelError::io(&e, Some(&display)))?
                .join(root)
        };
        Ok(Self {
            root,
            canonical_root,
        })
    }

    /// The host directory that backs `/`.
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn canonical_root(&self) -> &Path {
        &self.canonical_root
    }

    /// Lexically normalise a VFS path: `"/"` plus the validated segments.
    pub fn normalize(vfs_path: &str) -> Result<String> {
        let segments = segments(vfs_path)?;
        Ok(join_segments(&segments))
    }

    /// Turn a VFS path into a host path that is guaranteed to be inside the
    /// root. The target itself does not have to exist yet.
    pub fn resolve(&self, vfs_path: &str) -> Result<PathBuf> {
        let segments = segments(vfs_path)?;
        let mut host = self.root.clone();
        for segment in &segments {
            host.push(segment);
        }
        self.verify_inside(&host, vfs_path)?;
        Ok(host)
    }

    /// Convert a host path back to a `/`-separated VFS path. Paths outside
    /// the root cannot be expressed and map to `/`.
    pub fn to_vfs(&self, host: &Path) -> String {
        let relative = host
            .strip_prefix(&self.root)
            .or_else(|_| host.strip_prefix(&self.canonical_root))
            .ok();
        match relative {
            Some(rel) => {
                let parts: Vec<String> = rel
                    .components()
                    .filter_map(|c| match c {
                        Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
                        _ => None,
                    })
                    .collect();
                join_segments(&parts)
            }
            None => "/".to_owned(),
        }
    }

    /// Canonicalise the deepest existing ancestor and make sure it did not
    /// leave the root through a link.
    fn verify_inside(&self, host: &Path, vfs_path: &str) -> Result<()> {
        let mut probe = host;
        while probe.symlink_metadata().is_err() {
            match probe.parent() {
                Some(parent) => probe = parent,
                None => break,
            }
        }
        let canonical = probe
            .canonicalize()
            .map_err(|e| KernelError::io(&e, Some(vfs_path)))?;
        if canonical.starts_with(&self.canonical_root) {
            Ok(())
        } else {
            Err(KernelError::denied(
                vfs_path,
                "path escapes the home directory",
            ))
        }
    }
}

/// Split a VFS path into validated segments. `.` and empty segments are
/// dropped, `..` pops, and a `..` with nothing left to pop is an escape.
pub fn segments(vfs_path: &str) -> Result<Vec<String>> {
    if vfs_path.contains('\0') {
        return Err(KernelError::invalid(vfs_path, "path contains a NUL byte"));
    }
    let mut out: Vec<String> = Vec::new();
    for part in vfs_path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if out.pop().is_none() {
                    return Err(KernelError::denied(
                        vfs_path,
                        "path escapes the home directory",
                    ));
                }
            }
            name => {
                validate_name(name).map_err(|why| KernelError::invalid(vfs_path, why))?;
                out.push(name.to_owned());
            }
        }
    }
    Ok(out)
}

fn join_segments(segments: &[String]) -> String {
    let mut out = String::with_capacity(segments.iter().map(|s| s.len() + 1).sum::<usize>().max(1));
    for segment in segments {
        out.push('/');
        out.push_str(segment);
    }
    if out.is_empty() {
        out.push('/');
    }
    out
}

/// Windows naming rules, applied on every host so a home directory can move
/// between machines without renaming anything.
fn validate_name(name: &str) -> std::result::Result<(), String> {
    if name.chars().count() > MAX_NAME_LEN {
        return Err(format!("name longer than {MAX_NAME_LEN} characters"));
    }
    if let Some(c) = name
        .chars()
        .find(|c| INVALID_CHARS.contains(c) || c.is_control())
    {
        return Err(format!("name contains {c:?}"));
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err("name ends with a space or a dot".to_owned());
    }
    let stem = name.split('.').next().unwrap_or(name);
    if RESERVED_NAMES.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        return Err(format!("{stem} is a reserved device name"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn sandbox() -> (tempfile::TempDir, Sandbox) {
        let dir = tempfile::tempdir().unwrap();
        let sb = Sandbox::new(dir.path()).unwrap();
        (dir, sb)
    }

    #[test]
    fn root_maps_to_the_home_dir() {
        let (dir, sb) = sandbox();
        assert_eq!(sb.resolve("/").unwrap(), dir.path());
        assert_eq!(sb.resolve("").unwrap(), dir.path());
        assert_eq!(sb.resolve("/./").unwrap(), dir.path());
    }

    #[test]
    fn nested_paths_join_under_root() {
        let (dir, sb) = sandbox();
        let expected = dir.path().join("Users").join("me").join("notes.txt");
        assert_eq!(sb.resolve("/Users/me/notes.txt").unwrap(), expected);
        assert_eq!(sb.resolve("Users//me/./notes.txt").unwrap(), expected);
        assert_eq!(sb.resolve("/Users/x/../me/notes.txt").unwrap(), expected);
    }

    #[test]
    fn rejects_dot_dot_escapes() {
        let (_dir, sb) = sandbox();
        for bad in ["../x", "/../../etc", "a/../../b", "/..", "/a/b/../../.."] {
            let err = sb.resolve(bad).unwrap_err();
            assert_eq!(err.code, ErrorCode::Eacces, "{bad}");
            assert_eq!(err.path.as_deref(), Some(bad));
        }
    }

    #[test]
    fn rejects_invalid_names() {
        let (_dir, sb) = sandbox();
        let bad = [
            "/a\0b",
            "/a:b",
            "/a?b",
            "/<x>",
            "/a|b",
            "/a\"b",
            "/back\\slash",
            "/tab\tname",
            "/CON",
            "/con.txt",
            "/Com1",
            "/lpt9.log",
            "/nul",
            "/trailing.",
            "/trailing ",
        ];
        for path in bad {
            let err = sb.resolve(path).unwrap_err();
            assert_eq!(err.code, ErrorCode::Einval, "{path:?}");
        }
        let long = format!("/{}", "x".repeat(256));
        assert_eq!(sb.resolve(&long).unwrap_err().code, ErrorCode::Einval);
    }

    #[test]
    fn accepts_ordinary_unicode_names() {
        let (_dir, sb) = sandbox();
        for ok in [
            "/Documents/Résumé.pdf",
            "/日本語/файл.txt",
            "/.hidden",
            "/a.b.c",
            "/console",
        ] {
            assert!(sb.resolve(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn normalize_keeps_only_segments() {
        assert_eq!(Sandbox::normalize("/").unwrap(), "/");
        assert_eq!(Sandbox::normalize("").unwrap(), "/");
        assert_eq!(Sandbox::normalize("a//b/./c/").unwrap(), "/a/b/c");
        assert_eq!(Sandbox::normalize("/a/b/../c").unwrap(), "/a/c");
        assert_eq!(
            Sandbox::normalize("/../a").unwrap_err().code,
            ErrorCode::Eacces
        );
    }

    #[test]
    fn to_vfs_round_trips() {
        let (dir, sb) = sandbox();
        let host = sb.resolve("/Users/me/a.txt").unwrap();
        assert_eq!(sb.to_vfs(&host), "/Users/me/a.txt");
        assert_eq!(sb.to_vfs(dir.path()), "/");
        assert_eq!(sb.to_vfs(&sb.canonical_root().join("x")), "/x");
        let outside = dir.path().parent().unwrap().join("elsewhere");
        assert_eq!(sb.to_vfs(&outside), "/");
    }

    #[test]
    fn new_creates_the_root_and_rejects_empty() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("nested").join("home");
        let sb = Sandbox::new(&root).unwrap();
        assert!(root.is_dir());
        assert_eq!(sb.root(), root);
        assert_eq!(Sandbox::new("").unwrap_err().code, ErrorCode::Einval);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escapes() {
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), b"x").unwrap();
        let (dir, sb) = sandbox();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret"), dir.path().join("file")).unwrap();

        for bad in ["/link", "/link/secret", "/link/new/deeper", "/file"] {
            let err = sb.resolve(bad).unwrap_err();
            assert_eq!(err.code, ErrorCode::Eacces, "{bad}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn allows_symlinks_that_stay_inside() {
        let (dir, sb) = sandbox();
        std::fs::create_dir(dir.path().join("real")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("alias")).unwrap();
        assert!(sb.resolve("/alias").is_ok());
        assert!(sb.resolve("/alias/new.txt").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlink_is_not_writable_through() {
        let (dir, sb) = sandbox();
        std::os::unix::fs::symlink("/nowhere/at/all", dir.path().join("dangling")).unwrap();
        let err = sb.resolve("/dangling").unwrap_err();
        assert_eq!(err.code, ErrorCode::Enoent);
    }
}
