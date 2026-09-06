import type { AccentId } from '@lumen/tokens';
import type { ScreensaverId } from '../desktop/screensavers';

export type { ScreensaverId };

export type ThemeMode = 'light' | 'dark' | 'auto';
export type DockPosition = 'bottom' | 'left' | 'right';
export type FilesView = 'list' | 'grid' | 'columns' | 'cards';
export type MinimizeAnimation = 'scale' | 'slide' | 'fade' | 'none';
export type WallpaperFit = 'cover' | 'contain' | 'tile' | 'center';
export type CursorStyle = 'lumen' | 'classic' | 'native';
export type DateFormat = 'auto' | 'iso' | 'us' | 'eu';

export interface Settings {
  appearance: {
    theme: ThemeMode;
    accent: AccentId;
    contrast: 'normal' | 'high';
    reduceMotion: boolean;
    reduceTransparency: boolean;
    /** 0.9 – 1.3 multiplier on the UI font size. */
    fontScale: number;
    /** Blur behind menus, sheets and panels, in px. 0 leaves them opaque. */
    blur: number;
  };
  /**
   * Motion, by the thing that moves. Every switch is independent, so someone
   * who wants still windows and live menus can have that; `speed` scales what
   * is left, and 0 turns the lot off.
   */
  animation: {
    /** 0 – 1.5 multiplier on every duration token. */
    speed: number;
    /** Windows opening, closing and zooming. */
    windows: boolean;
    minimize: MinimizeAnimation;
    /** Menus, popovers and the start menu. */
    menus: boolean;
    dialogs: boolean;
    /** Taskbar, system bar and the control centre. */
    panels: boolean;
    /** Moving between views inside an app. */
    pages: boolean;
    /** The cursor's answer to a click. */
    press: boolean;
    /** Smoothing on a window being dragged. Off: the window tracks the hand. */
    windowMove: boolean;
  };
  /** How a window behaves at the edges of the screen. */
  windows: {
    /** Full screen hides the title bar, the way macOS does. */
    fullscreenHidesTitleBar: boolean;
    /** The system bar slides away and comes back on approach. */
    immersiveSystemBar: boolean;
    /** The taskbar does the same. */
    immersiveTaskbar: boolean;
    /** Full screen covers the panels rather than stopping at them. */
    fullscreenCoversPanels: boolean;
    /** Gap between tiled windows, in px. */
    tilingGap: number;
  };
  desktop: {
    /** Preset id ("preset:dawn") or a VFS path to an image. */
    wallpaper: string;
    wallpaperFit: WallpaperFit;
    showIcons: boolean;
    iconSize: 'small' | 'medium' | 'large';
    sortBy: 'name' | 'kind' | 'date';
    /** Menubar and desktop tint derived from the wallpaper. */
    dynamicChrome: boolean;
  };
  taskbar: {
    position: DockPosition;
    /** Icon size in px. */
    size: number;
    autoHide: boolean;
    magnify: boolean;
    pinned: string[];
    showRecents: boolean;
    showLabels: boolean;
    centered: boolean;
    /** Detached from the edge, with a margin around it. */
    floating: boolean;
    /**
     * What the bar carries, in order. Ids the shell knows: 'start', 'search',
     * 'windows', 'pinned', 'frequent', 'weather', 'news', 'trash', 'clock'.
     */
    items: string[];
  };
  menubar: {
    showClock: boolean;
    clock24h: boolean;
    showSeconds: boolean;
    showDate: boolean;
    showDayOfWeek: boolean;
    showBattery: boolean;
    showNetwork: boolean;
    showSound: boolean;
    showUser: boolean;
  };
  display: {
    /** 0.75 – 1.75 */
    scale: number;
    /** Snap windows to edges while dragging. */
    snapping: boolean;
    /** Window shadows on/off (for weak machines). */
    shadows: boolean;
    /** Show a small overlay with FPS and memory. */
    performanceOverlay: boolean;
  };
  lock: {
    /** 0 = never. Minutes of idle before the screen locks. */
    autoLockMinutes: number;
    /** 0 = never. Minutes of idle before the screensaver starts. */
    screensaverMinutes: number;
    screensaver: ScreensaverId;
    requirePasswordOnWake: boolean;
    showHint: boolean;
    showClock: boolean;
    /** Text shown on the lock screen (e.g. "If found, call…"). */
    message: string;
  };
  sound: {
    volume: number;
    muted: boolean;
    uiSounds: boolean;
    startupSound: boolean;
  };
  notifications: {
    doNotDisturb: boolean;
    showPreviews: boolean;
    sound: boolean;
    /** Banner duration in ms. */
    duration: number;
    /** Apps muted by id. */
    muted: string[];
  };
  region: {
    locale: string;
    timeZone: string;
    firstDayOfWeek: 0 | 1;
    dateFormat: DateFormat;
    temperature: 'c' | 'f';
    measurement: 'metric' | 'imperial';
  };
  keyboard: {
    /** User overrides of global shortcuts, action id → keys. */
    shortcuts: Record<string, string>;
    /** Mod = Ctrl or Meta, so Windows and macOS keyboards both feel native. */
    modifier: 'auto' | 'ctrl' | 'meta';
  };
  cursor: {
    style: CursorStyle;
    /** 1 – 2 */
    size: number;
    /** 'auto' picks by theme; otherwise 'light' | 'dark'. */
    color: 'auto' | 'light' | 'dark';
    /** Motion trail behind the cursor. */
    trail: boolean;
  };
  files: {
    showHidden: boolean;
    showExtensions: boolean;
    defaultView: FilesView;
    /** Folder opened by new Files windows. */
    home: string;
    confirmDelete: boolean;
    singleClickOpen: boolean;
    /** Folders before files, or sorted together. */
    foldersFirst: boolean;
  };
  network: {
    wifi: boolean;
    bluetooth: boolean;
    airplane: boolean;
    /** Simulated network name. */
    ssid: string;
  };
  power: {
    /** 0 = never. */
    sleepAfterMinutes: number;
    lowPowerMode: boolean;
  };
  privacy: {
    /** Keep a Recents list. */
    recents: boolean;
    /** Keep the session log. */
    logging: boolean;
  };
  /**
   * Updates for packages installed from the store. There is no channel here
   * because there is one catalogue: a Stable/Beta control with nothing behind
   * it was a choice the system could not honour. The system's own version is
   * whichever build it is running.
   */
  updates: {
    /** Install a newer version as soon as a check finds one. */
    automatic: boolean;
    /** When the store was last checked, in epoch milliseconds. */
    lastChecked: number | null;
  };
  /**
   * Where the package catalogue is fetched from. The store is a directory of
   * static files, so this is a base URL and nothing more: a relative path is
   * served by whatever host serves Lumen itself, and an absolute one points at
   * a store deployed on its own. Moving the store between hosts is this one
   * setting.
   */
  store: {
    origin: string;
    /** Refresh the catalogue on its own, rather than only when asked. */
    autoSync: boolean;
    /** Minutes between refreshes. 0 leaves it to the Refresh button. */
    syncMinutes: number;
    /** When the catalogue was last fetched, so a stale one can be shown as such. */
    lastSync: number | null;
  };
  setup: {
    completed: boolean;
    /** Version that ran the setup, for migrations. */
    version: string;
    completedAt: number | null;
  };
}

