//! Native kernel for Lumen OS: a sandboxed view of one host directory, system
//! information from `sysinfo`, and the host configuration file. No Tauri
//! types live here, so the crate builds and tests on any CI runner. The
//! desktop binary in `apps/desktop/src-tauri` only wires these functions to
//! commands.

#![forbid(unsafe_code)]
#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]

pub mod config;
pub mod error;
pub mod fs;
pub mod interface;
pub mod sandbox;
pub mod system;
pub mod webview;

pub use config::{ConfigPatch, HostConfig};
pub use error::{ErrorCode, KernelError, Result};
pub use fs::{FileKind, FileStat, Usage};
pub use interface::{interface_dir, InterfaceState, InterfaceStore, Pointer};
pub use sandbox::Sandbox;
pub use system::{HostProcess, SystemInfo, SystemMetrics, SystemMonitor};
pub use webview::{checked_label, checked_url, sane_zoom, ViewRect, BLANK, VIEW_PREFIX};

/// Shown in About; the front end reads it from `system_info().kernel`.
pub const KERNEL_VERSION: &str = concat!("lumen ", env!("CARGO_PKG_VERSION"), " (tauri)");
