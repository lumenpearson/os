/**
 * Every reading this app can take, and the reason it cannot take the ones it
 * cannot. A probe returns a `Fact`: either a value read from the running
 * system, or `available: false` with one line explaining why this platform
 * does not report it. Nothing here estimates, extrapolates or fills in a
 * plausible number — an invented figure would make the whole sheet worthless.
 *
 * The pure probes take the object they read (a navigator, a screen, a WebGL
 * context) so tests can pass a stub. The `read*` functions at the bottom are
 * the thin layer that hands them the real globals.
 */

import { formatBytes } from '@lumen/vfs';

export interface Fact {
  /** The reading, formatted for display. Empty when unavailable. */
  value: string;
  available: boolean;
  /** Why this platform cannot report the value. Set when unavailable. */
  reason?: string;
}

/** Printed in place of every value that could not be read. */
export const NO_VALUE = '—';

export function known(value: string): Fact {
  return { value: value.trim(), available: true };
}

export function unknown(reason: string): Fact {
  return { value: '', available: false, reason };
}

/** A value that may be missing, with the reason to print if it is. */
export function maybe(value: string | number | null | undefined, reason: string): Fact {
  if (value === null || value === undefined) return unknown(reason);
  const text = String(value).trim();
  return text.length === 0 ? unknown(reason) : known(text);
}

/** Bytes, or the reason there is no number. */
export function bytesFact(value: number | null | undefined, reason: string): Fact {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return unknown(reason);
  return known(formatBytes(value));
}

// ── shapes of the objects the probes read ─────────────────────────────────

export interface UserAgentBrand {
  brand: string;
  version: string;
}

export interface UserAgentDataLike {
  brands?: readonly UserAgentBrand[];
  platform?: string;
  mobile?: boolean;
}

export interface NavigatorLike {
  userAgent?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  language?: string;
  languages?: readonly string[];
  userAgentData?: UserAgentDataLike;
}

export interface ScreenLike {
  width?: number;
  height?: number;
  colorDepth?: number;
}

export type MatchMediaLike = (query: string) => { matches: boolean };

