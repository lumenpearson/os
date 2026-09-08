import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_AGE_MS,
  CACHE_VERSION,
  cacheAge,
  cacheEntry,
  cacheStatus,
  deserialiseCache,
  isStale,
  serialiseCache,
} from './cache';
import { catalogueJson, POMODORO, STORE_BASE } from './fixture';
import { type ParseResult, parseCatalogue } from './parse';
import type { Catalogue } from './types';

/** A fixed moment, so nothing here depends on when the tests run. */
const FETCHED_AT = Date.parse('2026-09-05T09:00:00Z');

function catalogue(patch: Record<string, unknown> = {}): Catalogue {
  const result = parseCatalogue(catalogueJson(patch));
  if (!result.ok) throw new Error('the fixture catalogue should parse');
  return result.value;
}

function entry(patch: Partial<ReturnType<typeof cacheEntry>> = {}) {
  return { ...cacheEntry(STORE_BASE, catalogue(), FETCHED_AT), ...patch };
}

function refusal<T>(result: ParseResult<T>) {
  if (result.ok) throw new Error('expected the stored catalogue to be refused');
  return result.problems;
}

describe('serialiseCache and deserialiseCache', () => {
  it('returns what was stored', () => {
    const stored = entry();
    const read = deserialiseCache(serialiseCache(stored));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toEqual(stored);
    expect(read.value.catalogue.packages.map((p) => p.id)).toContain(POMODORO);
  });

  it('stamps the envelope with the version that wrote it', () => {
    expect(cacheEntry(STORE_BASE, catalogue(), FETCHED_AT).version).toBe(CACHE_VERSION);
  });

  it('refuses text that is not JSON', () => {
    expect(refusal(deserialiseCache('not json'))[0]?.code).toBe('json');
    expect(refusal(deserialiseCache(''))[0]?.code).toBe('json');
    expect(refusal(deserialiseCache('[1,2]'))[0]?.message).toContain('not an object');
  });

  it('refuses an envelope written by a newer version of the OS', () => {
    const text = serialiseCache(entry({ version: CACHE_VERSION + 1 }));
    expect(refusal(deserialiseCache(text))[0]?.message).toContain('newer version');
  });

  it('refuses an envelope missing what it was fetched from and when', () => {
    const text = serialiseCache(entry({ base: '', fetchedAt: -1 }));
    const problems = refusal(deserialiseCache(text));
    expect(problems.map((problem) => problem.path)).toEqual(['base', 'fetchedAt']);
  });

  it('reads the stored catalogue as strictly as a fresh one', () => {
    const text = JSON.stringify({
      version: CACHE_VERSION,
      base: STORE_BASE,
      fetchedAt: FETCHED_AT,
      catalogue: { ...catalogueJson(), format: 2 },
    });
    const problems = refusal(deserialiseCache(text));
    expect(problems[0]?.code).toBe('unsupported-format');
    expect(problems[0]?.path).toBe('catalogue.format');
  });

  it('refuses an envelope with no catalogue in it', () => {
    const text = JSON.stringify({ version: CACHE_VERSION, base: STORE_BASE, fetchedAt: 0 });
    expect(refusal(deserialiseCache(text))[0]?.path).toBe('catalogue');
  });
});

describe('cacheAge', () => {
  it('is measured against the moment it is given', () => {
    expect(cacheAge(entry(), FETCHED_AT + 1000)).toBe(1000);
    expect(cacheAge(entry(), FETCHED_AT)).toBe(0);
    expect(cacheAge(entry(), FETCHED_AT - 500)).toBe(-500);
  });
});

describe('cacheStatus', () => {
  it('is fresh up to the age limit and stale from it', () => {
    expect(cacheStatus(entry(), FETCHED_AT)).toBe('fresh');
    expect(cacheStatus(entry(), FETCHED_AT + CACHE_MAX_AGE_MS - 1)).toBe('fresh');
    expect(cacheStatus(entry(), FETCHED_AT + CACHE_MAX_AGE_MS)).toBe('stale');
  });

  it('takes the limit as an argument', () => {
    expect(cacheStatus(entry(), FETCHED_AT + 60_000, 30_000)).toBe('stale');
    expect(cacheStatus(entry(), FETCHED_AT + 60_000, 120_000)).toBe('fresh');
  });

  it('says so when the clock has moved behind the cache', () => {
    expect(cacheStatus(entry(), FETCHED_AT - 1)).toBe('ahead');
  });
});

describe('isStale', () => {
  it('is anything that is not fresh, including a cache from the future', () => {
    expect(isStale(entry(), FETCHED_AT + 1000)).toBe(false);
    expect(isStale(entry(), FETCHED_AT + CACHE_MAX_AGE_MS)).toBe(true);
    expect(isStale(entry(), FETCHED_AT - 1)).toBe(true);
  });
});
