/**
 * The browser's own settings: the shape kept on disk, its defaults, and the
 * things the app derives from it — which engine a search uses, what the frame
 * is allowed to do, how long a frame is given, and what to say about a page
 * that never appeared.
 *
 * All of it is pure. The limits a page has over a frame it embeds are set by
 * the browser Lumen itself runs in, so what cannot be done is written down
 * here plainly instead of being hidden behind a switch that does nothing.
 */

import { join, normalize } from '@lumen/vfs';
import { DEFAULT_ZOOM, ZOOM_LEVELS } from './tabs';
import {
  BLANK_URL,
  DEFAULT_ENGINE_ID,
  engineById,
  hostOf,
  hostPattern,
  matchesHost,
  normalizeUrl,
  SEARCH_ENGINES,
  type SearchEngine,
  START_URL,
  schemeOf,
} from './url';

/** The engine id that means "the template below is mine". */
export const CUSTOM_ENGINE_ID = 'custom';

/** What a search template puts the query in place of. */
export const QUERY_TOKEN = '%s';

/** What a new tab opens. */
export const NEW_TAB_TARGETS = ['start', 'homepage', 'blank'] as const;
export type NewTabTarget = (typeof NEW_TAB_TARGETS)[number];

export interface BrowserSettings {
  /** Where Home goes. */
  homepage: string;
  newTab: NewTabTarget;
  /** An id from `SEARCH_ENGINES`, or `custom` to use `searchTemplate`. */
  searchEngine: string;
  /** The custom query template; the query, percent-encoded, replaces `%s`. */
  searchTemplate: string;
  /** Where downloaded files go. A leading `~/` means the home folder. */
  downloadsDir: string;
  /** Each of these is one token of the frame's `sandbox` attribute. */
  allowScripts: boolean;
  allowForms: boolean;
  allowPopups: boolean;
  allowDownloads: boolean;
  /** `allow-same-origin`: the site keeps its own origin, cookies and storage. */
  allowStorage: boolean;
  /** The zoom a new tab starts at, and what Actual Size returns to. */
  defaultZoom: number;
  /** Off stops the visit log from being written at all. */
  keepHistory: boolean;
  showBookmarksBar: boolean;
  /** How long a frame is given to report a load before it is called blocked. */
  frameTimeoutMs: number;
  /** Hosts that open in the real browser instead of a frame. */
  externalHosts: string[];
}

export const HOME_PREFIX = '~/';
export const DEFAULT_DOWNLOADS_DIR = '~/Downloads';

/**
 * A frame that is going to report a load reports it in well under a second on
 * a working connection; the rest of the wait is spent staring at a spinner
 * that will never stop. These are the choices offered, shortest first.
 */
export const FRAME_TIMEOUTS = [1000, 2500, 5000, 10000] as const;
export const DEFAULT_FRAME_TIMEOUT_MS = 2500;
export const MIN_FRAME_TIMEOUT_MS = 500;
export const MAX_FRAME_TIMEOUT_MS = 20000;

/** How many hosts the open-outside list keeps; a file with more is trimmed. */
export const MAX_EXTERNAL_HOSTS = 100;

export const DEFAULT_SETTINGS: BrowserSettings = {
  homepage: START_URL,
  newTab: 'start',
  searchEngine: DEFAULT_ENGINE_ID,
  searchTemplate: '',
  downloadsDir: DEFAULT_DOWNLOADS_DIR,
  allowScripts: true,
  allowForms: true,
  allowPopups: false,
  allowDownloads: false,
  allowStorage: false,
  defaultZoom: DEFAULT_ZOOM,
  keepHistory: true,
  showBookmarksBar: true,
  frameTimeoutMs: DEFAULT_FRAME_TIMEOUT_MS,
  externalHosts: [],
};

// ── reading the file ──────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** The level nearest to `value`, so a hand-edited zoom lands on a real step. */
export function nearestZoom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ZOOM;
  let best = DEFAULT_ZOOM;
  for (const level of ZOOM_LEVELS) {
    if (Math.abs(level - value) < Math.abs(best - value)) best = level;
  }
  return best;
}

export function clampFrameTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FRAME_TIMEOUT_MS;
  return Math.round(Math.min(MAX_FRAME_TIMEOUT_MS, Math.max(MIN_FRAME_TIMEOUT_MS, value)));
}

/** Hosts as they are stored: lower case, no scheme, no path, no duplicates. */
export function normalizeHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const host = hostPattern(item);
    if (host && !out.includes(host)) out.push(host);
    if (out.length === MAX_EXTERNAL_HOSTS) break;
  }
  return out;
}

/**
 * The settings file is under the user's home, so it can be hand-edited or
 * left behind by an older version. Every field is read on its own and falls
 * back to the default rather than being trusted.
 */
