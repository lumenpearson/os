//! Lumen OS desktop host. Wires `lumen-kernel` to Tauri: plugins, managed
//! state (sandbox, system monitor, host config) and the command table. The
//! commands in `commands/` are thin; every file or system decision is made
//! in the kernel crate, where it is tested without a WebView.

#![forbid(unsafe_code)]
#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]

mod commands;

use std::sync::{Mutex, MutexGuard};

use lumen_kernel::{HostConfig, KernelError, Sandbox, SystemMonitor};
use tauri::Manager;

/// Lock managed state, reporting a poisoned mutex as an error instead of
/// panicking inside a command.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, KernelError> {
    mutex
        .lock()
        .map_err(|_| KernelError::host("host state is poisoned; restart Lumen OS"))
}

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            let mut config = HostConfig::load().unwrap_or_else(|err| {
                eprintln!("lumen: {err}; using default configuration");
                HostConfig::default()
            });
            let sandbox = open_home(&mut config)?;

            if config.fullscreen {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(err) = window.set_fullscreen(true) {
                        eprintln!("lumen: cannot enter fullscreen: {err}");
                    }
                }
            }

            app.manage(Mutex::new(sandbox));
            app.manage(Mutex::new(config));
            app.manage(Mutex::new(SystemMonitor::new()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::fs_stat,
            commands::fs::fs_read_dir,
            commands::fs::fs_read_file,
            commands::fs::fs_write_file,
            commands::fs::fs_mkdir,
            commands::fs::fs_remove,
            commands::fs::fs_rename,
            commands::fs::fs_copy_file,
            commands::fs::fs_usage,
            commands::system::system_info,
            commands::system::system_metrics,
            commands::system::system_processes,
            commands::system::system_kill_process,
            commands::shell::shell_open_external,
            commands::shell::shell_reveal_home,
            commands::shell::app_quit,
            commands::config::config_get,
            commands::config::config_set,
            commands::config::config_pick_home_dir,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = result {
        eprintln!("lumen: cannot start the desktop host: {err}");
        std::process::exit(1);
    }
}

/// Open the configured home directory, creating it if needed. If it cannot
/// be opened (removed drive, permissions) fall back to the default location
/// and persist that so the next start does not repeat the detour.
///
/// See also the configuration test at the end of this file: a plugin entry of
/// the wrong shape stops the host before any of this runs.
fn open_home(config: &mut HostConfig) -> Result<Sandbox, KernelError> {
    match Sandbox::new(config.home_path()) {
        Ok(sandbox) => Ok(sandbox),
        Err(err) => {
            let fallback = HostConfig::default().home_dir;
            eprintln!(
                "lumen: cannot open home {}: {err}; falling back to {fallback}",
                config.home_dir
            );
            config.home_dir = fallback;
            let sandbox = Sandbox::new(config.home_path())?;
            if let Err(err) = config.save() {
                eprintln!("lumen: cannot save configuration: {err}");
            }
            Ok(sandbox)
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    /// The configuration file, as the build reads it.
    fn config() -> Value {
        let raw = include_str!("../tauri.conf.json");
        serde_json::from_str(raw).expect("tauri.conf.json is not valid JSON")
    }

    /// A plugin's entry under `plugins` is deserialised into that plugin's own
    /// configuration type, and a plugin that takes no configuration declares
    /// that type as the unit — for which the only valid JSON is `null`.
    ///
    /// `"window-state": {}` looks like the harmless way to say "on". It is
    /// not: an empty map is a map, the plugin refuses it, `Builder::run`
    /// returns before a window is ever created, and the host exits. Under
    /// `windows_subsystem = "windows"` there is no console for the message to
    /// reach either, so the whole failure is an application that starts and
    /// disappears without so much as an entry in the task manager.
    ///
    /// The settings this plugin does take — the file it saves to, which
    /// properties it restores — are given to its builder in `run`, in Rust.
    #[test]
    fn no_plugin_is_configured_with_a_map_it_cannot_read() {
        let config = config();
        let Some(plugins) = config.get("plugins") else {
            return;
        };
        let plugins = plugins.as_object().expect("`plugins` must be an object");
        for name in ["window-state", "process", "dialog", "opener"] {
            match plugins.get(name) {
                None => {}
                Some(Value::Null) => {}
                Some(other) => panic!(
                    "plugins.{name} is {other}; this plugin takes no configuration, so the \
                     only value it can read is null. Anything else stops the host before it \
                     opens a window."
                ),
            }
        }
    }
}
