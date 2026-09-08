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
  /**
   * The host can put a real web view inside its own window, which is how the
   * browser app opens a site that refuses to be framed.
   */
  pageViews: boolean;
}

/** Where a page view sits inside the host window, in interface pixels. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What an open page view reports back. */
export interface PageReport {
  /** The tab the view belongs to. Empty for a popup, which has no view yet. */
  id: string;
  kind: 'started' | 'loaded' | 'title' | 'popup';
  url: string;
  title?: string;
}

/**
 * Real web views, one per browser tab, drawn inside the host window over the
 * rectangle the browser app reserves for the page.
 *
 * The view is a native surface: it is painted above the interface rather than
 * inside it, and it cannot be clipped by anything the interface draws. Where
 * it goes and whether it is on screen at all are therefore the caller's
 * business, and `place` is how both are said.
 */
export interface PlatformPages {
  /** Open a view for a tab, or point the open one at another address. */
  open(id: string, url: string, rect: PageRect, visible: boolean): Promise<void>;
  navigate(id: string, url: string): Promise<void>;
  /** Move, resize, show or hide. Called on every frame a window moves. */
  place(id: string, rect: PageRect, visible: boolean): Promise<void>;
  zoom(id: string, factor: number): Promise<void>;
  reload(id: string): Promise<void>;
  close(id: string): Promise<void>;
  /** Every view, for a browser window that is closing. */
  closeAll(): Promise<void>;
  /** Listen to what the open views are doing. Resolves to the unsubscribe. */
  listen(handler: (report: PageReport) => void): Promise<() => void>;
}

/**
 * Which interface is running, and which binary is under it.
 *
 * Two numbers rather than one because a patch moves only the interface. A
 * release that needs the binary has to say so, and it can only say so if both
 * are visible.
 */
export interface InterfaceState {
  /** The applied version, or null when the copy inside the binary is live. */
  version: string | null;
  /** The host binary's version. No patch can change this. */
  host: string;
  previous: string | null;
  /** Set when the last start gave up a version that never reported. */
  rolledBackFrom: string | null;
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
  /** Real web views for the browser app. Absent capability means no-ops. */
  pages: PlatformPages;
  interface: {
    /** Which interface is running, and which binary is under it. */
    state(): Promise<InterfaceState>;
    /**
     * Report that the interface drew itself. Until this arrives the live
     * version is on probation and the next start would give it up.
     */
    ready(): Promise<void>;
  };
  /** Exit the host application (desktop) or reload the page (web). */
  quit(): Promise<void>;
  /** Reload the OS front end. */
  restart(): Promise<void>;
}
