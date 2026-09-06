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
pub mod sandbox;
pub mod system;

pub use config::{ConfigPatch, HostConfig};
pub use error::{ErrorCode, KernelError, Result};
pub use fs::{FileKind, FileStat, Usage};
pub use sandbox::Sandbox;
pub use system::{HostProcess, SystemInfo, SystemMetrics, SystemMonitor};

/// Shown in About; the front end reads it from `system_info().kernel`.
pub const KERNEL_VERSION: &str = concat!("lumen ", env!("CARGO_PKG_VERSION"), " (tauri)");
