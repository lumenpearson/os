//! System information, live metrics and the host process table over
//! `sysinfo`. `SystemMonitor` keeps one long-lived sampler: CPU percentages
//! come from the delta between two readings, so the first reading is taken
//! when the monitor is created and every later one waits out
//! `MINIMUM_CPU_UPDATE_INTERVAL` if it is called sooner than that.
//!
//! Not every field exists on every host: Linux on ARM has no processor model
//! in `/proc/cpuinfo`, a rolling distribution has no OS version, a container
//! may have no host name, and a disk's kind is unknown wherever the OS will
//! not say. Those are reported as an empty string, which is the shape the
//! System Information app already treats as "unavailable" and prints the
//! reason for. Filling them with a plausible substitute would put an
//! invented value on a spec sheet.

use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::{
    DiskKind, Disks, Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, System,
    MINIMUM_CPU_UPDATE_INTERVAL,
};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: String,
    pub version: String,
    pub arch: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub model: String,
    /// Logical CPUs; matches the length of `SystemMetrics::per_core`.
    pub cores: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total: u64,
    pub available: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub hostname: String,
    pub os: OsInfo,
    pub kernel: String,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    /// Seconds since the host booted.
    pub uptime: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub total: u64,
    pub available: u64,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryUsage {
    pub total: u64,
    pub used: u64,
}

/// Cumulative bytes since boot, summed over every interface.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTotals {
    pub received: u64,
    pub transmitted: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    /// 0–100 across all cores.
    pub cpu: f32,
    pub per_core: Vec<f32>,
    pub memory: MemoryUsage,
    pub disks: Vec<DiskInfo>,
    pub network: NetworkTotals,
    /// Epoch milliseconds when the sample was taken.
    pub timestamp: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostProcess {
    pub pid: u32,
    pub name: String,
    /// 0–100 of total capacity (one core saturated on an eight-core host is
    /// 12.5), so it lines up with `SystemMetrics::cpu`.
    pub cpu: f32,
    /// Resident bytes.
    pub memory: u64,
    pub status: String,
    /// Epoch milliseconds.
    pub started_at: u64,
}

pub struct SystemMonitor {
    system: System,
    networks: Networks,
    disks: Disks,
    cpu_sampled_at: Instant,
}

impl SystemMonitor {
    /// Takes the first CPU sample so the next `metrics()` has a delta.
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();
        Self {
            system,
            networks: Networks::new_with_refreshed_list(),
            disks: Disks::new_with_refreshed_list(),
            cpu_sampled_at: Instant::now(),
        }
    }

    pub fn info(&mut self) -> SystemInfo {
        self.system.refresh_memory();
        let cpus = self.system.cpus();
        let model = reported(cpus.first().map(|c| c.brand().to_owned()));
        SystemInfo {
            hostname: reported(System::host_name()),
            os: OsInfo {
                name: os_name(),
                version: reported(System::os_version()),
                arch: System::cpu_arch(),
            },
            kernel: crate::KERNEL_VERSION.to_owned(),
            cpu: CpuInfo {
                model,
                cores: cpus.len(),
            },
            memory: MemoryInfo {
                total: self.system.total_memory(),
                available: self.system.available_memory(),
            },
            uptime: System::uptime(),
        }
    }

    pub fn metrics(&mut self) -> SystemMetrics {
        self.sample_cpu();
        self.system.refresh_memory();
        self.networks.refresh(true);
        self.disks.refresh(true);

        let per_core: Vec<f32> = self
            .system
            .cpus()
            .iter()
            .map(|c| clamp_pct(c.cpu_usage()))
            .collect();
        let (received, transmitted) = self.networks.list().values().fold((0u64, 0u64), |acc, n| {
            (
                acc.0.saturating_add(n.total_received()),
                acc.1.saturating_add(n.total_transmitted()),
            )
        });
        let disks = self
            .disks
            .list()
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().into_owned(),
                mount: d.mount_point().display().to_string(),
                total: d.total_space(),
                available: d.available_space(),
                kind: disk_kind(d.kind()),
            })
            .collect();

        SystemMetrics {
            cpu: clamp_pct(self.system.global_cpu_usage()),
            per_core,
            memory: MemoryUsage {
                total: self.system.total_memory(),
                used: self.system.used_memory(),
            },
            disks,
            network: NetworkTotals {
                received,
                transmitted,
            },
            timestamp: now_millis(),
        }
    }

    /// Every process the host reports, sorted by pid. CPU shares need two
    /// samples too; the first call after start reports zeros.
    pub fn processes(&mut self) -> Vec<HostProcess> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        let cores = self.system.cpus().len().max(1) as f32;
        let mut out: Vec<HostProcess> = self
            .system
            .processes()
            .values()
            .map(|p| HostProcess {
                pid: p.pid().as_u32(),
                name: p.name().to_string_lossy().into_owned(),
                cpu: clamp_pct(p.cpu_usage() / cores),
                memory: p.memory(),
                status: p.status().to_string(),
                started_at: p.start_time().saturating_mul(1000),
            })
            .collect();
        out.sort_by_key(|p| p.pid);
        out
    }

    /// Ask the OS to terminate `pid`. The host's own process is refused;
    /// `app_quit` is the way to leave. Returns whether the signal was sent.
    pub fn kill_process(&mut self, pid: u32) -> bool {
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let target = Pid::from_u32(pid);
        self.system
            .refresh_processes(ProcessesToUpdate::Some(&[target]), true);
        self.system.process(target).is_some_and(|p| p.kill())
    }

    fn sample_cpu(&mut self) {
        let elapsed = self.cpu_sampled_at.elapsed();
        if elapsed < MINIMUM_CPU_UPDATE_INTERVAL {
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL - elapsed);
        }
        self.system.refresh_cpu_usage();
        self.cpu_sampled_at = Instant::now();
    }
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// A value the host may not have: trimmed, or empty when there is none.
fn reported(value: Option<String>) -> String {
    value.map(|v| v.trim().to_owned()).unwrap_or_default()
}

