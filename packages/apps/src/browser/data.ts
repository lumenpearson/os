/**
 * What the browser keeps between sessions, and the two things it computes
 * from that: the bookmark list and the address-bar suggestions.
 */

import { MAX_VISITS, searchVisits, uniqueByUrl, type Visit } from './history';
import {
  DEFAULT_ENGINE_ID,
  displayUrl,
  resolveInput,
  SEARCH_ENGINES,
  type SearchEngine,
  START_URL,
  titleFor,
} from './url';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface BrowserData {
  bookmarks: Bookmark[];
  history: Visit[];
  /** Where Home goes and what a fresh window opens. */
  homepage: string;
  searchEngine: string;
  showBookmarksBar: boolean;
}

export const DEFAULT_DATA: BrowserData = {
  bookmarks: [],
  history: [],
  homepage: START_URL,
  searchEngine: DEFAULT_ENGINE_ID,
  showBookmarksBar: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/**
 * The data file lives in the user's home, so it can be edited by hand or
 * left behind by an older version. Read it defensively: anything that does
 * not describe a bookmark or a visit is dropped rather than trusted.
 */
export function normalizeData(raw: unknown): BrowserData {
  if (!isRecord(raw)) return DEFAULT_DATA;

  const bookmarks: Bookmark[] = [];
  if (Array.isArray(raw.bookmarks)) {
    for (const [i, item] of raw.bookmarks.entries()) {
      if (!isRecord(item) || typeof item.url !== 'string' || item.url === '') continue;
      bookmarks.push({
        id: str(item.id, `bookmark-${i}`),
        url: item.url,
        title: str(item.title, titleFor(item.url)),
        addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
      });
    }
  }

  const history: Visit[] = [];
  if (Array.isArray(raw.history)) {
    for (const [i, item] of raw.history.entries()) {
      if (!isRecord(item) || typeof item.url !== 'string' || item.url === '') continue;
      history.push({
        id: str(item.id, `visit-${i}`),
        url: item.url,
        title: str(item.title, titleFor(item.url)),
        visitedAt: typeof item.visitedAt === 'number' ? item.visitedAt : 0,
      });
    }
  }

  const engine = typeof raw.searchEngine === 'string' ? raw.searchEngine : '';
  return {
    bookmarks,
    history: history.slice(0, MAX_VISITS),
    homepage: str(raw.homepage, DEFAULT_DATA.homepage),
    searchEngine: SEARCH_ENGINES.some((e) => e.id === engine) ? engine : DEFAULT_ENGINE_ID,
    showBookmarksBar:
      typeof raw.showBookmarksBar === 'boolean'
        ? raw.showBookmarksBar
        : DEFAULT_DATA.showBookmarksBar,
  };
}

let sequence = 0;

/** Ids for bookmarks and visits: unique within a session, stable once stored. */
export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function findBookmark(bookmarks: readonly Bookmark[], url: string): Bookmark | null {
  return bookmarks.find((b) => b.url === url) ?? null;
}

/** Adding an address that is already bookmarked keeps the original entry. */
export function addBookmark(bookmarks: readonly Bookmark[], bookmark: Bookmark): Bookmark[] {
  if (findBookmark(bookmarks, bookmark.url)) return [...bookmarks];
  return [...bookmarks, bookmark];
}

export function removeBookmark(bookmarks: readonly Bookmark[], id: string): Bookmark[] {
  return bookmarks.filter((b) => b.id !== id);
}

export function renameBookmark(
  bookmarks: readonly Bookmark[],
  id: string,
  title: string,
): Bookmark[] {
  const trimmed = title.trim();
  if (!trimmed) return [...bookmarks];
  return bookmarks.map((b) => (b.id === id ? { ...b, title: trimmed } : b));
}

// ── address bar suggestions ───────────────────────────────────────────────

export type SuggestionKind = 'navigate' | 'search' | 'bookmark' | 'history';

export interface Suggestion {
  /** Unique within one list, used for the option element id. */
  key: string;
  kind: SuggestionKind;
  url: string;
  label: string;
  detail: string;
}

export interface SuggestionInput {
  bookmarks: readonly Bookmark[];
  history: readonly Visit[];
  engine: SearchEngine;
  /** Rows below the first one. */
  limit?: number;
}

const MAX_BOOKMARK_ROWS = 3;

/**
 * The first row is what Enter does right now — go to an address or search
 * for the text. Under it: matching bookmarks, then pages already visited.
 * With an empty field it is just the recent list, like a fresh new tab.
 */
export function buildSuggestions(input: string, source: SuggestionInput): Suggestion[] {
  const { bookmarks, history, engine } = source;
  const limit = source.limit ?? 8;
  const query = input.trim();
  const seen = new Set<string>();
  const out: Suggestion[] = [];

  if (!query) {
    for (const visit of uniqueByUrl(history, limit)) {
      out.push({
        key: `history-${visit.id}`,
        kind: 'history',
        url: visit.url,
        label: visit.title || displayUrl(visit.url),
        detail: displayUrl(visit.url),
      });
    }
    return out;
  }

  const resolved = resolveInput(query, engine);
  if (resolved) {
    seen.add(resolved.url);
    out.push(
      resolved.kind === 'search'
        ? {
            key: 'resolve-search',
            kind: 'search',
            url: resolved.url,
            label: `Search for “${query}”`,
            detail: engine.name,
          }
        : {
            key: 'resolve-url',
            kind: 'navigate',
            url: resolved.url,
            label: displayUrl(resolved.url),
            detail: 'Go to this address',
          },
    );
  }

  const needle = query.toLowerCase();
  for (const bookmark of bookmarks) {
    if (out.length >= limit + 1) break;
    if (seen.has(bookmark.url)) continue;
    if (
      !bookmark.title.toLowerCase().includes(needle) &&
      !bookmark.url.toLowerCase().includes(needle)
    )
      continue;
    seen.add(bookmark.url);
    out.push({
      key: `bookmark-${bookmark.id}`,
      kind: 'bookmark',
      url: bookmark.url,
      label: bookmark.title,
      detail: displayUrl(bookmark.url),
    });
    if (out.length >= MAX_BOOKMARK_ROWS + 1) break;
  }

  for (const visit of uniqueByUrl(searchVisits(history, query), limit)) {
    if (out.length >= limit + 1) break;
    if (seen.has(visit.url)) continue;
    seen.add(visit.url);
    out.push({
      key: `history-${visit.id}`,
      kind: 'history',
      url: visit.url,
      label: visit.title || displayUrl(visit.url),
      detail: displayUrl(visit.url),
    });
  }

  return out;
}
