import { IndexedDbAdapter, MemoryAdapter, OpfsAdapter, type VfsAdapter } from '@lumen/vfs';
import type { HostConfig, HostProcess, Platform, SystemInfo, SystemMetrics } from './types';

export const KERNEL_VERSION = '0.1.0';

const CONFIG_KEY = 'lumen.host-config';
const bootedAt = Date.now();

interface NavigatorExtras {
  userAgentData?: { platform?: string; brands?: Array<{ brand: string; version: string }> };
  deviceMemory?: number;
}

function pickAdapter(): VfsAdapter {
  if (OpfsAdapter.isSupported()) return new OpfsAdapter();
  if (IndexedDbAdapter.isSupported()) return new IndexedDbAdapter();
  return new MemoryAdapter();
}

function guessOs(): { name: string; version: string; arch: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & NavigatorExtras;
  const platform = nav.userAgentData?.platform ?? nav.platform ?? 'Unknown';
  let name = platform;
  let version = '';
  const win = /Windows NT ([\d.]+)/.exec(ua);
  const mac = /Mac OS X ([\d_]+)/.exec(ua);
  const android = /Android ([\d.]+)/.exec(ua);
  const ios = /OS ([\d_]+) like Mac/.exec(ua);
  if (win) {
    name = 'Windows';
    version = win[1] === '10.0' ? '10/11' : (win[1] ?? '');
  } else if (ios) {
    name = 'iOS';
    version = (ios[1] ?? '').replace(/_/g, '.');
  } else if (mac) {
    name = 'macOS';
    version = (mac[1] ?? '').replace(/_/g, '.');
  } else if (android) {
    name = 'Android';
    version = android[1] ?? '';
  } else if (/Linux/.test(ua)) {
    name = 'Linux';
  }
  const arch = /arm|aarch64/i.test(ua)
    ? 'arm64'
    : /x86_64|Win64|WOW64|x64/i.test(ua)
      ? 'x64'
      : 'unknown';
  return { name, version, arch };
}

/** Simulated host load for the browser build: a slow random walk so graphs move. */
class SimulatedMetrics {
  private cpu = 8;
  private cores: number[];
  private rx = 0;
  private tx = 0;
  constructor(
    private readonly coreCount: number,
    private readonly total: number,
  ) {
    this.cores = Array.from({ length: coreCount }, () => 5 + Math.random() * 10);
  }
  sample(extraLoad = 0): SystemMetrics {
    const drift = (Math.random() - 0.5) * 6;
    this.cpu = clamp(this.cpu + drift, 2, 45) + extraLoad;
    this.cores = this.cores.map((c) => clamp(c + (Math.random() - 0.5) * 12, 1, 80));
    this.rx += Math.floor(Math.random() * 40_000);
    this.tx += Math.floor(Math.random() * 12_000);
    const used = this.total * (0.34 + Math.sin(Date.now() / 60_000) * 0.04);
    return {
      cpu: Math.min(100, Math.round(this.cpu)),
      perCore: this.cores.map((c) => Math.round(c)),
      memory: { total: this.total, used: Math.round(used) },
      disks: [],
      network: { received: this.rx, transmitted: this.tx },
      timestamp: Date.now(),
    };
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function createWebPlatform(appVersion = KERNEL_VERSION): Platform {
  const adapter = pickAdapter();
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & NavigatorExtras;
  const totalMemory = (nav.deviceMemory ?? 8) * 1024 ** 3;
  const sim = new SimulatedMetrics(cores, totalMemory);

  const readConfig = (): HostConfig => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return { ...defaultConfig(), ...(JSON.parse(raw) as Partial<HostConfig>) };
    } catch {
      /* private mode */
    }
    return defaultConfig();
  };

  return {
    kind: 'web',
    capabilities: {
      hostProcesses: false,
      hostFileSystem: false,
      canQuit: false,
      realMetrics: false,
      relocatableHome: false,
    },
    adapter,
    window: {
      async minimize() {},
      async toggleMaximize() {},
      async close() {},
      async setFullscreen(value) {
        try {
          if (value && !document.fullscreenElement)
            await document.documentElement.requestFullscreen();
          else if (!value && document.fullscreenElement) await document.exitFullscreen();
        } catch {
          /* user gesture required */
        }
      },
      async isFullscreen() {
        return Boolean(document.fullscreenElement);
      },
      async setTitle(title) {
        document.title = title;
      },
      async setAlwaysOnTop() {},
    },
    system: {
      async info(): Promise<SystemInfo> {
        const os = guessOs();
        return {
          host: 'web',
          hostname: typeof location === 'undefined' ? 'browser' : location.hostname || 'localhost',
          os,
          kernel: `lumen ${KERNEL_VERSION} (web)`,
          appVersion,
          cpu: { model: `${cores}-core ${os.arch}`, cores },
          memory: { total: totalMemory, available: Math.round(totalMemory * 0.6) },
          uptime: Math.round((Date.now() - bootedAt) / 1000),
          display: {
            width: typeof screen === 'undefined' ? 0 : screen.width,
            height: typeof screen === 'undefined' ? 0 : screen.height,
            scale: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
          },
          userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        };
      },
      async metrics() {
        const m = sim.sample();
        try {
          const est = await navigator.storage?.estimate();
          if (est?.quota) {
            m.disks = [
              {
                name: 'Origin storage',
                mount: '/',
                total: est.quota,
                available: est.quota - (est.usage ?? 0),
                kind: adapter.id,
              },
            ];
          }
        } catch {
          /* unsupported */
        }
        return m;
      },
      async processes(): Promise<HostProcess[]> {
        return [];
      },
      async killProcess() {
        return false;
      },
    },
    shell: {
      async openExternal(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      async revealHome() {},
    },
    config: {
      async get() {
        return readConfig();
      },
      async set(patch) {
        const next = { ...readConfig(), ...patch };
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      },
      async pickHomeDir() {
        return null;
      },
    },
    async quit() {
      location.reload();
    },
    async restart() {
      location.reload();
    },
  };
}

function defaultConfig(): HostConfig {
  return { homeDir: 'origin://lumen-os', fullscreen: false, autostart: false };
}
