//! `config_*` commands. Changing `homeDir` re-points the sandbox at the new
//! directory (created if missing) without moving any files.

use std::sync::Mutex;

use lumen_kernel::{ConfigPatch, HostConfig, KernelError, Sandbox};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::lock;

type Config<'a> = State<'a, Mutex<HostConfig>>;
type Sb<'a> = State<'a, Mutex<Sandbox>>;

#[tauri::command]
pub async fn config_get(config: Config<'_>) -> Result<HostConfig, KernelError> {
    Ok(lock(&config)?.clone())
}

#[tauri::command]
pub async fn config_set(
    patch: ConfigPatch,
    config: Config<'_>,
    sandbox: Sb<'_>,
) -> Result<HostConfig, KernelError> {
    apply(patch, &config, &sandbox)
}

/// Native folder picker. Returns the new home directory, or `None` when the
/// user cancels. The config lock is not held while the dialog is open.
#[tauri::command]
pub async fn config_pick_home_dir(
    app: AppHandle,
    config: Config<'_>,
    sandbox: Sb<'_>,
) -> Result<Option<String>, KernelError> {
    let current = lock(&config)?.home_path();
    let picked = app
        .dialog()
        .file()
        .set_title("Choose the Lumen OS home folder")
        .set_directory(&current)
        .blocking_pick_folder();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|err| {
        KernelError::host(format!("folder picker returned an unusable path: {err}"))
    })?;
    let home = path
        .to_str()
        .ok_or_else(|| {
            KernelError::invalid(path.to_string_lossy(), "folder path is not valid UTF-8")
        })?
        .to_owned();
    let patch = ConfigPatch {
        home_dir: Some(home),
        ..ConfigPatch::default()
    };
    let updated = apply(patch, &config, &sandbox)?;
    Ok(Some(updated.home_dir))
}

/// Merge, re-point the sandbox if the home moved, persist, then publish.
/// Nothing is committed to the managed state until every step succeeded.
fn apply(
    patch: ConfigPatch,
    config: &Mutex<HostConfig>,
    sandbox: &Mutex<Sandbox>,
) -> Result<HostConfig, KernelError> {
    let mut current = lock(config)?;
    let mut next = current.clone();
    let home_changed = next.merge(patch)?;
    if home_changed {
        let moved = Sandbox::new(next.home_path())?;
        *lock(sandbox)? = moved;
    }
    next.save()?;
    *current = next.clone();
    Ok(next)
}
