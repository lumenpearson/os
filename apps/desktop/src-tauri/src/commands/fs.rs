//! `fs_*` commands over the sandbox. `fs_read_file` answers with raw bytes
//! (an `ArrayBuffer` in JS) and `fs_write_file` reads the raw request body,
//! with the path and options carried in headers, so binary data never goes
//! through a JSON number array.

use std::borrow::Cow;
use std::sync::Mutex;

use lumen_kernel::{fs, FileStat, KernelError, Sandbox, Usage};
use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::lock;

type Sb<'a> = State<'a, Mutex<Sandbox>>;

const PATH_HEADER: &str = "x-lumen-path";
const RECURSIVE_HEADER: &str = "x-lumen-recursive";

#[tauri::command]
pub async fn fs_stat(path: String, sandbox: Sb<'_>) -> Result<FileStat, KernelError> {
    let sb = lock(&sandbox)?;
    fs::stat(&sb, &path)
}

#[tauri::command]
pub async fn fs_read_dir(path: String, sandbox: Sb<'_>) -> Result<Vec<FileStat>, KernelError> {
    let sb = lock(&sandbox)?;
    fs::read_dir(&sb, &path)
}

#[tauri::command]
pub async fn fs_read_file(path: String, sandbox: Sb<'_>) -> Result<Response, KernelError> {
    let sb = lock(&sandbox)?;
    let bytes = fs::read_file(&sb, &path)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn fs_write_file(request: Request<'_>, sandbox: Sb<'_>) -> Result<(), KernelError> {
    let encoded = header(&request, PATH_HEADER)?
        .ok_or_else(|| KernelError::invalid("", format!("{PATH_HEADER} header is missing")))?;
    let path = decode_path(&encoded)?;
    let recursive = header(&request, RECURSIVE_HEADER)?.as_deref() == Some("1");
    let data = body_bytes(request.body(), &path)?;
    let sb = lock(&sandbox)?;
    fs::write_file(&sb, &path, &data, recursive)
}

#[tauri::command]
pub async fn fs_mkdir(path: String, recursive: bool, sandbox: Sb<'_>) -> Result<(), KernelError> {
    let sb = lock(&sandbox)?;
    fs::mkdir(&sb, &path, recursive)
}

#[tauri::command]
pub async fn fs_remove(path: String, recursive: bool, sandbox: Sb<'_>) -> Result<(), KernelError> {
    let sb = lock(&sandbox)?;
    fs::remove(&sb, &path, recursive)
}

#[tauri::command]
pub async fn fs_rename(path: String, to: String, sandbox: Sb<'_>) -> Result<(), KernelError> {
    let sb = lock(&sandbox)?;
    fs::rename(&sb, &path, &to)
}

#[tauri::command]
pub async fn fs_copy_file(path: String, to: String, sandbox: Sb<'_>) -> Result<(), KernelError> {
    let sb = lock(&sandbox)?;
    fs::copy_file(&sb, &path, &to)
}

#[tauri::command]
pub async fn fs_usage(path: String, sandbox: Sb<'_>) -> Result<Usage, KernelError> {
    let sb = lock(&sandbox)?;
    fs::usage(&sb, &path)
}

fn header(request: &Request<'_>, name: &str) -> Result<Option<String>, KernelError> {
    match request.headers().get(name) {
        None => Ok(None),
        Some(value) => value
            .to_str()
            .map(|s| Some(s.to_owned()))
            .map_err(|_| KernelError::invalid("", format!("{name} header is not ASCII"))),
    }
}

/// Raw bytes as sent by `invoke(cmd, Uint8Array)`. A JSON array of byte
/// values is accepted too, for callers that cannot send a binary body.
fn body_bytes<'a>(body: &'a InvokeBody, path: &str) -> Result<Cow<'a, [u8]>, KernelError> {
    match body {
        InvokeBody::Raw(bytes) => Ok(Cow::Borrowed(bytes)),
        InvokeBody::Json(serde_json::Value::Array(items)) => items
            .iter()
            .map(|v| {
                v.as_u64()
                    .and_then(|n| u8::try_from(n).ok())
                    .ok_or_else(|| KernelError::invalid(path, "body array must hold bytes"))
            })
            .collect::<Result<Vec<u8>, KernelError>>()
            .map(Cow::Owned),
        InvokeBody::Json(_) => Err(KernelError::invalid(path, "body must be raw bytes")),
    }
}

/// Undo the `encodeURIComponent` the front end applies to the path header,
/// which is how non-ASCII names survive an HTTP header.
fn decode_path(encoded: &str) -> Result<String, KernelError> {
    percent_decode_str(encoded)
        .decode_utf8()
        .map(|decoded| decoded.into_owned())
        .map_err(|_| KernelError::invalid(encoded, "path is not valid UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lumen_kernel::ErrorCode;
    use serde_json::json;

    #[test]
    fn decodes_percent_encoded_paths() {
        assert_eq!(
            decode_path("%2FUsers%2Fme%2Fa.txt").unwrap(),
            "/Users/me/a.txt"
        );
        assert_eq!(
            decode_path("%2FDocuments%2FR%C3%A9sum%C3%A9.pdf").unwrap(),
            "/Documents/Résumé.pdf"
        );
        assert_eq!(decode_path("%2Fa%20b%20%26%20c").unwrap(), "/a b & c");
        assert_eq!(decode_path("/plain").unwrap(), "/plain");
        assert_eq!(decode_path("%FF%FE").unwrap_err().code, ErrorCode::Einval);
    }

    #[test]
    fn reads_raw_and_json_array_bodies() {
        let raw = InvokeBody::Raw(vec![1, 2, 3]);
        assert_eq!(body_bytes(&raw, "/a").unwrap().as_ref(), &[1, 2, 3]);

        let array = InvokeBody::Json(json!([0, 127, 255]));
        assert_eq!(body_bytes(&array, "/a").unwrap().as_ref(), &[0, 127, 255]);

        let empty = InvokeBody::Json(json!([]));
        assert!(body_bytes(&empty, "/a").unwrap().is_empty());
    }

    #[test]
    fn rejects_bodies_that_are_not_bytes() {
        for body in [
            InvokeBody::Json(json!({ "data": [1] })),
            InvokeBody::Json(json!("text")),
            InvokeBody::Json(json!([256])),
            InvokeBody::Json(json!([-1])),
            InvokeBody::Json(json!([null])),
        ] {
            assert_eq!(body_bytes(&body, "/a").unwrap_err().code, ErrorCode::Einval);
        }
    }
}
