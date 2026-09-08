import { describe, expect, it } from 'vitest';
import { type CachedCatalogue, cacheEntry, parseCatalogue, type StoreError } from './remote';
import { catalogueJson, STORE_BASE } from './remote/fixture';
import {
  type CatalogueView,
  cacheMatches,
  describeAge,
  emptyLines,
  emptyView,
  errorAddress,
  errorHeadline,
  freshnessLine,
  maxCacheAge,
  refreshOnOpen,
  resolveOrigin,
} from './source';

const NOW = Date.parse('2026-09-05T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function catalogue() {
  const parsed = parseCatalogue(catalogueJson());
  if (!parsed.ok) throw new Error('fixture does not parse');
  return parsed.value;
}

function entry(fetchedAt: number, base = STORE_BASE): CachedCatalogue {
  return cacheEntry(base, catalogue(), fetchedAt);
}

function view(patch: Partial<CatalogueView> = {}): CatalogueView {
  return {
    ...emptyView(STORE_BASE),
    catalogue: catalogue(),
    base: STORE_BASE,
    origin: 'network',
    fetchedAt: NOW,
    loading: false,
    ...patch,
  };
}

const OFFLINE: StoreError = {
  reason: 'offline',
  url: `${STORE_BASE}/index.json`,
  cause: null,
  message: 'The store could not be reached. Check the connection and the address.',
};

describe('errorHeadline', () => {
  it('says something different for every kind of failure', () => {
    const errors: StoreError[] = [
      OFFLINE,
      { reason: 'http', url: 'u', status: 404, statusText: '', message: 'm' },
      { reason: 'malformed', url: 'u', problems: [], message: 'm' },
      { reason: 'size', url: 'u', expected: 10, received: 9, message: 'm' },
      { reason: 'too-large', url: 'u', limit: 10, received: 11, message: 'm' },
      { reason: 'digest', url: 'u', expected: 'a', received: 'b', message: 'm' },
      { reason: 'unverifiable', url: 'u', message: 'm' },
      { reason: 'aborted', url: 'u', message: 'm' },
      { reason: 'url', base: 'b', path: 'p', message: 'm' },
    ];
    const headlines = errors.map(errorHeadline);
    expect(new Set(headlines).size).toBe(errors.length);
    expect(headlines[1]).toBe('The store answered 404');
  });
});

describe('resolveOrigin', () => {
  it('leaves an absolute address alone', () => {
    expect(resolveOrigin('https://store.example/shelf/', 'https://lumen.example/')).toBe(
      'https://store.example/shelf/',
    );
  });

  it('resolves the copy served beside the OS against the page', () => {
    expect(resolveOrigin('/store/', 'https://lumen.example/desktop/index.html')).toBe(
      'https://lumen.example/store/',
    );
  });

  it('hands back what was configured when it cannot be resolved at all', () => {
    expect(resolveOrigin('/store/', undefined)).toBe('/store/');
    expect(resolveOrigin('  ', 'https://lumen.example/')).toBe('  ');
  });
});

describe('errorAddress', () => {
  it('names the URL, or the store for a path that never became one', () => {
    expect(errorAddress(OFFLINE)).toBe(`${STORE_BASE}/index.json`);
    expect(errorAddress({ reason: 'url', base: STORE_BASE, path: '../etc', message: 'm' })).toBe(
      STORE_BASE,
    );
  });
});

describe('describeAge', () => {
  it('rounds to the unit a reader would use', () => {
    expect(describeAge(20_000)).toBe('moments ago');
    expect(describeAge(MINUTE)).toBe('1 minute ago');
    expect(describeAge(12 * MINUTE)).toBe('12 minutes ago');
    expect(describeAge(HOUR)).toBe('1 hour ago');
    expect(describeAge(5 * HOUR)).toBe('5 hours ago');
    expect(describeAge(50 * HOUR)).toBe('2 days ago');
  });

  it('says so when the clock has moved backwards under it', () => {
    expect(describeAge(-1000)).toBe('from a time later than now');
  });
});