export interface HeapLike {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

/** High-entropy user-agent client hints; Chromium only, and only on request. */
export interface UaHints {
  architecture?: string;
  bitness?: string;
  platformVersion?: string;
  model?: string;
}

export interface ProbeEnv {
  navigator?: NavigatorLike;
  screen?: ScreenLike;
  devicePixelRatio?: number;
  matchMedia?: MatchMediaLike;
  heap?: HeapLike;
  dateTimeFormat?: Intl.ResolvedDateTimeFormatOptions;
  /** `Date#getTimezoneOffset()`: minutes behind UTC. */
  timeZoneOffsetMinutes?: number;
}

// ── reasons, written once so the same gap reads the same everywhere ───────

export const REASONS = {
  noNavigator: 'There is no navigator object in this runtime.',
  noScreen: 'There is no screen object in this runtime.',
  noMatchMedia: 'window.matchMedia is unavailable in this runtime.',
  cores: 'This browser does not report navigator.hardwareConcurrency.',
  deviceMemory: 'navigator.deviceMemory is exposed by Chromium browsers only.',
  cpuModel: 'Browsers do not expose the processor model. The desktop build reads it from the host.',
  architecture:
    'Only Chromium reports the CPU architecture, through user-agent client hints on a secure origin.',
  installedMemory:
    'Browsers do not report installed memory. The desktop build reads it from the host.',
  heap: 'performance.memory is a Chromium extension; other browsers do not expose the JS heap.',
  hostname: "Browsers do not expose the computer's name.",
  hostPlatform:
    'This browser does not implement navigator.userAgentData, and the user-agent string is frozen, so the host version cannot be read from it.',
  hostUptime: 'Browsers cannot see how long the computer has been running.',
  webgl: 'A WebGL context could not be created, so the renderer cannot be read.',
  debugRenderer:
    'WEBGL_debug_renderer_info is not exposed here; browsers often withhold it to limit fingerprinting.',
  storage: 'Neither the Storage API nor the file-system adapter reported a figure.',
  quota: 'This host does not report a storage quota.',
  browser: 'The user-agent string does not name a browser.',
  engine: 'The user-agent string does not name a rendering engine.',
  intl: 'Intl.DateTimeFormat did not resolve a locale in this runtime.',
  timeZone: 'Intl.DateTimeFormat did not resolve a time zone in this runtime.',
  tauriVersion:
    'The desktop bridge does not report the Tauri version; system_info returns the Lumen kernel version only.',
  rustVersion: 'The desktop bridge does not report the Rust toolchain version.',
  platformBridge: 'The platform bridge did not answer.',
  stateFile: '/System/state.json has not been written yet, so there is no earlier total.',
} as const;

// ── processor ─────────────────────────────────────────────────────────────

export function probeCores(navigator: NavigatorLike | undefined): Fact {
  if (!navigator) return unknown(REASONS.noNavigator);
  const cores = navigator.hardwareConcurrency;
  if (typeof cores !== 'number' || !Number.isFinite(cores) || cores <= 0) {
    return unknown(REASONS.cores);
  }
  return known(String(Math.round(cores)));
}

/**
 * The host architecture, from `sysinfo` on the desktop or from user-agent
 * client hints in Chromium. The user-agent string is never parsed for it:
 * its platform tokens are frozen and say nothing about the real CPU.
 */
export function probeArchitecture(
  hostArch: string | null | undefined,
  hints: UaHints | null,
): Fact {
  if (hostArch?.trim() && hostArch !== 'unknown') return known(hostArch);
  const architecture = hints?.architecture?.trim();
  if (!architecture) return unknown(REASONS.architecture);
  const bitness = hints?.bitness?.trim();
  return known(bitness ? `${architecture}-${bitness}` : architecture);
}

// ── memory ────────────────────────────────────────────────────────────────

export function probeDeviceMemory(navigator: NavigatorLike | undefined): Fact {
  if (!navigator) return unknown(REASONS.noNavigator);
  const gigabytes = navigator.deviceMemory;
  if (typeof gigabytes !== 'number' || !Number.isFinite(gigabytes) || gigabytes <= 0) {
    return unknown(REASONS.deviceMemory);
  }
  return known(`${gigabytes} GB`);
}

export function probeHeap(heap: HeapLike | undefined, field: keyof HeapLike): Fact {
  const value = heap?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return unknown(REASONS.heap);
  }
  return known(formatBytes(value));
}

// ── display ───────────────────────────────────────────────────────────────

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function probeScreenSize(screen: ScreenLike | undefined): Fact {
  const width = positive(screen?.width);
  const height = positive(screen?.height);
  if (width === null || height === null) return unknown(REASONS.noScreen);
  return known(`${width} × ${height}`);
}

/** Screen size multiplied by the device pixel ratio, when both are known. */
export function probeDevicePixels(
  screen: ScreenLike | undefined,
  devicePixelRatio: number | undefined,
): Fact {
  const width = positive(screen?.width);
  const height = positive(screen?.height);
  const ratio = positive(devicePixelRatio);
  if (width === null || height === null) return unknown(REASONS.noScreen);
  if (ratio === null) return unknown('window.devicePixelRatio is unavailable in this runtime.');
  return known(`${Math.round(width * ratio)} × ${Math.round(height * ratio)}`);
}

export function probePixelRatio(devicePixelRatio: number | undefined): Fact {
  const ratio = positive(devicePixelRatio);
  if (ratio === null) return unknown('window.devicePixelRatio is unavailable in this runtime.');
  return known(`${ratio}×`);
}

export function probeColorDepth(screen: ScreenLike | undefined): Fact {
  const depth = positive(screen?.colorDepth);
  if (depth === null) return unknown(REASONS.noScreen);
  return known(`${depth}-bit`);
}

/** The first query that matches, or the reason nothing did. */
export function probeMedia(
  matchMedia: MatchMediaLike | undefined,
  cases: ReadonlyArray<readonly [query: string, label: string]>,
  noMatch: string,
): Fact {
  if (typeof matchMedia !== 'function') return unknown(REASONS.noMatchMedia);
  for (const [query, label] of cases) {
    try {
      if (matchMedia(query).matches) return known(label);
    } catch {
      return unknown(REASONS.noMatchMedia);
    }
  }
  return unknown(noMatch);
}