/// The product name of the running OS.
///
/// `System::name()` answers the kernel's name, which on macOS is `Darwin`,
/// while `os_version()` there is the macOS product version — 15.4, not
/// Darwin's 24.4.0. Printing the two together would name a version that
/// belongs to neither, so Darwin is reported as the product built on it.
/// Windows and Linux already answer with a product or distribution name. If
/// the host answers nothing, the build target is still a fact.
fn os_name() -> String {
    match reported(System::name()).as_str() {
        "Darwin" => "macOS".to_owned(),
        "" => match std::env::consts::OS {
            "macos" => "macOS".to_owned(),
            "windows" => "Windows".to_owned(),
            "linux" => "Linux".to_owned(),
            other => other.to_owned(),
        },
        name => name.to_owned(),
    }
}

/// `SSD` or `HDD` where the OS says so. macOS reports neither for a disk
/// image, and no host reports it for a network mount, so the rest is empty
/// rather than the word "Unknown".
fn disk_kind(kind: DiskKind) -> String {
    match kind {
        DiskKind::SSD | DiskKind::HDD => kind.to_string(),
        _ => String::new(),
    }
}

fn clamp_pct(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_has_the_fixed_fields() {
        let mut monitor = SystemMonitor::new();
        let info = monitor.info();
        assert_eq!(info.kernel, crate::KERNEL_VERSION);
        assert!(info.cpu.cores >= 1);
        assert!(info.memory.total > 0);
        assert!(!info.os.arch.is_empty());
        // Every host names itself, even if only from the build target.
        assert!(!info.os.name.is_empty());
        // The rest may be missing; what they must not be is padded.
        for field in [&info.hostname, &info.os.version, &info.cpu.model] {
            assert_eq!(field, field.trim());
        }
    }

    #[test]
    fn missing_values_are_empty_rather_than_invented() {
        assert_eq!(reported(None), "");
        assert_eq!(reported(Some("  ".to_owned())), "");
        assert_eq!(reported(Some("  Intel  ".to_owned())), "Intel");
        assert_eq!(disk_kind(DiskKind::Unknown(-1)), "");
        assert_eq!(disk_kind(DiskKind::SSD), "SSD");
        assert_eq!(disk_kind(DiskKind::HDD), "HDD");
    }

    #[test]
    fn the_os_is_named_after_the_product_not_the_kernel() {
        let name = os_name();
        assert!(!name.is_empty());
        // `System::name()` is "Darwin" on macOS, where the version reported
        // beside it is macOS's, so the two have to agree on the product.
        assert_ne!(name, "Darwin");
        if cfg!(target_os = "macos") {
            assert_eq!(name, "macOS");
        }
    }

    #[test]
    fn metrics_are_in_range() {
        let mut monitor = SystemMonitor::new();
        let m = monitor.metrics();
        assert!((0.0..=100.0).contains(&m.cpu));
        assert!(!m.per_core.is_empty());
        assert!(m.per_core.iter().all(|c| (0.0..=100.0).contains(c)));
        assert!(m.memory.total >= m.memory.used);
        assert!(m.timestamp > 0);
        let again = monitor.metrics();
        assert!(again.timestamp >= m.timestamp);
    }

    #[test]
    fn processes_include_this_one_and_serialise_camel_case() {
        let mut monitor = SystemMonitor::new();
        let list = monitor.processes();
        let me = std::process::id();
        let mine = list
            .iter()
            .find(|p| p.pid == me)
            .expect("own process listed");
        assert!(!mine.name.is_empty());
        assert!((0.0..=100.0).contains(&mine.cpu));
        let json = serde_json::to_value(mine).unwrap();
        assert!(json.get("startedAt").is_some());
        assert!(list.windows(2).all(|w| w[0].pid <= w[1].pid));
    }

    #[test]
    fn kill_refuses_self_and_zero() {
        let mut monitor = SystemMonitor::new();
        assert!(!monitor.kill_process(0));
        assert!(!monitor.kill_process(std::process::id()));
    }

    #[test]
    fn percentages_are_clamped() {
        assert_eq!(clamp_pct(-1.0), 0.0);
        assert_eq!(clamp_pct(250.0), 100.0);
        assert_eq!(clamp_pct(f32::NAN), 0.0);
        assert_eq!(clamp_pct(42.5), 42.5);
    }
}