/**
 * The published catalogue: its own repository, deployed on its own, fetched
 * live. Changing this one setting points Lumen at a different store.
 */
export const DEFAULT_STORE_ORIGIN =
  'https://raw.githubusercontent.com/lumenpearson/os-appstore/main/';

/**
 * The copy that ships beside the OS, used when the published one cannot be
 * reached. It is the same catalogue as of the build, so an aeroplane still has
 * a storefront — just not a current one.
 */
export const BUNDLED_STORE_ORIGIN = '/store/';

export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  const tz = safeTimeZone();
  return {
    appearance: {
      theme: 'auto',
      accent: 'blue',
      contrast: 'normal',
      reduceMotion: prefersReducedMotion(),
      reduceTransparency: false,
      fontScale: 1,
      blur: 14,
    },
    animation: {
      speed: 1,
      windows: true,
      minimize: 'scale',
      menus: true,
      dialogs: true,
      panels: true,
      pages: true,
      press: true,
      // A window being dragged goes where the hand goes: smoothing there reads
      // as lag, not as polish.
      windowMove: false,
    },
    windows: {
      fullscreenHidesTitleBar: true,
      immersiveSystemBar: true,
      immersiveTaskbar: true,
      fullscreenCoversPanels: true,
      tilingGap: 0,
    },
    desktop: {
      wallpaper: 'preset:dawn',
      wallpaperFit: 'cover',
      showIcons: true,
      iconSize: 'medium',
      sortBy: 'name',
      dynamicChrome: true,
    },
    taskbar: {
      position: 'bottom',
      size: 44,
      autoHide: false,
      magnify: false,
      pinned: ['lumen.files', 'lumen.browser', 'lumen.terminal', 'lumen.notes', 'lumen.settings'],
      showRecents: true,
      showLabels: false,
      centered: true,
      floating: false,
      items: ['start', 'search', 'windows', 'pinned', 'frequent', 'trash'],
    },
    menubar: {
      showClock: true,
      clock24h: false,
      showSeconds: false,
      showDate: true,
      showDayOfWeek: true,
      showBattery: true,
      showNetwork: true,
      showSound: true,
      showUser: false,
    },
    display: { scale: 1, snapping: true, shadows: true, performanceOverlay: false },
    lock: {
      autoLockMinutes: 15,
      screensaverMinutes: 10,
      screensaver: 'clock',
      requirePasswordOnWake: true,
      showHint: true,
      showClock: true,
      message: '',
    },
    sound: { volume: 0.7, muted: false, uiSounds: true, startupSound: true },
    notifications: {
      doNotDisturb: false,
      showPreviews: true,
      sound: true,
      duration: 6000,
      muted: [],
    },
    region: {
      locale: safeLocale(),
      timeZone: tz,
      firstDayOfWeek: 1,
      dateFormat: 'auto',
      temperature: 'c',
      measurement: 'metric',
    },
    keyboard: { shortcuts: {}, modifier: 'auto' },
    cursor: { style: 'lumen', size: 1, color: 'auto', trail: false },
    files: {
      showHidden: false,
      showExtensions: true,
      defaultView: 'list',
      home: '',
      confirmDelete: true,
      singleClickOpen: false,
      foldersFirst: true,
    },
    network: { wifi: true, bluetooth: false, airplane: false, ssid: 'Lumen Wi-Fi' },
    power: { sleepAfterMinutes: 0, lowPowerMode: false },
    privacy: { recents: true, logging: true },
    updates: { automatic: true, lastChecked: null },
    store: { origin: DEFAULT_STORE_ORIGIN, autoSync: true, syncMinutes: 360, lastSync: null },
    setup: { completed: false, version: '0.1.0', completedAt: null },
  };
}

