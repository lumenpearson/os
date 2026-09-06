//! File operations over a `Sandbox`. Every function takes VFS paths,
//! resolves them through the sandbox and maps OS errors to `KernelError`.
//! The semantics mirror the browser (OPFS) adapter in `packages/vfs` so a
//! program behaves the same on both hosts: `/` is a directory that cannot be
//! removed or renamed, `remove` of a non-empty directory needs `recursive`,
//! and `rename` replaces a file or an empty directory but never a full one.

use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::{ErrorCode, KernelError, Result};
use crate::sandbox::Sandbox;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    File,
    Directory,
}

/// One entry as the front end sees it. Timestamps are epoch milliseconds;
/// `created_at` falls back to `modified_at` where the OS has no birth time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub name: String,
    pub kind: FileKind,
    pub size: u64,
    pub modified_at: u64,
    pub created_at: u64,
}

/// Bytes under the home directory and the ceiling the volume allows for it.
/// `quota` is `used + available space`, the same shape as the browser's
/// `storage.estimate()`, so `used / quota` is a fraction and `quota - used`
/// is free space. `None` when the volume cannot be identified.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Usage {
    pub used: u64,
    pub quota: Option<u64>,
}

pub fn stat(sb: &Sandbox, path: &str) -> Result<FileStat> {
    let vfs = Sandbox::normalize(path)?;
    let host = sb.resolve(&vfs)?;
    let meta = fs::metadata(&host).map_err(|e| KernelError::io(&e, Some(&vfs)))?;
    stat_from(&vfs, &meta)
}

