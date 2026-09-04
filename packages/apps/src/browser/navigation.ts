/**
 * What an address means, and where each tab has been. Pure functions: the
 * component owns the state, this module decides how to read an address, what
 * to call a page, and how the per-tab back/forward stacks move.
 */
import { type ModifierPreference, matchesShortcut } from '@lumen/kernel';
import { basename, extname } from '@lumen/vfs';

/** Searches go to DuckDuckGo's no-script results, which render inside a frame. */
export const SEARCH_URL = 'https://duckduckgo.com/html/?q=';

export const INTERNAL_SCHEME = 'lumen://';

export const INTERNAL_PAGES = ['home', 'bookmarks', 'history', 'about'] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

/** Files the frame can render from the VFS. */
export const LOCAL_EXTENSIONS = ['.html', '.htm', '.svg'];

export type UrlKind = 'internal' | 'local' | 'web';

export function internalUrl(page: InternalPage): string {
  return `${INTERNAL_SCHEME}${page}`;
}

/** The page behind a `lumen://` address, or null for anything else. */
export function internalPageOf(url: string): InternalPage | null {
  if (!url.toLowerCase().startsWith(INTERNAL_SCHEME)) return null;
  const name = url.slice(INTERNAL_SCHEME.length).replace(/\/+$/, '').toLowerCase();
  return (INTERNAL_PAGES as readonly string[]).includes(name) ? (name as InternalPage) : null;
}

/** Local pages are plain VFS paths; web pages carry a scheme. */
export function classifyUrl(url: string): UrlKind {
  if (internalPageOf(url)) return 'internal';
  return url.startsWith('/') ? 'local' : 'web';
}

/**
 * "has a dot, no spaces" — with two corrections: the last label must read like
 * a domain, so `3.14` is a search, and `localhost` is a host without a dot.
 */
export function looksLikeHost(input: string): boolean {
  const value = input.trim();
  if (value === '' || /\s/.test(value)) return false;
  const authority = value.split(/[/?#]/)[0] ?? '';
  const host = authority.split(':')[0] ?? '';
  if (host === 'localhost') return true;
  const dot = host.lastIndexOf('.');
  if (dot <= 0 || dot === host.length - 1) return false;
  return /^[a-z]{2,}$/i.test(host.slice(dot + 1));
}

export type Resolution = { kind: UrlKind; url: string } | { kind: 'rejected'; message: string };

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Turn what someone typed into somewhere to go: an address, a search, or a
 * refusal with a reason.
 */
export function resolveAddress(input: string): Resolution {
  const value = input.trim();
  if (value === '') return { kind: 'rejected', message: 'Type an address or a search.' };

  const page = internalPageOf(value);
  if (page) return { kind: 'internal', url: internalUrl(page) };

  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
  if (scheme === 'file')
    return {
      kind: 'rejected',
      message: 'Open local files from Files; file:// does not load here.',
    };
  if (scheme === 'lumen')
    return { kind: 'rejected', message: `There is no internal page at ${value}.` };
  if (scheme && scheme !== 'http' && scheme !== 'https')
    return { kind: 'rejected', message: `The browser opens http and https, not ${scheme}:.` };

  if (value.startsWith('/')) {
    if (!LOCAL_EXTENSIONS.includes(extname(value)))
      return { kind: 'rejected', message: 'The browser renders .html, .htm and .svg files.' };
    return { kind: 'local', url: value };
  }

  const target = scheme ? value : looksLikeHost(value) ? `https://${value}` : null;
  if (target === null) return { kind: 'web', url: SEARCH_URL + encodeURIComponent(value) };
  try {
    return { kind: 'web', url: new URL(target).toString() };
  } catch {
    return { kind: 'rejected', message: `${value} is not an address the browser can open.` };
  }
}

/** The host of a web address without `www.`; empty for anything else. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const INTERNAL_TITLES: Record<InternalPage, string> = {
  home: 'Home',
  bookmarks: 'Bookmarks',
  history: 'History',
  about: 'About Browser',
};

/**
 * A frame from another origin never reports its title, so a tab is named after
 * its host — the one thing the address always tells us.
 */
export function titleFor(url: string): string {
  const page = internalPageOf(url);
  if (page) return INTERNAL_TITLES[page];
  if (url.startsWith('/')) return basename(url);
  return hostOf(url) || url || 'New Tab';
}

// ── per-tab history ───────────────────────────────────────────────────────

export interface TabHistory {
  readonly entries: readonly string[];
  readonly index: number;
}

/** Deep stacks are pointless; a tab keeps its last 60 addresses. */
export const TAB_HISTORY_LIMIT = 60;

export function createHistory(url: string): TabHistory {
  return { entries: [url], index: 0 };
}

export function currentUrl(history: TabHistory): string {
  return history.entries[history.index] ?? '';
}

/** Go somewhere new: drops the forward stack. The same address twice is a no-op. */
export function pushEntry(history: TabHistory, url: string): TabHistory {
  if (currentUrl(history) === url) return history;
  const entries = [...history.entries.slice(0, history.index + 1), url].slice(-TAB_HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

/** Replace where the tab is without adding a step (a redirect, a home change). */
export function replaceEntry(history: TabHistory, url: string): TabHistory {
  if (currentUrl(history) === url) return history;
  const entries = [...history.entries];
  entries[history.index] = url;
  return { entries, index: history.index };
}

export function canGoBack(history: TabHistory): boolean {
  return history.index > 0;
}

export function canGoForward(history: TabHistory): boolean {
  return history.index < history.entries.length - 1;
}

export function goBack(history: TabHistory): TabHistory {
  return canGoBack(history) ? { entries: history.entries, index: history.index - 1 } : history;
}

export function goForward(history: TabHistory): TabHistory {
  return canGoForward(history) ? { entries: history.entries, index: history.index + 1 } : history;
}

// ── keyboard ──────────────────────────────────────────────────────────────

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type TabKeyAction =
  | { type: 'next' }
  | { type: 'previous' }
  /** Zero-based; 8 (Mod+9) means the last tab, as every browser does. */
  | { type: 'select'; index: number };

/**
 * Tab cycling and Mod+1…9. These are not in the menus (nine numbered items
 * would bury the useful ones), so the component binds them itself.
 */
export function tabShortcut(event: KeyLike, modifier: ModifierPreference): TabKeyAction | null {
  if (matchesShortcut(event, 'Ctrl+Shift+Tab', modifier)) return { type: 'previous' };
  if (matchesShortcut(event, 'Ctrl+Tab', modifier)) return { type: 'next' };
  for (let n = 1; n <= 9; n++) {
    if (matchesShortcut(event, `Mod+${n}`, modifier)) return { type: 'select', index: n - 1 };
  }
  return null;
}

/** Which tab Mod+1…9 lands on: the ninth key is the last tab. */
export function tabIndexFor(index: number, count: number): number {
  if (count === 0) return -1;
  return index >= 8 ? count - 1 : Math.min(index, count - 1);
}
