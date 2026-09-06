/**
 * Where the catalogue in the window came from, and what to say about it.
 *
 * The storefront has four states to tell apart and one sentence for each: it
 * fetched the catalogue just now, it is drawing the one it kept from last time
 * (and how old that is), it fell back to the copy that ships beside the OS, or
 * it has nothing and has to say which address it tried. The store client makes
 * the same distinction for failures — offline, a status, a body that will not
 * parse, the wrong length, the wrong bytes — and carries a sentence with each,
 * so this adds the heading, not a second guess at the cause.
 */

import { type CachedCatalogue, type Catalogue, isStale, type StoreError } from './remote';

/** `network` — fetched now. `cache` — kept from a previous session. `bundled` — shipped with the OS. */
export type CatalogueOrigin = 'network' | 'cache' | 'bundled';

export interface CatalogueView {
  catalogue: Catalogue | null;
  /** The base URL the catalogue in hand came from. */
  base: string | null;
  origin: CatalogueOrigin | null;
  /** Epoch milliseconds; null for the bundled copy, which has no fetch of its own. */
  fetchedAt: number | null;
  /** The address the storefront asked, whether or not it answered. */
  address: string;
  /** The last failure, kept even when there is something to draw. */
  error: StoreError | null;
  /** True until the first attempt has finished. */
  loading: boolean;
  /** True while a fetch runs behind a catalogue that is already drawn. */
  refreshing: boolean;
}

export function emptyView(address: string): CatalogueView {
  return {
    catalogue: null,
    base: null,
    origin: null,
    fetchedAt: null,
    address,
    error: null,
    loading: true,
    refreshing: false,
  };
}

/** The heading over a failure. The sentence under it is the error's own. */
export function errorHeadline(error: StoreError): string {
  switch (error.reason) {
    case 'offline':
      return 'The store could not be reached';
    case 'http':
      return `The store answered ${error.status}`;
    case 'malformed':
      return 'The catalogue could not be read';
    case 'size':
      return 'The download was the wrong length';
    case 'too-large':
      return 'That file is too large to read';
    case 'digest':
      return 'The download failed its checksum';
    case 'unverifiable':
      return 'This connection cannot verify a download';
    case 'aborted':
      return 'The download was stopped';
    case 'url':
      return 'That is not a store address';
  }
}

/**
 * The store address as something that can be fetched.
 *
 * The setting may be a path rather than a URL — `/store/` is the copy served
 * beside the OS by whatever host serves the OS — and the store client only
 * takes absolute addresses, so a relative one is resolved against the page
 * before it is handed over. Anything that will not resolve is passed through
 * untouched, so the refusal names what was actually configured.
 */
export function resolveOrigin(base: string, href: string | undefined): string {
  const trimmed = base.trim();
  if (trimmed.length === 0) return base;
  try {
    return new URL(trimmed).href;
  } catch {
    /* not absolute: try it against the page */
  }
  if (href === undefined) return base;
  try {
    return new URL(trimmed, href).href;
  } catch {
    return base;
  }
}

/** The address a failure is about: a bad path names the store, everything else a URL. */
export function errorAddress(error: StoreError): string {
  return error.reason === 'url' ? error.base : error.url;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How old a catalogue is, in prose. British spelling, no clock arithmetic on screen. */
export function describeAge(ms: number): string {
  if (ms < 0) return 'from a time later than now';
  if (ms < MINUTE) return 'moments ago';
  if (ms < HOUR) {
    const minutes = Math.round(ms / MINUTE);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.round(ms / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * The line above the shelves: what is being drawn and how current it is. It
 * names the failure when there is one, because a catalogue drawn from last
 * week should not look like one drawn a second ago.
 */
export function freshnessLine(view: CatalogueView, now: number): string {
  if (view.refreshing) return 'Fetching the catalogue…';
  if (view.catalogue === null) return 'No catalogue.';
  const age = view.fetchedAt === null ? null : describeAge(now - view.fetchedAt);
  if (view.origin === 'bundled') {
    return view.error === null
      ? 'Showing the catalogue that ships with Lumen OS.'
      : `${errorHeadline(view.error)}. Showing the catalogue that ships with Lumen OS.`;
  }
  if (view.error !== null) {
    return age === null
      ? `${errorHeadline(view.error)}.`
      : `${errorHeadline(view.error)}. Showing the catalogue fetched ${age}.`;
  }
  if (view.origin === 'cache') return `Kept from a previous session, fetched ${age}.`;
  return `Fetched ${age}.`;
}

/** The empty state: nothing to draw, and the address that was asked. */
export function emptyLines(view: CatalogueView): { title: string; description: string } {
  if (view.error === null) {
    return {
      title: 'No catalogue yet',
      description: `Nothing has been fetched from ${view.address} yet. Refresh to try it.`,
    };
  }
  return {
    title: errorHeadline(view.error),
    description: `${view.error.message} The address tried was ${view.address}.`,
  };
}

/** `syncMinutes` as a cache lifetime. 0 means the catalogue only refreshes when asked. */
export function maxCacheAge(syncMinutes: number): number {
  if (!Number.isFinite(syncMinutes) || syncMinutes <= 0) return Number.POSITIVE_INFINITY;
  return syncMinutes * MINUTE;
}

export interface RefreshDecision {
  fetch: boolean;
  /** True when there is a catalogue on screen and the fetch happens behind it. */
  behind: boolean;
}

/**
 * What to do when the window opens. Nothing cached means fetch and wait; a
 * cached catalogue past its age means draw it and fetch behind it; a fresh one
 * means leave the network alone.
 */
export function refreshOnOpen(
  entry: CachedCatalogue | null,
  options: { now: number; autoSync: boolean; syncMinutes: number },
): RefreshDecision {
  if (entry === null) return { fetch: true, behind: false };
  if (!options.autoSync) return { fetch: false, behind: false };
  return { fetch: isStale(entry, options.now, maxCacheAge(options.syncMinutes)), behind: true };
}

/** A cache is only worth drawing when it came from the store now configured. */
export function cacheMatches(entry: CachedCatalogue, base: string): boolean {
  return entry.base === base;
}