/// List a directory. Entries whose metadata cannot be read, whose names
/// cannot be represented in the VFS, or which link outside the sandbox are
/// skipped rather than failing the whole listing. Sorted by name.
pub fn read_dir(sb: &Sandbox, path: &str) -> Result<Vec<FileStat>> {
    let vfs = Sandbox::normalize(path)?;
    let host = sb.resolve(&vfs)?;
    let meta = fs::metadata(&host).map_err(|e| KernelError::io(&e, Some(&vfs)))?;
    if !meta.is_dir() {
        return Err(KernelError::new(ErrorCode::Enotdir, "not a directory").with_path(vfs));
    }
    let entries = fs::read_dir(&host).map_err(|e| KernelError::io(&e, Some(&vfs)))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let child_vfs = child_path(&vfs, name);
        let Ok(child_host) = sb.resolve(&child_vfs) else {
            continue;
        };
        let Ok(meta) = fs::metadata(&child_host) else {
            continue;
        };
        if let Ok(stat) = stat_from(&child_vfs, &meta) {
            out.push(stat);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn read_file(sb: &Sandbox, path: &str) -> Result<Vec<u8>> {
    let vfs = Sandbox::normalize(path)?;
    let host = sb.resolve(&vfs)?;
    if host.is_dir() {
        return Err(KernelError::new(ErrorCode::Eisdir, "is a directory").with_path(vfs));
    }
    fs::read(&host).map_err(|e| KernelError::io(&e, Some(&vfs)))
}

/// Create or replace a file. With `recursive`, missing parents are created.
pub fn write_file(sb: &Sandbox, path: &str, data: &[u8], recursive: bool) -> Result<()> {
    let vfs = Sandbox::normalize(path)?;
    let host = sb.resolve(&vfs)?;
    if host.is_dir() {
        return Err(KernelError::new(ErrorCode::Eisdir, "is a directory").with_path(vfs));
    }
    if recursive {
        if let Some(parent) = host.parent() {
            fs::create_dir_all(parent).map_err(|e| KernelError::io(&e, Some(&vfs)))?;
        }
    }
    fs::write(&host, data).map_err(|e| KernelError::io(&e, Some(&vfs)))
}

pub fn mkdir(sb: &Sandbox, path: &str, recursive: bool) -> Result<()> {
    let vfs = Sandbox::normalize(path)?;
    if vfs == "/" {
        return if recursive {
            Ok(())
        } else {
            Err(KernelError::new(ErrorCode::Eexist, "file exists").with_path(vfs))
        };
    }
    let host = sb.resolve(&vfs)?;
    let result = if recursive {
        fs::create_dir_all(&host)
    } else {
        fs::create_dir(&host)
    };
    result.map_err(|e| KernelError::io(&e, Some(&vfs)))
}

/// Remove a file or directory. A directory with contents needs `recursive`.
pub fn remove(sb: &Sandbox, path: &str, recursive: bool) -> Result<()> {
    let vfs = Sandbox::normalize(path)?;
    if vfs == "/" {
        return Err(KernelError::invalid(
            vfs,
            "cannot remove the root directory",
        ));
    }
    let host = sb.resolve(&vfs)?;
    let meta = fs::symlink_metadata(&host).map_err(|e| KernelError::io(&e, Some(&vfs)))?;
    let result = if meta.is_dir() {
        if recursive {
            fs::remove_dir_all(&host)
        } else if is_empty_dir(&host)? {
            fs::remove_dir(&host)
        } else {
            return Err(
                KernelError::new(ErrorCode::Enotempty, "directory not empty").with_path(vfs),
            );
        }
    } else {
        fs::remove_file(&host)
    };
    result.map_err(|e| KernelError::io(&e, Some(&vfs)))
}

/// Move a file or directory. Replaces an existing file or empty directory of
/// the same kind; falls back to copy + delete when the volumes differ.
pub fn rename(sb: &Sandbox, from: &str, to: &str) -> Result<()> {
    let (vf, vt) = (Sandbox::normalize(from)?, Sandbox::normalize(to)?);
    if vf == "/" || vt == "/" {
        return Err(KernelError::invalid(vt, "cannot rename the root directory"));
    }
    if vf == vt {
        return Ok(());
    }
    if vt.starts_with(&format!("{vf}/")) {
        return Err(KernelError::invalid(
            vt,
            "cannot move a directory into itself",
        ));
    }
    let hf = sb.resolve(&vf)?;
    let ht = sb.resolve(&vt)?;
    let src = fs::metadata(&hf).map_err(|e| KernelError::io(&e, Some(&vf)))?;

    // A case-only rename on a case-insensitive volume points at the same
    // entry; the OS handles that directly.
    if !same_entry(&hf, &ht) {
        if let Ok(dst) = fs::metadata(&ht) {
            if dst.is_dir() {
                if !src.is_dir() {
                    return Err(KernelError::new(ErrorCode::Eisdir, "is a directory").with_path(vt));
                }
                if !is_empty_dir(&ht)? {
                    return Err(
                        KernelError::new(ErrorCode::Enotempty, "directory not empty").with_path(vt),
                    );
                }
                fs::remove_dir(&ht).map_err(|e| KernelError::io(&e, Some(&vt)))?;
            } else if src.is_dir() {
                return Err(KernelError::new(ErrorCode::Enotdir, "not a directory").with_path(vt));
            }
        }
    }

    match fs::rename(&hf, &ht) {
        Ok(()) => Ok(()),
        Err(e) if crosses_devices(&e) => {
            move_by_copy(&hf, &ht, src.is_dir()).map_err(|e| KernelError::io(&e, Some(&vt)))
        }
        Err(e) => Err(KernelError::io(&e, Some(&vf))),
    }
}

pub fn copy_file(sb: &Sandbox, from: &str, to: &str) -> Result<()> {
    let (vf, vt) = (Sandbox::normalize(from)?, Sandbox::normalize(to)?);
    if vf == vt {
        return Err(KernelError::invalid(
            vt,
            "source and destination are the same file",
        ));
    }
    let hf = sb.resolve(&vf)?;
    let ht = sb.resolve(&vt)?;
    let src = fs::metadata(&hf).map_err(|e| KernelError::io(&e, Some(&vf)))?;
    if src.is_dir() {
        return Err(KernelError::new(ErrorCode::Eisdir, "is a directory").with_path(vf));
    }
    if ht.is_dir() {
        return Err(KernelError::new(ErrorCode::Eisdir, "is a directory").with_path(vt));
    }
    fs::copy(&hf, &ht)
        .map(|_| ())
        .map_err(|e| KernelError::io(&e, Some(&vt)))
}

/// Bytes used under `path` (files only, links not followed) plus the volume
/// ceiling. See [`Usage`].
pub fn usage(sb: &Sandbox, path: &str) -> Result<Usage> {
    let vfs = Sandbox::normalize(path)?;
    let host = sb.resolve(&vfs)?;
    let mut used: u64 = 0;
    for entry in walkdir::WalkDir::new(&host)
        .follow_links(false)
        .into_iter()
        .flatten()
    {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                used = used.saturating_add(meta.len());
            }
        }
    }
    let quota = available_space(sb).map(|free| free.saturating_add(used));
    Ok(Usage { used, quota })
}

