import type { VfsAdapter } from '@lumen/vfs';

export type PlatformKind = 'web' | 'tauri';

export interface SystemInfo {
  host: PlatformKind;
  hostname: string;
  os: { name: string; version: string; arch: string };
  /** Lumen kernel version string shown in About. */
  kernel: string;
  appVersion: string;
  cpu: { model: string; cores: number };
  memory: { total: number; available: number };
  /** Seconds since the host booted (web: since the page loaded). */
  uptime: number;
  /** Physical screen in CSS pixels and the device pixel ratio. */
  display: { width: number; height: number; scale: number };
  userAgent: string;
}

export interface DiskInfo {
  name: string;
  mount: string;
  total: number;
  available: number;
  kind: string;
}

export interface SystemMetrics {
  /** 0–100 */
  cpu: number;
  perCore: number[];
  memory: { total: number; used: number };
  disks: DiskInfo[];
  network: { received: number; transmitted: number };
  timestamp: number;
}

export interface HostProcess {
  pid: number;
  name: string;
  /** 0–100 */
  cpu: number;
  /** bytes */
  memory: number;
  status: string;
  startedAt: number;
}

export interface HostConfig {
  /** Host path of the Lumen OS home directory (desktop only). */
  homeDir: string;
  /** Start the desktop maximised / fullscreen. */
  fullscreen: boolean;
  /** Open at login (desktop only). */
  autostart: boolean;
}

export interface PlatformWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  setFullscreen(value: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  /** Keep the OS in front of other host windows (desktop only). */
  setAlwaysOnTop(value: boolean): Promise<void>;
}

export interface PlatformCapabilities {
  /** Task Manager can list real host processes. */
  hostProcesses: boolean;
  /** Files live in a real directory on disk. */
  hostFileSystem: boolean;
  /** The host window can be closed from inside the OS (Shut Down). */
  canQuit: boolean;
  /** Real CPU / memory / disk numbers. */
  realMetrics: boolean;
  /** Can move the home directory (Settings → Storage). */
  relocatableHome: boolean;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly capabilities: PlatformCapabilities;
  /** Storage adapter the kernel wraps in a `Vfs`. */
  readonly adapter: VfsAdapter;
  readonly window: PlatformWindow;
  system: {
    info(): Promise<SystemInfo>;
    metrics(): Promise<SystemMetrics>;
    processes(): Promise<HostProcess[]>;
    killProcess(pid: number): Promise<boolean>;
  };
  shell: {
    /** Open a URL in the host's default browser. */
    openExternal(url: string): Promise<void>;
    /** Reveal the home directory in the host file manager (desktop only). */
    revealHome(): Promise<void>;
  };
  config: {
    get(): Promise<HostConfig>;
    set(patch: Partial<HostConfig>): Promise<HostConfig>;
    /** Ask the host for a directory and move the home there. Returns the new path or null. */
    pickHomeDir(): Promise<string | null>;
  };
  /** Exit the host application (desktop) or reload the page (web). */
  quit(): Promise<void>;
  /** Reload the OS front end. */
  restart(): Promise<void>;
}
