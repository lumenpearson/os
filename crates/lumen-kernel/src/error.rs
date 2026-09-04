//! The one error type every kernel operation returns. It serialises to
//! `{ code, path, message }`, which the Tauri layer forwards unchanged and the
//! front end turns into a `VfsError`. `std::io::Error` values are mapped to
//! POSIX-style codes here so callers never see platform-specific numbers.

use std::fmt;
use std::io;

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Codes understood by `packages/vfs`. `EHOST` covers failures that are not
/// about a path (configuration, dialogs, system probes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ErrorCode {
    Enoent,
    Eexist,
    Enotdir,
    Eisdir,
    Eacces,
    Enotempty,
    Einval,
    Eio,
    Enospc,
    Ehost,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Enoent => "ENOENT",
            Self::Eexist => "EEXIST",
            Self::Enotdir => "ENOTDIR",
            Self::Eisdir => "EISDIR",
            Self::Eacces => "EACCES",
            Self::Enotempty => "ENOTEMPTY",
            Self::Einval => "EINVAL",
            Self::Eio => "EIO",
            Self::Enospc => "ENOSPC",
            Self::Ehost => "EHOST",
        }
    }

    fn describe(self) -> &'static str {
        match self {
            Self::Enoent => "no such file or directory",
            Self::Eexist => "file exists",
            Self::Enotdir => "not a directory",
            Self::Eisdir => "is a directory",
            Self::Eacces => "permission denied",
            Self::Enotempty => "directory not empty",
            Self::Einval => "invalid argument",
            Self::Eio => "i/o error",
            Self::Enospc => "no space left on device",
            Self::Ehost => "host error",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{code}: {message}")]
pub struct KernelError {
    pub code: ErrorCode,
    pub path: Option<String>,
    pub message: String,
}

pub type Result<T, E = KernelError> = std::result::Result<T, E>;

impl KernelError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            path: None,
            message: message.into(),
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    /// `EINVAL` for a malformed path or argument.
    pub fn invalid(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Einval, message).with_path(path)
    }

    /// `EACCES` for anything that would leave the sandbox.
    pub fn denied(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Eacces, message).with_path(path)
    }

    /// `EHOST` for failures unrelated to a VFS path.
    pub fn host(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Ehost, message)
    }

    /// Map an OS error. The message keeps the OS text; the code is normalised.
    pub fn io(err: &io::Error, path: Option<&str>) -> Self {
        let code = code_for(err);
        let message = match path {
            Some(p) => format!("{}: {} ({p})", code.describe(), err),
            None => format!("{}: {}", code.describe(), err),
        };
        Self {
            code,
            path: path.map(str::to_owned),
            message,
        }
    }
}

impl Serialize for KernelError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("KernelError", 3)?;
        state.serialize_field("code", &self.code)?;
        state.serialize_field("path", &self.path)?;
        state.serialize_field("message", &self.message)?;
        state.end()
    }
}

impl From<io::Error> for KernelError {
    fn from(err: io::Error) -> Self {
        Self::io(&err, None)
    }
}

/// Normalise an OS error to a VFS code. `ErrorKind` covers the common cases
/// (the richer variants are stable since Rust 1.83); raw OS codes catch what
/// the standard library still reports as `Other`/`Uncategorized`.
pub fn code_for(err: &io::Error) -> ErrorCode {
    use io::ErrorKind as K;
    match err.kind() {
        K::NotFound => ErrorCode::Enoent,
        K::AlreadyExists => ErrorCode::Eexist,
        K::PermissionDenied => ErrorCode::Eacces,
        K::NotADirectory => ErrorCode::Enotdir,
        K::IsADirectory => ErrorCode::Eisdir,
        K::DirectoryNotEmpty => ErrorCode::Enotempty,
        K::InvalidInput => ErrorCode::Einval,
        K::StorageFull => ErrorCode::Enospc,
        _ => err.raw_os_error().map_or(ErrorCode::Eio, code_for_raw),
    }
}

