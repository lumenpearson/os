/**
 * What Photos remembers for the account: the favourites the person marked and
 * how the grid is arranged. One JSON file under the home directory
 * (`~/.config/photos.json`), read and written with `useJsonFile`.
 *
 * Nothing here trusts the file. It is a document a person can edit, a write
 * can be cut in half by a crash, and an older version of the app may have
 * written a shape this one has never seen. So every field is checked and
 * anything unreadable falls back to a default — an unreadable file means no
 * favourites, not an empty window and not a crash.
 */

import type { ThumbSize } from './grid';
import type { SortKey, SortOrder } from './library';

export interface PhotosPrefs {
  sort: SortKey;
  order: SortOrder;
  size: ThumbSize;
  /** The facts panel beside the grid. */
  info: boolean;
  /** The album list down the left. */
  sidebar: boolean;
}

export interface PhotosData {
  version: number;
  prefs: PhotosPrefs;
  /** Absolute VFS paths, in the order they were marked. */
  favourites: string[];
}

export const DEFAULT_PREFS: PhotosPrefs = {
  sort: 'date',
  order: 'descending',
  size: 'medium',
  info: false,
  sidebar: true,
};

export const DEFAULT_DATA: PhotosData = { version: 1, prefs: DEFAULT_PREFS, favourites: [] };

const SORT_KEYS: readonly SortKey[] = ['name', 'date', 'size'];
const SORT_ORDERS: readonly SortOrder[] = ['ascending', 'descending'];
const THUMB_SIZES: readonly ThumbSize[] = ['small', 'medium', 'large'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function normalizePrefs(value: unknown): PhotosPrefs {
  const raw = record(value);
  return {
    sort: oneOf(raw.sort, SORT_KEYS, DEFAULT_PREFS.sort),
    order: oneOf(raw.order, SORT_ORDERS, DEFAULT_PREFS.order),
    size: oneOf(raw.size, THUMB_SIZES, DEFAULT_PREFS.size),
    info: boolean(raw.info, DEFAULT_PREFS.info),
    sidebar: boolean(raw.sidebar, DEFAULT_PREFS.sidebar),
  };
}

/** Absolute paths only, no blanks and no repeats, in the order first seen. */
export function normalizeFavourites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const path = entry.trim();
    if (!path.startsWith('/') || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

export function normalizeData(value: unknown): PhotosData {
  const raw = record(value);
  return {
    version: typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1,
    prefs: normalizePrefs(raw.prefs),
    favourites: normalizeFavourites(raw.favourites),
  };
}

/** Mark or unmark one picture; the newest mark goes to the end. */
export function toggleFavourite(favourites: readonly string[], path: string): string[] {
  return favourites.includes(path) ? favourites.filter((p) => p !== path) : [...favourites, path];
}

/** Forget pictures that are no longer there — what deleting one has to do. */
export function withoutFavourites(
  favourites: readonly string[],
  paths: readonly string[],
): string[] {
  const gone = new Set(paths);
  return favourites.filter((path) => !gone.has(path));
}
