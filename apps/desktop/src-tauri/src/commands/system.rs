//! `system_*` commands over the shared `SystemMonitor`.

use std::sync::Mutex;

use lumen_kernel::{HostProcess, KernelError, SystemInfo, SystemMetrics, SystemMonitor};
use tauri::State;

use crate::lock;

type Monitor<'a> = State<'a, Mutex<SystemMonitor>>;

#[tauri::command]
pub async fn system_info(monitor: Monitor<'_>) -> Result<SystemInfo, KernelError> {
    Ok(lock(&monitor)?.info())
}

#[tauri::command]
pub async fn system_metrics(monitor: Monitor<'_>) -> Result<SystemMetrics, KernelError> {
    Ok(lock(&monitor)?.metrics())
}

#[tauri::command]
pub async fn system_processes(monitor: Monitor<'_>) -> Result<Vec<HostProcess>, KernelError> {
    Ok(lock(&monitor)?.processes())
}

#[tauri::command]
pub async fn system_kill_process(pid: u32, monitor: Monitor<'_>) -> Result<bool, KernelError> {
    Ok(lock(&monitor)?.kill_process(pid))
}