describe('freshnessLine', () => {
  it('states the age of what is drawn', () => {
    expect(freshnessLine(view({ fetchedAt: NOW - 2 * MINUTE }), NOW)).toBe(
      'Fetched 2 minutes ago.',
    );
    expect(freshnessLine(view({ origin: 'cache', fetchedAt: NOW - 3 * HOUR }), NOW)).toBe(
      'Kept from a previous session, fetched 3 hours ago.',
    );
  });

  it('names the failure over a catalogue it can still draw', () => {
    const line = freshnessLine(
      view({ origin: 'cache', fetchedAt: NOW - HOUR, error: OFFLINE }),
      NOW,
    );
    expect(line).toBe('The store could not be reached. Showing the catalogue fetched 1 hour ago.');
  });

  it('says when the copy inside the OS is what is on screen', () => {
    expect(freshnessLine(view({ origin: 'bundled', fetchedAt: null, error: OFFLINE }), NOW)).toBe(
      'The store could not be reached. Showing the catalogue that ships with Lumen OS.',
    );
    expect(freshnessLine(view({ origin: 'bundled', fetchedAt: null }), NOW)).toBe(
      'Showing the catalogue that ships with Lumen OS.',
    );
  });

  it('says what it is doing while it fetches, and when it has nothing', () => {
    expect(freshnessLine(view({ refreshing: true }), NOW)).toBe('Fetching the catalogue…');
    expect(freshnessLine(view({ catalogue: null }), NOW)).toBe('No catalogue.');
  });
});

describe('emptyLines', () => {
  it('names the address it tried, with the reason it failed', () => {
    const lines = emptyLines(view({ catalogue: null, error: OFFLINE }));
    expect(lines.title).toBe('The store could not be reached');
    expect(lines.description).toContain(STORE_BASE);
    expect(lines.description).toContain('Check the connection');
  });

  it('reads differently before anything has been tried', () => {
    const lines = emptyLines(emptyView(STORE_BASE));
    expect(lines.title).toBe('No catalogue yet');
    expect(lines.description).toContain(STORE_BASE);
  });
});

describe('refreshOnOpen', () => {
  it('fetches and waits when there is nothing kept', () => {
    expect(refreshOnOpen(null, { now: NOW, autoSync: true, syncMinutes: 360 })).toEqual({
      fetch: true,
      behind: false,
    });
  });

  it('draws a fresh cache and leaves the network alone', () => {
    const decision = refreshOnOpen(entry(NOW - HOUR), {
      now: NOW,
      autoSync: true,
      syncMinutes: 360,
    });
    expect(decision).toEqual({ fetch: false, behind: true });
  });

  it('draws a stale cache and refetches behind it', () => {
    const decision = refreshOnOpen(entry(NOW - 7 * HOUR), {
      now: NOW,
      autoSync: true,
      syncMinutes: 360,
    });
    expect(decision).toEqual({ fetch: true, behind: true });
  });

  it('leaves it to the Refresh button when automatic sync is off', () => {
    expect(
      refreshOnOpen(entry(NOW - 7 * 24 * HOUR), { now: NOW, autoSync: false, syncMinutes: 360 }),
    ).toEqual({ fetch: false, behind: false });
  });

  it('treats a zero interval as "only when asked"', () => {
    expect(maxCacheAge(0)).toBe(Number.POSITIVE_INFINITY);
    expect(maxCacheAge(360)).toBe(6 * HOUR);
    expect(
      refreshOnOpen(entry(NOW - 7 * 24 * HOUR), { now: NOW, autoSync: true, syncMinutes: 0 }),
    ).toEqual({ fetch: false, behind: true });
  });
});

describe('cacheMatches', () => {
  it('refuses a cache written for another store', () => {
    expect(cacheMatches(entry(NOW), STORE_BASE)).toBe(true);
    expect(cacheMatches(entry(NOW, 'https://elsewhere.example/'), STORE_BASE)).toBe(false);
  });
});
