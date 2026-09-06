/**
 * Everything the address bar needs to turn what a person types into a place
 * to go, and to show a place to go as text. No React, no I/O.
 *
 * Two kinds of address exist: `lumen://…` pages the app renders itself, and
 * ordinary web addresses that go into the sandboxed frame.
 */

export const INTERNAL_SCHEME = 'lumen://';

export const INTERNAL_PAGES = ['start', 'history', 'bookmarks', 'settings', 'blank'] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

/** The new-tab page. */
export const START_URL = 'lumen://start';
export const HISTORY_URL = 'lumen://history';
export const BOOKMARKS_URL = 'lumen://bookmarks';
export const SETTINGS_URL = 'lumen://settings';
/** Nothing at all, for people who want a new tab to get out of the way. */
export const BLANK_URL = 'lumen://blank';

const INTERNAL_TITLES: Record<InternalPage, string> = {
  start: 'New Tab',
  history: 'History',
  bookmarks: 'Bookmarks',
  settings: 'Browser Settings',
  blank: 'Blank Page',
};

export interface SearchEngine {
  id: string;
  name: string;
  /** The query, percent-encoded, replaces `%s`. */
  template: string;
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    template: 'https://en.wikipedia.org/w/index.php?search=%s',
  },
];

export const DEFAULT_ENGINE_ID = 'duckduckgo';

export function engineById(id: string): SearchEngine {
  const found = SEARCH_ENGINES.find((e) => e.id === id);
  // The list is a non-empty literal, so the fallback always exists.
  return found ?? (SEARCH_ENGINES[0] as SearchEngine);
}

export function searchUrl(query: string, engine: SearchEngine): string {
  return engine.template.replace('%s', encodeURIComponent(query.trim()));
}

// ── internal pages ────────────────────────────────────────────────────────

export function isInternalUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith(INTERNAL_SCHEME);
}

/** The page `lumen://<name>` refers to, or null for an unknown name. */
export function internalPage(url: string): InternalPage | null {
  const match = /^lumen:\/\/([a-z]+)\/?$/i.exec(url.trim());
  if (!match) return null;
  const name = (match[1] ?? '').toLowerCase();
  return (INTERNAL_PAGES as readonly string[]).includes(name) ? (name as InternalPage) : null;
}

/** Lower-cased, trailing slash removed, so two spellings compare equal. */
export function normalizeInternalUrl(url: string): string {
  const trimmed = url.trim().toLowerCase().replace(/\/+$/, '');
  return trimmed;
}

// ── schemes and origins ───────────────────────────────────────────────────

export type Scheme = 'https' | 'http' | 'lumen' | 'other';

export function schemeOf(url: string): Scheme {
  const value = url.trim().toLowerCase();
  if (value.startsWith('https://')) return 'https';
  if (value.startsWith('http://')) return 'http';
  if (value.startsWith(INTERNAL_SCHEME)) return 'lumen';
  return 'other';
}

export type Security = 'secure' | 'insecure' | 'internal';

export function securityOf(url: string): Security {
  switch (schemeOf(url)) {
    case 'https':
      return 'secure';
    case 'lumen':
      return 'internal';
    default:
      return 'insecure';
  }
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** `https://example.com` for a web address, `lumen://history` for an internal page. */
export function originOf(url: string): string {
  if (isInternalUrl(url)) return normalizeInternalUrl(url);
  const parsed = parse(url.trim());
  if (!parsed) return '';
  return parsed.origin === 'null' ? `${parsed.protocol}//` : parsed.origin;
}

/** The host without a leading `www.`; empty for internal pages and junk. */
export function hostOf(url: string): string {
  if (isInternalUrl(url)) return '';
  const parsed = parse(url.trim());
  if (!parsed) return '';
  return parsed.hostname.replace(/^www\./, '');
}

// ── input → address ───────────────────────────────────────────────────────

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Whether the input should be navigated to rather than searched for: it has
 * a scheme, is localhost, or has a dot inside its host part.
 */
export function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  if (!value || /\s/.test(value)) return false;
  if (SCHEME_RE.test(value)) return true;
  const host = (value.split(/[/?#]/)[0] ?? '').split('@').pop() ?? '';
  const name = host.replace(/:\d*$/, '');
  if (!name) return false;
  if (name === 'localhost') return true;
  const labels = name.split('.');
  return labels.length > 1 && labels.every((label) => label.length > 0);
}

/** Add a scheme when there is none and let the URL parser have the last word. */
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const withScheme = SCHEME_RE.test(value) ? value : `https://${value}`;
  const parsed = parse(withScheme);
  return parsed ? parsed.toString() : null;
}

export type ResolutionKind = 'internal' | 'url' | 'search';

export interface Resolution {
  kind: ResolutionKind;
  url: string;
  /** The text that was searched for, for a `search` resolution. */
  query?: string;
}

/** What pressing Enter in the address bar should do. Null for blank input. */
export function resolveInput(input: string, engine: SearchEngine): Resolution | null {
  const value = input.trim();
  if (!value) return null;
  if (isInternalUrl(value)) return { kind: 'internal', url: normalizeInternalUrl(value) };
  if (looksLikeUrl(value)) {
    const url = normalizeUrl(value);
    if (url) return { kind: 'url', url };
  }
  return { kind: 'search', url: searchUrl(value, engine), query: value };
}

// ── hosts that open outside Lumen ─────────────────────────────────────────

/**
 * What the user typed, as a host we can compare against: `https://WWW.Ex.com/a`
 * and `ex.com` both become `ex.com`. Null when there is no host in it.
 */
export function hostPattern(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/^\*\./, '');
  if (!value || /\s/.test(value)) return null;
  const url = normalizeUrl(value);
  return (url ? hostOf(url) : '') || null;
}

/** A host matches a pattern exactly, or as one of its subdomains. */
export function matchesHost(host: string, pattern: string): boolean {
  const h = host.trim().toLowerCase();
  const p = pattern.trim().toLowerCase().replace(/^\*\./, '');
  if (!h || !p) return false;
  return h === p || h.endsWith(`.${p}`);
}

/** Whether this address is on the list of sites that open outside Lumen. */
export function opensExternally(url: string, hosts: readonly string[]): boolean {
  const scheme = schemeOf(url);
  if (scheme !== 'https' && scheme !== 'http') return false;
  const host = hostOf(url);
  return host !== '' && hosts.some((pattern) => matchesHost(host, pattern));
}

// ── display ───────────────────────────────────────────────────────────────

/**
 * The address as it reads in the bar: `https://` and a bare trailing slash
 * are noise, everything else stays so the text can be copied and edited.
 */
export function displayUrl(url: string): string {
  const value = url.trim();
  if (isInternalUrl(value)) return normalizeInternalUrl(value);
  const parsed = parse(value);
  if (!parsed) return value;
  const rest = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`.replace(
    /\/$/,
    parsed.search || parsed.hash ? '/' : '',
  );
  return parsed.protocol === 'https:' ? rest : `${parsed.protocol}//${rest}`;
}

/** The best title we can honestly give a page we cannot read: its host. */
export function titleFor(url: string): string {
  const page = internalPage(url);
  if (page) return INTERNAL_TITLES[page];
  if (isInternalUrl(url)) return normalizeInternalUrl(url);
  return hostOf(url) || displayUrl(url);
}

/** One character for a tab's glyph when there is no favicon to show. */
export function tabInitial(url: string): string {
  const host = hostOf(url);
  const letter = /[a-z0-9]/i.exec(host)?.[0];
  return (letter ?? '?').toUpperCase();
}
