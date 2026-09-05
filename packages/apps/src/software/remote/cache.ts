/**
 * The catalogue kept between sessions.
 *
 * The storefront should draw the shelves it drew last time before the network
 * answers, so the catalogue is written somewhere it survives a restart. What
 * comes back is read exactly as strictly as a fresh download: browser storage
 * can be edited by anyone with the developer tools open, and a catalogue
 * cached by an older version of the OS may no longer parse.
 *
 * Nothing here reads the clock. `now` is an argument, so a staleness rule can
 * be tested at any moment in either direction.
 */

import { type ParseProblem, type ParseResult, parseCatalogue, parseJson } from './parse';
import type { Catalogue } from './types';

/** The envelope's own version, separate from the catalogue's `format`. */
export const CACHE_VERSION = 1;

/** How long a catalogue is worth drawing before it is refetched. */
export const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface CachedCatalogue {
  version: number;
  /** The base URL it was fetched from; a different store is a different cache. */
  base: string;
  /** Epoch milliseconds at the moment it was fetched. */
  fetchedAt: number;
  catalogue: Catalogue;
}

/** `fresh` — draw it. `stale` — draw it and refetch. `ahead` — the clock moved. */
export type CacheStatus = 'fresh' | 'stale' | 'ahead';

function problem(path: string, message: string): ParseProblem {
  return { path, code: 'bad-value', message };
}

/** The entry to write, with the fetch time passed in rather than read. */
export function cacheEntry(base: string, catalogue: Catalogue, fetchedAt: number): CachedCatalogue {
  return { version: CACHE_VERSION, base, fetchedAt, catalogue };
}

export function serialiseCache(entry: CachedCatalogue): string {
  return JSON.stringify({
    version: entry.version,
    base: entry.base,
    fetchedAt: entry.fetchedAt,
    catalogue: entry.catalogue,
  });
}

export function deserialiseCache(text: string): ParseResult<CachedCatalogue> {
  const json = parseJson(text);
  if (!json.ok) return json;
  const source = json.value;
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return { ok: false, problems: [problem('', 'The stored catalogue is not an object.')] };
  }
  const record = source as Record<string, unknown>;

  const problems: ParseProblem[] = [];
  const version = record.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    problems.push(problem('version', 'The stored catalogue has no version.'));
  } else if (version > CACHE_VERSION) {
    // Written by a newer version of the OS: its fields are not this one's.
    problems.push(problem('version', `Written by a newer version of Lumen OS (cache ${version}).`));
  }

  const base = record.base;
  if (typeof base !== 'string' || base.trim().length === 0) {
    problems.push(problem('base', 'The stored catalogue does not say which store it came from.'));
  }

  const fetchedAt = record.fetchedAt;
  if (typeof fetchedAt !== 'number' || !Number.isSafeInteger(fetchedAt) || fetchedAt < 0) {
    problems.push(problem('fetchedAt', 'The stored catalogue has no fetch time.'));
  }

  const catalogue = parseCatalogue(record.catalogue, 'catalogue');
  if (!catalogue.ok) problems.push(...catalogue.problems);

  if (problems.length > 0 || !catalogue.ok) return { ok: false, problems };
  return {
    ok: true,
    value: {
      version: version as number,
      base: base as string,
      fetchedAt: fetchedAt as number,
      catalogue: catalogue.value,
    },
  };
}

/** Milliseconds since the catalogue was fetched; negative if `now` is behind it. */
export function cacheAge(entry: CachedCatalogue, now: number): number {
  return now - entry.fetchedAt;
}

export function cacheStatus(
  entry: CachedCatalogue,
  now: number,
  maxAge: number = CACHE_MAX_AGE_MS,
): CacheStatus {
  const age = cacheAge(entry, now);
  // A cache from the future says the clock has changed under it, so its age
  // means nothing and it cannot be called fresh.
  if (age < 0) return 'ahead';
  return age >= maxAge ? 'stale' : 'fresh';
}

export function isStale(
  entry: CachedCatalogue,
  now: number,
  maxAge: number = CACHE_MAX_AGE_MS,
): boolean {
  return cacheStatus(entry, now, maxAge) !== 'fresh';
}