export function probeColorScheme(matchMedia: MatchMediaLike | undefined): Fact {
  return probeMedia(
    matchMedia,
    [
      ['(prefers-color-scheme: dark)', 'Dark'],
      ['(prefers-color-scheme: light)', 'Light'],
    ],
    'The display reports no colour-scheme preference.',
  );
}

export function probeReducedMotion(matchMedia: MatchMediaLike | undefined): Fact {
  return probeMedia(
    matchMedia,
    [
      ['(prefers-reduced-motion: reduce)', 'Reduce'],
      ['(prefers-reduced-motion: no-preference)', 'No preference'],
    ],
    'The system reports no motion preference.',
  );
}

export function probePointer(matchMedia: MatchMediaLike | undefined): Fact {
  return probeMedia(
    matchMedia,
    [
      ['(pointer: fine)', 'Fine — mouse or trackpad'],
      ['(pointer: coarse)', 'Coarse — touch'],
      ['(pointer: none)', 'None'],
    ],
    'The system reports no primary pointer.',
  );
}

// ── graphics ──────────────────────────────────────────────────────────────

/** The slice of a WebGL context the GPU probe touches. */
export interface GlLike {
  getParameter(name: number): unknown;
  getExtension(name: string): unknown;
  readonly VERSION: number;
}