export function normalizeSettings(raw: unknown): BrowserSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };

  const engine = typeof raw.searchEngine === 'string' ? raw.searchEngine : '';
  const known = engine === CUSTOM_ENGINE_ID || SEARCH_ENGINES.some((e) => e.id === engine);
  const target = typeof raw.newTab === 'string' ? raw.newTab : '';

  return {
    homepage: str(raw.homepage, DEFAULT_SETTINGS.homepage),
    newTab: (NEW_TAB_TARGETS as readonly string[]).includes(target)
      ? (target as NewTabTarget)
      : DEFAULT_SETTINGS.newTab,
    searchEngine: known ? engine : DEFAULT_ENGINE_ID,
    searchTemplate: typeof raw.searchTemplate === 'string' ? raw.searchTemplate.trim() : '',
    downloadsDir: str(raw.downloadsDir, DEFAULT_SETTINGS.downloadsDir),
    allowScripts: bool(raw.allowScripts, DEFAULT_SETTINGS.allowScripts),
    allowForms: bool(raw.allowForms, DEFAULT_SETTINGS.allowForms),
    allowPopups: bool(raw.allowPopups, DEFAULT_SETTINGS.allowPopups),
    allowDownloads: bool(raw.allowDownloads, DEFAULT_SETTINGS.allowDownloads),
    allowStorage: bool(raw.allowStorage, DEFAULT_SETTINGS.allowStorage),
    defaultZoom: nearestZoom(raw.defaultZoom),
    keepHistory: bool(raw.keepHistory, DEFAULT_SETTINGS.keepHistory),
    showBookmarksBar: bool(raw.showBookmarksBar, DEFAULT_SETTINGS.showBookmarksBar),
    frameTimeoutMs: clampFrameTimeout(raw.frameTimeoutMs),
    externalHosts: normalizeHosts(raw.externalHosts),
  };
}

// ── the open-outside list ─────────────────────────────────────────────────

/**
 * Add the host of `input` to the list. An address already covered by an entry
 * (`docs.example.com` under `example.com`) changes nothing, and a full list
 * is left alone rather than quietly dropping an entry the user chose.
 */
export function withHost(hosts: readonly string[], input: string): string[] {
  const host = hostPattern(input);
  if (!host || hosts.length >= MAX_EXTERNAL_HOSTS) return [...hosts];
  if (hosts.some((pattern) => matchesHost(host, pattern))) return [...hosts];
  return [...hosts, host];
}

/** Drop every entry that would send `input` outside. */
export function withoutHost(hosts: readonly string[], input: string): string[] {
  const host = hostPattern(input) ?? input.trim().toLowerCase();
  return hosts.filter((pattern) => !matchesHost(host, pattern));
}

// ── search ────────────────────────────────────────────────────────────────

/** A template is usable when it is a web address with a place for the query. */
export function isValidTemplate(template: string): boolean {
  const value = template.trim();
  if (!value.includes(QUERY_TOKEN)) return false;
  const scheme = schemeOf(value);
  if (scheme !== 'https' && scheme !== 'http') return false;
  return normalizeUrl(value.replace(QUERY_TOKEN, 'query')) !== null;
}

/**
 * The engine a search runs against. A custom template that is not a usable
 * address falls back to the default engine, so a half-typed one in the file
 * never turns Enter into a dead end.
 */
export function engineFor(settings: BrowserSettings): SearchEngine {
  if (settings.searchEngine !== CUSTOM_ENGINE_ID) return engineById(settings.searchEngine);
  const template = settings.searchTemplate.trim();
  if (!isValidTemplate(template)) return engineById(DEFAULT_ENGINE_ID);
  return { id: CUSTOM_ENGINE_ID, name: hostOf(template) || 'Custom search', template };
}

/** The template shown in settings: the built-in engine's, or the custom one. */
export function templateFor(settings: BrowserSettings): string {
  if (settings.searchEngine === CUSTOM_ENGINE_ID) return settings.searchTemplate;
  return engineById(settings.searchEngine).template;
}

// ── new tabs ──────────────────────────────────────────────────────────────

/** The address a new tab opens, from the new-tab setting. */
export function newTabUrl(settings: BrowserSettings): string {
  switch (settings.newTab) {
    case 'homepage':
      return settings.homepage.trim() || START_URL;
    case 'blank':
      return BLANK_URL;
    default:
      return START_URL;
  }
}

// ── the frame ─────────────────────────────────────────────────────────────

/**
 * There is no sandbox token for images, and a cross-origin document cannot be
 * read or styled from outside, so image loading is not something a browser
 * built on frames can switch off. A switch that lies is worse than a sentence
 * that explains.
 */
export const FRAME_NOTE =
  'The sandbox attribute is the whole of the control a page has over a frame it embeds: scripts, forms, popups, downloads and the frame’s origin. There is no switch for images.';