#[cfg(windows)]
fn code_for_raw(code: i32) -> ErrorCode {
    match code {
        2 | 3 => ErrorCode::Enoent, // ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND
        5 | 32 | 33 => ErrorCode::Eacces, // ERROR_ACCESS_DENIED, ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
        80 | 183 => ErrorCode::Eexist,    // ERROR_FILE_EXISTS, ERROR_ALREADY_EXISTS
        87 | 123 | 206 => ErrorCode::Einval, // ERROR_INVALID_PARAMETER, ERROR_INVALID_NAME, ERROR_FILENAME_EXCED_RANGE
        112 => ErrorCode::Enospc,            // ERROR_DISK_FULL
        145 => ErrorCode::Enotempty,         // ERROR_DIR_NOT_EMPTY
        267 => ErrorCode::Enotdir,           // ERROR_DIRECTORY
        _ => ErrorCode::Eio,
    }
}

#[cfg(not(windows))]
fn code_for_raw(code: i32) -> ErrorCode {
    match code {
        2 => ErrorCode::Enoent,       // ENOENT
        1 | 13 => ErrorCode::Eacces,  // EPERM, EACCES
        17 => ErrorCode::Eexist,      // EEXIST
        20 => ErrorCode::Enotdir,     // ENOTDIR
        21 => ErrorCode::Eisdir,      // EISDIR
        22 | 36 => ErrorCode::Einval, // EINVAL, ENAMETOOLONG
        28 => ErrorCode::Enospc,      // ENOSPC
        39 => ErrorCode::Enotempty,   // ENOTEMPTY
        _ => ErrorCode::Eio,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_error_kinds() {
        let cases = [
            (io::ErrorKind::NotFound, ErrorCode::Enoent),
            (io::ErrorKind::AlreadyExists, ErrorCode::Eexist),
            (io::ErrorKind::PermissionDenied, ErrorCode::Eacces),
            (io::ErrorKind::NotADirectory, ErrorCode::Enotdir),
            (io::ErrorKind::IsADirectory, ErrorCode::Eisdir),
            (io::ErrorKind::DirectoryNotEmpty, ErrorCode::Enotempty),
            (io::ErrorKind::InvalidInput, ErrorCode::Einval),
            (io::ErrorKind::StorageFull, ErrorCode::Enospc),
            (io::ErrorKind::Other, ErrorCode::Eio),
        ];
        for (kind, code) in cases {
            assert_eq!(code_for(&io::Error::new(kind, "x")), code, "{kind:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn maps_raw_unix_codes() {
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(39)),
            ErrorCode::Enotempty
        );
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(20)),
            ErrorCode::Enotdir
        );
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(21)),
            ErrorCode::Eisdir
        );
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(28)),
            ErrorCode::Enospc
        );
    }

    #[cfg(windows)]
    #[test]
    fn maps_raw_windows_codes() {
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(145)),
            ErrorCode::Enotempty
        );
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(267)),
            ErrorCode::Enotdir
        );
        assert_eq!(
            code_for(&io::Error::from_raw_os_error(112)),
            ErrorCode::Enospc
        );
    }

    #[test]
    fn serialises_to_the_ipc_shape() {
        let err = KernelError::invalid("/a/b", "bad name");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "code": "EINVAL", "path": "/a/b", "message": "bad name" })
        );
        let host = KernelError::host("boom");
        let json = serde_json::to_value(&host).unwrap();
        assert_eq!(json["code"], "EHOST");
        assert!(json["path"].is_null());
    }

    #[test]
    fn io_errors_keep_the_path() {
        let err = KernelError::io(&io::Error::new(io::ErrorKind::NotFound, "gone"), Some("/x"));
        assert_eq!(err.code, ErrorCode::Enoent);
        assert_eq!(err.path.as_deref(), Some("/x"));
        assert!(err.message.contains("gone"));
        assert_eq!(err.to_string(), format!("ENOENT: {}", err.message));
    }
}