/// Free space on the volume that holds the home directory.
///
/// Both spellings of the root are tried because neither matches the mount
/// table everywhere. macOS mounts `/private`, so only the canonical form of
/// a home under `/var` or `/tmp` has a mount point as a prefix. Windows
/// canonicalises to a `\\?\C:\…` path, which shares no component with the
/// `C:\` the mount table lists, so only the configured form matches there.
fn available_space(sb: &Sandbox) -> Option<u64> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mounts: Vec<(&Path, u64)> = disks
        .list()
        .iter()
        .map(|d| (d.mount_point(), d.available_space()))
        .collect();
    free_on_volume(&mounts, sb.canonical_root()).or_else(|| free_on_volume(&mounts, sb.root()))
}

/// The mounted disk with the longest mount point that is a prefix of `path`,
/// so a home on a volume mounted inside another one reports that volume.
fn free_on_volume(mounts: &[(&Path, u64)], path: &Path) -> Option<u64> {
    mounts
        .iter()
        .filter(|(mount, _)| path.starts_with(mount))
        .max_by_key(|(mount, _)| mount.as_os_str().len())
        .map(|(_, free)| *free)
}

fn stat_from(vfs: &str, meta: &fs::Metadata) -> Result<FileStat> {
    let kind = if meta.is_dir() {
        FileKind::Directory
    } else if meta.is_file() {
        FileKind::File
    } else {
        return Err(KernelError::invalid(vfs, "not a regular file or directory"));
    };
    let modified_at = meta.modified().map(millis).unwrap_or(0);
    let created_at = meta.created().map(millis).unwrap_or(modified_at);
    Ok(FileStat {
        path: vfs.to_owned(),
        name: vfs.rsplit('/').next().unwrap_or_default().to_owned(),
        kind,
        size: if kind == FileKind::File {
            meta.len()
        } else {
            0
        },
        modified_at,
        created_at,
    })
}

fn millis(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

fn child_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{parent}/{name}")
    }
}

fn is_empty_dir(host: &Path) -> Result<bool> {
    let mut entries = fs::read_dir(host).map_err(|e| KernelError::io(&e, None))?;
    Ok(entries.next().is_none())
}