/** The `sandbox` attribute for the frame, in a fixed order. */
export function sandboxFor(settings: BrowserSettings): string {
  const tokens: string[] = [];
  if (settings.allowScripts) tokens.push('allow-scripts');
  if (settings.allowForms) tokens.push('allow-forms');
  if (settings.allowPopups) tokens.push('allow-popups', 'allow-popups-to-escape-sandbox');
  if (settings.allowDownloads) tokens.push('allow-downloads');
  if (settings.allowStorage) tokens.push('allow-same-origin');
  return tokens.join(' ');
}

// ── why a page did not appear ─────────────────────────────────────────────

export type BlockedCause = 'mixed-content' | 'unsupported-scheme' | 'known-refusal' | 'unknown';

export interface BlockedReason {
  cause: BlockedCause;
  /** A short heading for the panel. */
  title: string;
  /** One sentence naming what stopped the page. */
  text: string;
}

interface KnownRefusal {
  host: string;
  header: string;
  /** `self`: only its own pages may embed it. `none`: nobody may. */
  scope: 'self' | 'none';
}

/**
 * Hosts known to refuse framing, and the header each one sends. Checked with
 * `curl -sI -L` on 2026-09-05; a site can change its headers at any time, so
 * this list only ever saves the wait and names the header — it never grants
 * anything, and an address not on it is still tried in the frame.
 */
export const KNOWN_REFUSALS: readonly KnownRefusal[] = [
  { host: 'google.com', header: 'X-Frame-Options: SAMEORIGIN', scope: 'self' },
  { host: 'iana.org', header: 'X-Frame-Options: DENY', scope: 'none' },
  { host: 'openstreetmap.org', header: 'X-Frame-Options: SAMEORIGIN', scope: 'self' },
  {
    host: 'w3.org',
    header:
      "Content-Security-Policy: frame-ancestors 'self' https://cms.w3.org/ https://cms-dev.w3.org/",
    scope: 'self',
  },
];

function refusalText(refusal: KnownRefusal): string {
  return refusal.scope === 'self'
    ? `${refusal.host} sends ${refusal.header}, so only ${refusal.host} may embed its pages.`
    : `${refusal.host} sends ${refusal.header}, so no other site may embed its pages.`;
}

const REFUSED_TITLE = 'This site refused to be embedded';

/**
 * What can be said about an address before the frame is even created: the
 * page's own scheme rules it out, or the host is one we already know refuses.
 * Null means it is worth trying.
 */
export function preflight(url: string, pageProtocol: string): BlockedReason | null {
  const scheme = schemeOf(url);
  if (scheme === 'other' || scheme === 'lumen') {
    return {
      cause: 'unsupported-scheme',
      title: 'Only http and https open here',
      text: `A frame can only be given an http or https address, and this one is ${url.trim().split(':')[0]}:.`,
    };
  }
  if (scheme === 'http' && pageProtocol === 'https:') {
    return {
      cause: 'mixed-content',
      title: 'This address is not encrypted',
      text: `Lumen itself is served over https, so the browser refuses to load ${hostOf(url) || 'an http address'} over http inside it; no header from the site is involved.`,
    };
  }
  const host = hostOf(url);
  const refusal = KNOWN_REFUSALS.find((r) => matchesHost(host, r.host));
  return refusal
    ? { cause: 'known-refusal', title: REFUSED_TITLE, text: refusalText(refusal) }
    : null;
}

/**
 * Why a page is not on screen. Everything that can be told apart is told
 * apart; the rest says plainly that it cannot be, because a cross-origin
 * frame hides its response headers from the page that embeds it.
 */
export function blockedReason(url: string, pageProtocol: string): BlockedReason {
  return (
    preflight(url, pageProtocol) ?? {
      cause: 'unknown',
      title: REFUSED_TITLE,
      text: 'The frame never reported a load, and a cross-origin frame hides its headers, so Lumen cannot tell whether X-Frame-Options or a Content-Security-Policy frame-ancestors rule turned it away.',
    }
  );
}

// ── downloads ─────────────────────────────────────────────────────────────

/** The downloads folder as an absolute path. */
export function downloadsPath(settings: BrowserSettings, home: string): string {
  const value = settings.downloadsDir.trim() || DEFAULT_DOWNLOADS_DIR;
  if (value === '~') return normalize(home);
  if (value.startsWith(HOME_PREFIX)) return join(home, value.slice(HOME_PREFIX.length));
  return value.startsWith('/') ? normalize(value) : join(home, value);
}

/** A path as it reads on screen: the home folder shortened to `~`. */
export function displayPath(path: string, home: string): string {
  const full = normalize(path);
  const root = normalize(home);
  if (full === root) return '~';
  return full.startsWith(`${root}/`) ? `~${full.slice(root.length)}` : full;
}
