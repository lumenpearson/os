//! Host configuration: where the home directory lives and how the window
//! starts. Stored as JSON at `<config dir>/LumenOS/config.json`, which
//! `dirs` places per platform:
//!
//! | Host    | Configuration file                                         |
//! | ------- | ---------------------------------------------------------- |
//! | Windows | `%APPDATA%\LumenOS\config.json`                             |
//! | macOS   | `~/Library/Application Support/LumenOS/config.json`         |
//! | Linux   | `$XDG_CONFIG_HOME/LumenOS/config.json`, else `~/.config/…`  |
//!
//! Missing files and missing fields fall back to defaults; a corrupt file is
//! an error the host reports and then ignores so the desktop still boots.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{KernelError, Result};

/// Folder name under the platform data and config directories.
pub const APP_DIR: &str = "LumenOS";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HostConfig {
    /// Absolute host path backing the VFS root.
    pub home_dir: String,
    /// Start the window fullscreen.
    pub fullscreen: bool,
    /// Open at login. Persisted only; the host wires it when it supports it.
    pub autostart: bool,
}

/// `Partial<HostConfig>` from the front end.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigPatch {
    pub home_dir: Option<String>,
    pub fullscreen: Option<bool>,
    pub autostart: Option<bool>,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            home_dir: default_home_dir().to_string_lossy().into_owned(),
            fullscreen: false,
            autostart: false,
        }
    }
}

/// `<local data dir>/LumenOS/home`: `%LOCALAPPDATA%\LumenOS\home` on
/// Windows, `~/Library/Application Support/LumenOS/home` on macOS,
/// `$XDG_DATA_HOME/LumenOS/home` (usually `~/.local/share/…`) on Linux.
/// Settings → Storage moves it anywhere the user can write.
pub fn default_home_dir() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .map(|d| d.join(APP_DIR).join("home"))
        .unwrap_or_else(|| PathBuf::from(APP_DIR).join("home"))
}

pub fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join(APP_DIR).join("config.json"))
}

impl HostConfig {
    pub fn load() -> Result<Self> {
        match config_path() {
            Some(path) => Self::load_from(&path),
            None => Ok(Self::default()),
        }
    }

    pub fn load_from(path: &Path) -> Result<Self> {
        let display = path.display().to_string();
        match fs::read(path) {
            Ok(bytes) => {
                let mut config: Self = serde_json::from_slice(&bytes).map_err(|e| {
                    KernelError::host(format!("config at {display} is invalid: {e}"))
                })?;
                if config.home_dir.trim().is_empty() {
                    config.home_dir = Self::default().home_dir;
                }
                Ok(config)
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(KernelError::io(&e, Some(&display))),
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()
            .ok_or_else(|| KernelError::host("no configuration directory on this host"))?;
        self.save_to(&path)
    }

    pub fn save_to(&self, path: &Path) -> Result<()> {
        let display = path.display().to_string();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| KernelError::io(&e, Some(&display)))?;
        }
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| KernelError::host(format!("cannot encode config: {e}")))?;
        fs::write(path, json).map_err(|e| KernelError::io(&e, Some(&display)))
    }

    /// Apply a patch. Returns `true` when the home directory changed, which
    /// is the caller's cue to re-point the sandbox. The new home must be an
    /// absolute path; it is not created here.
    pub fn merge(&mut self, patch: ConfigPatch) -> Result<bool> {
        let mut home_changed = false;
        if let Some(home) = patch.home_dir {
            let home = home.trim();
            if home.is_empty() {
                return Err(KernelError::invalid(home, "home directory path is empty"));
            }
            if !Path::new(home).is_absolute() {
                return Err(KernelError::invalid(
                    home,
                    "home directory must be an absolute path",
                ));
            }
            if home != self.home_dir {
                self.home_dir = home.to_owned();
                home_changed = true;
            }
        }
        if let Some(fullscreen) = patch.fullscreen {
            self.fullscreen = fullscreen;
        }
        if let Some(autostart) = patch.autostart {
            self.autostart = autostart;
        }
        Ok(home_changed)
    }

    pub fn home_path(&self) -> PathBuf {
        PathBuf::from(&self.home_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn absolute(dir: &tempfile::TempDir, name: &str) -> String {
        dir.path().join(name).to_string_lossy().into_owned()
    }

    #[test]
    fn defaults_point_under_the_app_dir() {
        let config = HostConfig::default();
        assert!(config
            .home_dir
            .ends_with(&format!("{APP_DIR}{}home", std::path::MAIN_SEPARATOR)));
        assert!(!config.fullscreen);
        assert!(!config.autostart);
    }

    #[test]
    fn missing_file_yields_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = HostConfig::load_from(&dir.path().join("none.json")).unwrap();
        assert_eq!(loaded, HostConfig::default());
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("config.json");
        let config = HostConfig {
            home_dir: absolute(&dir, "home"),
            fullscreen: true,
            autostart: true,
        };
        config.save_to(&path).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"homeDir\""));
        assert!(text.contains("\"fullscreen\": true"));
        assert_eq!(HostConfig::load_from(&path).unwrap(), config);
    }

    #[test]
    fn partial_and_corrupt_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, b"{\"fullscreen\": true}").unwrap();
        let loaded = HostConfig::load_from(&path).unwrap();
        assert!(loaded.fullscreen);
        assert_eq!(loaded.home_dir, HostConfig::default().home_dir);

        fs::write(&path, b"{\"homeDir\": \"  \"}").unwrap();
        assert_eq!(
            HostConfig::load_from(&path).unwrap().home_dir,
            HostConfig::default().home_dir
        );

        fs::write(&path, b"not json").unwrap();
        assert_eq!(
            HostConfig::load_from(&path).unwrap_err().code,
            ErrorCode::Ehost
        );
    }

    #[test]
    fn merge_reports_home_changes_and_validates() {
        let dir = tempfile::tempdir().unwrap();
        let mut config = HostConfig::default();
        let home = absolute(&dir, "home");

        let changed = config
            .merge(ConfigPatch {
                home_dir: Some(home.clone()),
                fullscreen: Some(true),
                autostart: None,
            })
            .unwrap();
        assert!(changed);
        assert_eq!(config.home_dir, home);
        assert!(config.fullscreen);
        assert!(!config.autostart);

        let same = config
            .merge(ConfigPatch {
                home_dir: Some(format!("  {home}  ")),
                ..Default::default()
            })
            .unwrap();
        assert!(!same);

        let unchanged = config
            .merge(ConfigPatch {
                autostart: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert!(!unchanged);
        assert!(config.autostart);

        let err = config
            .merge(ConfigPatch {
                home_dir: Some("relative/home".into()),
                ..Default::default()
            })
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::Einval);
        let err = config
            .merge(ConfigPatch {
                home_dir: Some("   ".into()),
                ..Default::default()
            })
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::Einval);
        assert_eq!(config.home_dir, home);
    }

    #[test]
    fn patch_deserialises_partial_objects() {
        let patch: ConfigPatch = serde_json::from_str("{\"fullscreen\": false}").unwrap();
        assert_eq!(
            patch,
            ConfigPatch {
                fullscreen: Some(false),
                ..Default::default()
            }
        );
        let patch: ConfigPatch = serde_json::from_str("{}").unwrap();
        assert_eq!(patch, ConfigPatch::default());
    }
}