fn same_entry(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn crosses_devices(err: &io::Error) -> bool {
    // EXDEV on Unix, ERROR_NOT_SAME_DEVICE on Windows.
    let raw = if cfg!(windows) { 17 } else { 18 };
    err.kind() == io::ErrorKind::CrossesDevices || err.raw_os_error() == Some(raw)
}

fn move_by_copy(from: &Path, to: &Path, is_dir: bool) -> io::Result<()> {
    if is_dir {
        copy_tree(from, to)?;
        fs::remove_dir_all(from)
    } else {
        fs::copy(from, to)?;
        fs::remove_file(from)
    }
}

fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sandbox() -> (tempfile::TempDir, Sandbox) {
        let dir = tempfile::tempdir().unwrap();
        let sb = Sandbox::new(dir.path()).unwrap();
        (dir, sb)
    }

    #[test]
    fn write_read_stat_round_trip() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/Users/me/notes.txt", b"hello", true).unwrap();
        assert_eq!(read_file(&sb, "/Users/me/notes.txt").unwrap(), b"hello");
        let st = stat(&sb, "/Users/me/notes.txt").unwrap();
        assert_eq!(st.path, "/Users/me/notes.txt");
        assert_eq!(st.name, "notes.txt");
        assert_eq!(st.kind, FileKind::File);
        assert_eq!(st.size, 5);
        assert!(st.modified_at > 0);
        assert!(st.created_at > 0);
        let dir = stat(&sb, "/Users").unwrap();
        assert_eq!(dir.kind, FileKind::Directory);
        assert_eq!(dir.size, 0);
    }

    #[test]
    fn stat_root_is_a_directory_with_empty_name() {
        let (_dir, sb) = sandbox();
        let st = stat(&sb, "/").unwrap();
        assert_eq!(st.path, "/");
        assert_eq!(st.name, "");
        assert_eq!(st.kind, FileKind::Directory);
    }

    #[test]
    fn write_without_recursive_needs_the_parent() {
        let (_dir, sb) = sandbox();
        let err = write_file(&sb, "/missing/file.txt", b"x", false).unwrap_err();
        assert_eq!(err.code, ErrorCode::Enoent);
        assert_eq!(err.path.as_deref(), Some("/missing/file.txt"));
        write_file(&sb, "/top.txt", b"x", false).unwrap();
        write_file(&sb, "/top.txt", b"yz", false).unwrap();
        assert_eq!(read_file(&sb, "/top.txt").unwrap(), b"yz");
    }

    #[test]
    fn write_and_read_refuse_directories() {
        let (_dir, sb) = sandbox();
        mkdir(&sb, "/d", false).unwrap();
        assert_eq!(
            write_file(&sb, "/d", b"x", false).unwrap_err().code,
            ErrorCode::Eisdir
        );
        assert_eq!(read_file(&sb, "/d").unwrap_err().code, ErrorCode::Eisdir);
        assert_eq!(read_file(&sb, "/").unwrap_err().code, ErrorCode::Eisdir);
        assert_eq!(read_file(&sb, "/nope").unwrap_err().code, ErrorCode::Enoent);
    }

    #[test]
    fn read_dir_lists_sorted_and_skips_unrepresentable_entries() {
        let (dir, sb) = sandbox();
        write_file(&sb, "/b.txt", b"bb", false).unwrap();
        write_file(&sb, "/a.txt", b"a", false).unwrap();
        mkdir(&sb, "/c", false).unwrap();
        // A name the VFS refuses (trailing dot) is skipped, not fatal.
        std::fs::write(dir.path().join("bad."), b"x").unwrap();
        let names: Vec<String> = read_dir(&sb, "/")
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert_eq!(names, ["a.txt", "b.txt", "c"]);
        let entries = read_dir(&sb, "/").unwrap();
        assert_eq!(entries[0].path, "/a.txt");
        assert_eq!(entries[2].kind, FileKind::Directory);
        assert_eq!(
            read_dir(&sb, "/a.txt").unwrap_err().code,
            ErrorCode::Enotdir
        );
        assert_eq!(read_dir(&sb, "/zzz").unwrap_err().code, ErrorCode::Enoent);
    }

    #[cfg(unix)]
    #[test]
    fn read_dir_skips_links_that_leave_the_sandbox() {
        let outside = tempfile::tempdir().unwrap();
        let (dir, sb) = sandbox();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();
        write_file(&sb, "/ok.txt", b"1", false).unwrap();
        let names: Vec<String> = read_dir(&sb, "/")
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert_eq!(names, ["ok.txt"]);
    }

    #[test]
    fn mkdir_semantics() {
        let (_dir, sb) = sandbox();
        mkdir(&sb, "/a", false).unwrap();
        assert_eq!(mkdir(&sb, "/a", false).unwrap_err().code, ErrorCode::Eexist);
        assert_eq!(
            mkdir(&sb, "/x/y", false).unwrap_err().code,
            ErrorCode::Enoent
        );
        mkdir(&sb, "/x/y", true).unwrap();
        mkdir(&sb, "/x/y", true).unwrap();
        assert!(stat(&sb, "/x/y").is_ok());
        mkdir(&sb, "/", true).unwrap();
        assert_eq!(mkdir(&sb, "/", false).unwrap_err().code, ErrorCode::Eexist);
        write_file(&sb, "/f", b"", false).unwrap();
        assert_eq!(mkdir(&sb, "/f", true).unwrap_err().code, ErrorCode::Eexist);
    }

    #[test]
    fn remove_semantics() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/d/inner/f.txt", b"x", true).unwrap();
        assert_eq!(
            remove(&sb, "/d", false).unwrap_err().code,
            ErrorCode::Enotempty
        );
        assert_eq!(remove(&sb, "/", true).unwrap_err().code, ErrorCode::Einval);
        assert_eq!(
            remove(&sb, "/nope", false).unwrap_err().code,
            ErrorCode::Enoent
        );
        remove(&sb, "/d/inner/f.txt", false).unwrap();
        remove(&sb, "/d/inner", false).unwrap();
        write_file(&sb, "/d/again.txt", b"x", false).unwrap();
        remove(&sb, "/d", true).unwrap();
        assert_eq!(stat(&sb, "/d").unwrap_err().code, ErrorCode::Enoent);
    }

    #[test]
    fn rename_files_and_directories() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/a.txt", b"a", false).unwrap();
        rename(&sb, "/a.txt", "/b.txt").unwrap();
        assert_eq!(stat(&sb, "/a.txt").unwrap_err().code, ErrorCode::Enoent);
        assert_eq!(read_file(&sb, "/b.txt").unwrap(), b"a");

        write_file(&sb, "/dir/x/y.txt", b"y", true).unwrap();
        rename(&sb, "/dir", "/moved").unwrap();
        assert_eq!(read_file(&sb, "/moved/x/y.txt").unwrap(), b"y");

        rename(&sb, "/moved", "/moved").unwrap();
        assert_eq!(
            rename(&sb, "/moved", "/moved/inside").unwrap_err().code,
            ErrorCode::Einval
        );
        assert_eq!(rename(&sb, "/", "/z").unwrap_err().code, ErrorCode::Einval);
        assert_eq!(
            rename(&sb, "/gone", "/z").unwrap_err().code,
            ErrorCode::Enoent
        );
    }

    #[test]
    fn rename_onto_existing_targets() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/f1", b"1", false).unwrap();
        write_file(&sb, "/f2", b"2", false).unwrap();
        mkdir(&sb, "/empty", false).unwrap();
        write_file(&sb, "/full/child", b"c", true).unwrap();
        mkdir(&sb, "/src", false).unwrap();

        rename(&sb, "/f1", "/f2").unwrap();
        assert_eq!(read_file(&sb, "/f2").unwrap(), b"1");
        assert_eq!(
            rename(&sb, "/f2", "/empty").unwrap_err().code,
            ErrorCode::Eisdir
        );
        assert_eq!(
            rename(&sb, "/src", "/f2").unwrap_err().code,
            ErrorCode::Enotdir
        );
        assert_eq!(
            rename(&sb, "/src", "/full").unwrap_err().code,
            ErrorCode::Enotempty
        );
        rename(&sb, "/src", "/empty").unwrap();
        assert_eq!(stat(&sb, "/src").unwrap_err().code, ErrorCode::Enoent);
        assert_eq!(stat(&sb, "/empty").unwrap().kind, FileKind::Directory);
    }

    #[test]
    fn copy_file_semantics() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/a", b"abc", false).unwrap();
        mkdir(&sb, "/d", false).unwrap();
        copy_file(&sb, "/a", "/b").unwrap();
        assert_eq!(read_file(&sb, "/b").unwrap(), b"abc");
        assert_eq!(read_file(&sb, "/a").unwrap(), b"abc");
        assert_eq!(
            copy_file(&sb, "/a", "/a").unwrap_err().code,
            ErrorCode::Einval
        );
        assert_eq!(
            copy_file(&sb, "/d", "/e").unwrap_err().code,
            ErrorCode::Eisdir
        );
        assert_eq!(
            copy_file(&sb, "/a", "/d").unwrap_err().code,
            ErrorCode::Eisdir
        );
        assert_eq!(
            copy_file(&sb, "/missing", "/x").unwrap_err().code,
            ErrorCode::Enoent
        );
        assert_eq!(
            copy_file(&sb, "/a", "/no/parent").unwrap_err().code,
            ErrorCode::Enoent
        );
    }

    #[test]
    fn move_by_copy_moves_trees() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("from");
        std::fs::create_dir_all(from.join("sub")).unwrap();
        std::fs::write(from.join("sub").join("f"), b"f").unwrap();
        std::fs::write(from.join("top"), b"t").unwrap();
        let to = dir.path().join("to");
        move_by_copy(&from, &to, true).unwrap();
        assert!(!from.exists());
        assert_eq!(std::fs::read(to.join("sub").join("f")).unwrap(), b"f");
        assert_eq!(std::fs::read(to.join("top")).unwrap(), b"t");
    }

    #[test]
    fn usage_counts_file_bytes() {
        let (_dir, sb) = sandbox();
        write_file(&sb, "/a", &[0; 100], false).unwrap();
        write_file(&sb, "/d/b", &[0; 50], true).unwrap();
        let u = usage(&sb, "/").unwrap();
        assert_eq!(u.used, 150);
        if let Some(quota) = u.quota {
            assert!(quota >= u.used);
        }
        assert_eq!(usage(&sb, "/d").unwrap().used, 50);
    }

    #[test]
    fn free_space_comes_from_the_innermost_mount_point() {
        let disk = |mount: &'static str, free: u64| (Path::new(mount), free);
        // Unix: `/home/me` is a volume of its own inside `/`.
        let unix = [disk("/", 1), disk("/home/me", 2)];
        assert_eq!(free_on_volume(&unix, Path::new("/home/me/x")), Some(2));
        assert_eq!(free_on_volume(&unix, Path::new("/etc/x")), Some(1));
        // A mount point that is only a name prefix is not a match.
        assert_eq!(free_on_volume(&unix, Path::new("/home/meta")), Some(1));
        // Nothing to match against: the caller falls back to the other form
        // of the root, and reports no quota if that misses too.
        assert_eq!(free_on_volume(&[], Path::new("/home/me")), None);
        assert_eq!(
            free_on_volume(&[disk("/private", 3)], Path::new("/var/x")),
            None
        );
    }

    #[test]
    fn every_operation_rejects_escapes() {
        let (_dir, sb) = sandbox();
        let bad = "/../outside";
        assert_eq!(stat(&sb, bad).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(read_dir(&sb, bad).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(read_file(&sb, bad).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(
            write_file(&sb, bad, b"", true).unwrap_err().code,
            ErrorCode::Eacces
        );
        assert_eq!(mkdir(&sb, bad, true).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(remove(&sb, bad, true).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(rename(&sb, bad, "/x").unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(rename(&sb, "/x", bad).unwrap_err().code, ErrorCode::Eacces);
        assert_eq!(
            copy_file(&sb, bad, "/x").unwrap_err().code,
            ErrorCode::Eacces
        );
        assert_eq!(
            copy_file(&sb, "/x", bad).unwrap_err().code,
            ErrorCode::Eacces
        );
        assert_eq!(usage(&sb, bad).unwrap_err().code, ErrorCode::Eacces);
    }

    #[test]
    fn file_stat_serialises_camel_case() {
        let st = FileStat {
            path: "/a".into(),
            name: "a".into(),
            kind: FileKind::Directory,
            size: 0,
            modified_at: 1,
            created_at: 2,
        };
        let json = serde_json::to_value(&st).unwrap();
        assert_eq!(json["kind"], "directory");
        assert_eq!(json["modifiedAt"], 1);
        assert_eq!(json["createdAt"], 2);
    }
}