/**
 * The system's motion preference, read once for the first-run defaults. After
 * that the stored value wins, so someone who turns the switch off keeps full
 * motion even on a machine that asks for less.
 */
function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function safeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function safeLocale(): string {
  try {
    return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  } catch {
    return 'en-US';
  }
}

/** Deep-merge a stored (possibly older / partial) settings object over the defaults. */
export function mergeSettings(stored: unknown): Settings {
  const base = defaultSettings();
  if (!stored || typeof stored !== 'object') return base;
  return deepMerge(
    base as unknown as Record<string, unknown>,
    stored as Record<string, unknown>,
  ) as unknown as Settings;
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue;
    const current = base[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else if (acceptsLeaf(current, value)) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Whether a stored leaf may replace its default.
 *
 * Comparing `typeof` alone is wrong wherever the default is `null`, because
 * `typeof null` is 'object': a stored number would be judged the wrong shape
 * and thrown away, so a setting like `updates.lastChecked` could never survive
 * a reload. A null default means "not set yet", and any primitive — or null
 * again — is a legitimate value for it.
 */
function acceptsLeaf(current: unknown, value: unknown): boolean {
  if (current === null) return value === null || typeof value !== 'object';
  if (Array.isArray(current)) return Array.isArray(value);
  return typeof current === typeof value && typeof value !== 'object';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