export interface DebugRendererExtension {
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

export interface GpuReading {
  renderer: Fact;
  vendor: Fact;
  api: Fact;
}

function isDebugRendererExtension(value: unknown): value is DebugRendererExtension {
  if (typeof value !== 'object' || value === null) return false;
  const ext = value as Partial<DebugRendererExtension>;
  return (
    typeof ext.UNMASKED_RENDERER_WEBGL === 'number' && typeof ext.UNMASKED_VENDOR_WEBGL === 'number'
  );
}

function glString(gl: GlLike, name: number): string | null {
  try {
    const value = gl.getParameter(name);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The GPU as the driver names it. `WEBGL_debug_renderer_info` is the only
 * source, and it is frequently withheld — when it is, the row says so rather
 * than falling back to a guess from the vendor's GL_RENDERER placeholder.
 */
export function gpuFromContext(gl: GlLike | null): GpuReading {
  if (!gl) {
    return {
      renderer: unknown(REASONS.webgl),
      vendor: unknown(REASONS.webgl),
      api: unknown(REASONS.webgl),
    };
  }
  const api = maybe(glString(gl, gl.VERSION), 'The context did not report a GL version string.');
  let extension: unknown = null;
  try {
    extension = gl.getExtension('WEBGL_debug_renderer_info');
  } catch {
    extension = null;
  }
  if (!isDebugRendererExtension(extension)) {
    return {
      renderer: unknown(REASONS.debugRenderer),
      vendor: unknown(REASONS.debugRenderer),
      api,
    };
  }
  return {
    renderer: maybe(glString(gl, extension.UNMASKED_RENDERER_WEBGL), REASONS.debugRenderer),
    vendor: maybe(glString(gl, extension.UNMASKED_VENDOR_WEBGL), REASONS.debugRenderer),
    api,
  };
}

// ── software ──────────────────────────────────────────────────────────────

/** Chromium's GREASE brand ("Not)A;Brand"), which names no real browser. */
const GREASE = /not[^a-z0-9]*a[^a-z0-9]*brand/i;

const UA_BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bFirefox\/([\d.]+)/, 'Firefox'],
  [/\bEdg(?:iOS|A)?\/([\d.]+)/, 'Edge'],
  [/\bOPR\/([\d.]+)/, 'Opera'],
  [/\bChrome\/([\d.]+)/, 'Chrome'],
  [/\bVersion\/([\d.]+)(?=.*\bSafari\/)/, 'Safari'],
];

/**
 * The browser, from `navigator.userAgentData.brands` where it exists (the
 * browser naming itself) and from the user-agent string otherwise.
 */
export function probeBrowser(navigator: NavigatorLike | undefined): Fact {
  if (!navigator) return unknown(REASONS.noNavigator);
  const brands = navigator.userAgentData?.brands ?? [];
  const named = brands
    .filter((b) => b && typeof b.brand === 'string' && !GREASE.test(b.brand))
    .map((b) => `${b.brand} ${b.version}`.trim());
  if (named.length > 0) return known(named.join(', '));
  const ua = navigator.userAgent ?? '';
  for (const [pattern, name] of UA_BROWSERS) {
    const match = pattern.exec(ua);
    if (match) return known(`${name} ${match[1] ?? ''}`.trim());
  }
  return unknown(REASONS.browser);
}

/**
 * The rendering engine exactly as the user-agent string states it. "Blink"
 * is never printed: no user agent contains the word, and inferring it from a
 * Chrome token would be a guess.
 */
export function probeEngine(userAgent: string | undefined): Fact {
  const ua = userAgent ?? '';
  if (!ua) return unknown(REASONS.engine);
  if (/\bGecko\/\d/.test(ua)) {
    const revision = /\brv:([\d.]+)/.exec(ua);
    return known(revision ? `Gecko ${revision[1]}` : 'Gecko');
  }
  const webkit = /\bAppleWebKit\/([\d.]+)/.exec(ua);
  if (webkit) return known(`AppleWebKit ${webkit[1]}`);
  return unknown(REASONS.engine);
}

export function probeLanguages(navigator: NavigatorLike | undefined): Fact {
  if (!navigator) return unknown(REASONS.noNavigator);
  const list = navigator.languages?.filter((l) => typeof l === 'string' && l.trim()) ?? [];
  if (list.length > 0) return known(list.join(', '));
  return maybe(navigator.language, 'This browser does not report a language preference.');
}

export function probeLocale(resolved: Intl.ResolvedDateTimeFormatOptions | undefined): Fact {
  return maybe(resolved?.locale, REASONS.intl);
}

/** "+02:00" for a `getTimezoneOffset()` of -120. */
export function formatUtcOffset(minutesBehindUtc: number): string {
  if (!Number.isFinite(minutesBehindUtc)) return '';
  const minutes = -Math.round(minutesBehindUtc);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  return `${sign}${String(hours).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function probeTimeZone(
  resolved: Intl.ResolvedDateTimeFormatOptions | undefined,
  offsetMinutes: number | undefined,
): Fact {
  const zone = resolved?.timeZone?.trim();
  if (!zone) return unknown(REASONS.timeZone);
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) return known(zone);
  return known(`${zone} (UTC${formatUtcOffset(offsetMinutes)})`);
}

export function probeUserAgent(navigator: NavigatorLike | undefined): Fact {
  return maybe(navigator?.userAgent, REASONS.noNavigator);
}

/**
 * The host operating system. On the desktop this is `sysinfo`; in a browser
 * it is `navigator.userAgentData`, which is the only source that is not the
 * frozen user-agent string.
 */
export function probeHostSystem(
  host: { name?: string; version?: string } | null,
  navigator: NavigatorLike | undefined,
  hints: UaHints | null,
): Fact {
  const name = host?.name?.trim();
  if (name) return known(`${name} ${host?.version?.trim() ?? ''}`.trim());
  const platform = navigator?.userAgentData?.platform?.trim();
  if (!platform) return unknown(REASONS.hostPlatform);
  const version = hints?.platformVersion?.trim();
  return known(version ? `${platform} ${version}` : platform);
}

// ── feature support ───────────────────────────────────────────────────────

export type FeatureId =
  | 'opfs'
  | 'indexeddb'
  | 'webcrypto'
  | 'webgl'
  | 'serviceworker'
  | 'clipboard';

export interface FeatureSupport {
  id: FeatureId;
  label: string;
  supported: boolean;
}

export function supportFact(supported: boolean): Fact {
  return known(supported ? 'Supported' : 'Not supported');
}

// ── reading the real globals ──────────────────────────────────────────────

interface NavigatorWithExtras extends Navigator {
  deviceMemory?: number;
  userAgentData?: UserAgentDataLike & {
    getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
  };
}

interface PerformanceWithMemory extends Performance {
  memory?: HeapLike;
}

function currentNavigator(): NavigatorWithExtras | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithExtras);
}

/** Snapshot the globals the pure probes read. */
export function readEnv(): ProbeEnv {
  const nav = currentNavigator();
  const performanceMemory =
    typeof performance === 'undefined' ? undefined : (performance as PerformanceWithMemory).memory;
  let dateTimeFormat: Intl.ResolvedDateTimeFormatOptions | undefined;
  try {
    dateTimeFormat = new Intl.DateTimeFormat().resolvedOptions();
  } catch {
    dateTimeFormat = undefined;
  }
  return {
    navigator: nav,
    screen: typeof screen === 'undefined' ? undefined : screen,
    devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : undefined,
    matchMedia: typeof matchMedia === 'function' ? (query) => matchMedia(query) : undefined,
    heap: performanceMemory,
    dateTimeFormat,
    timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
  };
}

/**
 * Ask Chromium for the high-entropy client hints. Returns null anywhere the
 * API is missing or the browser declines.
 */
export async function readUaHints(): Promise<UaHints | null> {
  const data = currentNavigator()?.userAgentData;
  if (!data || typeof data.getHighEntropyValues !== 'function') return null;
  try {
    const values = await data.getHighEntropyValues([
      'architecture',
      'bitness',
      'platformVersion',
      'model',
    ]);
    const pick = (key: string): string | undefined => {
      const value = values[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    return {
      architecture: pick('architecture'),
      bitness: pick('bitness'),
      platformVersion: pick('platformVersion'),
      model: pick('model'),
    };
  } catch {
    return null;
  }
}

/**
 * Do something with a throwaway WebGL context and give it back.
 *
 * Giving it back matters: a browser keeps only a handful of live contexts —
 * around sixteen — and drops the oldest to make room, which is a real
 * teardown of somebody else's canvas. System Information used to take three
 * per visit and return one, so opening it a few times cost the OS every
 * canvas it had. `WEBGL_lose_context` is the release; Firefox writes "WebGL
 * context was lost" to the console when it happens, which is the cleanup
 * reporting itself rather than a fault.
 */
function withGl<T>(use: (gl: GlLike | null) => T): T {
  if (typeof document === 'undefined') return use(null);
  let gl: GlLike | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as GlLike | null;
    return use(gl);
  } catch {
    return use(null);
  } finally {
    try {
      const lose = gl?.getExtension('WEBGL_lose_context');
      if (lose && typeof (lose as { loseContext?: () => void }).loseContext === 'function') {
        (lose as { loseContext: () => void }).loseContext();
      }
    } catch {
      // A context that cannot be released is already gone.
    }
  }
}

/** Create a throwaway WebGL context, read the GPU strings, release it. */
export function readGpu(): GpuReading {
  return withGl(gpuFromContext);
}

/** Probe each capability by looking for the API itself, not by sniffing. */
export function readFeatures(): FeatureSupport[] {
  const nav = currentNavigator();
  const storage = nav?.storage as { getDirectory?: unknown } | undefined;
  // One context, asked one question, given back — not two left open.
  const webgl = withGl((gl) => gl !== null);
  return [
    {
      id: 'opfs',
      label: 'Origin private file system',
      supported: typeof storage?.getDirectory === 'function',
    },
    {
      id: 'indexeddb',
      label: 'IndexedDB',
      supported: typeof globalThis.indexedDB === 'object' && globalThis.indexedDB !== null,
    },
    {
      id: 'webcrypto',
      label: 'Web Crypto',
      supported: typeof globalThis.crypto?.subtle === 'object' && globalThis.crypto.subtle !== null,
    },
    { id: 'webgl', label: 'WebGL', supported: webgl },
    {
      id: 'serviceworker',
      label: 'Service worker',
      supported: Boolean(nav && 'serviceWorker' in nav),
    },
    {
      id: 'clipboard',
      label: 'Clipboard write',
      supported: typeof nav?.clipboard?.writeText === 'function',
    },
  ];
}
