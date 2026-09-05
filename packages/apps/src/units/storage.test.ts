import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS, DEFAULT_PAIR } from './catalogue';
import {
  clearRecents,
  DEFAULT_DATA,
  normalizeData,
  pairFor,
  RECENT_LIMIT,
  type RecentConversion,
  recentKey,
  recordConversion,
  setPair,
  type UnitsData,
} from './storage';

const recent = (from: string, to: string, value: number, at = 0): RecentConversion => ({
  from,
  to,
  value,
  at,
});

describe('reading the file', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('units')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
    expect(normalizeData(undefined)).toEqual(DEFAULT_DATA);
  });

  it('keeps a valid document as it is', () => {
    const data: UnitsData = {
      category: 'temperature',
      pairs: { temperature: { from: 'temperature.celsius', to: 'temperature.kelvin' } },
      recents: [recent('temperature.celsius', 'temperature.kelvin', 20, 5)],
      showRecents: false,
    };
    expect(normalizeData(data)).toEqual(data);
  });

  it('drops a category it does not have', () => {
    expect(normalizeData({ category: 'luminance' }).category).toBe('length');
    expect(normalizeData({ category: 7 }).category).toBe('length');
  });

  it('drops a pair naming a unit that no longer exists', () => {
    expect(
      normalizeData({ pairs: { length: { from: 'length.smoot', to: 'length.metre' } } }).pairs,
    ).toEqual({});
  });

  it('drops a pair filed under the wrong category', () => {
    expect(
      normalizeData({ pairs: { length: { from: 'mass.gram', to: 'mass.kilogram' } } }).pairs,
    ).toEqual({});
  });

  it('drops recents that name a unit that no longer exists', () => {
    const raw = {
      recents: [
        recent('length.metre', 'length.foot', 1),
        recent('length.smoot', 'length.foot', 1),
        recent('length.metre', 'mass.gram', 1),
      ],
    };
    expect(normalizeData(raw).recents).toEqual([recent('length.metre', 'length.foot', 1)]);
  });

  it('drops a recent whose value is not a finite number', () => {
    const raw = {
      recents: [
        { from: 'length.metre', to: 'length.foot', value: 'one', at: 0 },
        { from: 'length.metre', to: 'length.foot', value: null, at: 0 },
        recent('length.metre', 'length.foot', 2),
      ],
    };
    expect(normalizeData(raw).recents).toEqual([recent('length.metre', 'length.foot', 2)]);
  });

  it('accepts a recent with no timestamp and files it at zero', () => {
    const raw = { recents: [{ from: 'length.metre', to: 'length.foot', value: 1 }] };
    expect(normalizeData(raw).recents[0]?.at).toBe(0);
  });

  it('caps the recents at the limit', () => {
    const many = Array.from({ length: RECENT_LIMIT + 8 }, (_, i) =>
      recent('length.metre', 'length.foot', i),
    );
    expect(normalizeData({ recents: many }).recents).toHaveLength(RECENT_LIMIT);
  });

  it('reads the recents preference as a boolean and defaults it to on', () => {
    expect(normalizeData({}).showRecents).toBe(true);
    expect(normalizeData({ showRecents: false }).showRecents).toBe(false);
    expect(normalizeData({ showRecents: 'yes' }).showRecents).toBe(true);
  });

  it('survives a recents field that is not a list', () => {
    expect(normalizeData({ recents: 'none' }).recents).toEqual([]);
    expect(normalizeData({ pairs: 'none' }).pairs).toEqual({});
  });

  it('hands back a fresh copy of the default lists', () => {
    const first = normalizeData(null);
    first.recents.push(recent('length.metre', 'length.foot', 1));
    expect(normalizeData(null).recents).toEqual([]);
  });
});

describe('the pair a category opens on', () => {
  it('is the catalogue default until one has been used', () => {
    const data = normalizeData(null);
    for (const id of CATEGORY_IDS) {
      const [from, to] = DEFAULT_PAIR[id];
      expect(pairFor(data, id)).toEqual({ from, to });
    }
  });

  it('is the pair last used in that category', () => {
    const data = setPair(normalizeData(null), 'length', {
      from: 'length.mile',
      to: 'length.kilometre',
    });
    expect(pairFor(data, 'length')).toEqual({ from: 'length.mile', to: 'length.kilometre' });
    // Another category is untouched by it.
    expect(pairFor(data, 'mass')).toEqual({ from: 'mass.kilogram', to: 'mass.pound' });
  });

  it('refuses a pair from the wrong category', () => {
    const data = normalizeData(null);
    expect(setPair(data, 'length', { from: 'mass.gram', to: 'length.metre' })).toBe(data);
  });

  it('does not rewrite the file when nothing changed', () => {
    const data = setPair(normalizeData(null), 'length', {
      from: 'length.metre',
      to: 'length.foot',
    });
    expect(setPair(data, 'length', { from: 'length.metre', to: 'length.foot' })).toBe(data);
  });
});

describe('keeping a conversion', () => {
  const base = normalizeData(null);

  it('puts the newest first', () => {
    const one = recordConversion(base, recent('length.metre', 'length.foot', 1, 10));
    const two = recordConversion(one, recent('length.mile', 'length.kilometre', 5, 20));
    expect(two.recents.map((r) => r.value)).toEqual([5, 1]);
  });

  it('moves a repeat back to the top instead of listing it twice', () => {
    const one = recordConversion(base, recent('length.metre', 'length.foot', 1, 10));
    const two = recordConversion(one, recent('length.mile', 'length.kilometre', 5, 20));
    const three = recordConversion(two, recent('length.metre', 'length.foot', 1, 30));
    expect(three.recents).toHaveLength(2);
    expect(three.recents[0]).toEqual(recent('length.metre', 'length.foot', 1, 30));
  });

  it('treats a different value between the same units as a different entry', () => {
    const one = recordConversion(base, recent('length.metre', 'length.foot', 1, 10));
    const two = recordConversion(one, recent('length.metre', 'length.foot', 2, 20));
    expect(two.recents).toHaveLength(2);
  });

  it('treats the reversed pair as a different entry', () => {
    const one = recordConversion(base, recent('length.metre', 'length.foot', 1, 10));
    const two = recordConversion(one, recent('length.foot', 'length.metre', 1, 20));
    expect(two.recents).toHaveLength(2);
  });

  it('stops at the limit, dropping the oldest', () => {
    let data = base;
    for (let i = 0; i < RECENT_LIMIT + 5; i += 1) {
      data = recordConversion(data, recent('length.metre', 'length.foot', i, i));
    }
    expect(data.recents).toHaveLength(RECENT_LIMIT);
    expect(data.recents[0]?.value).toBe(RECENT_LIMIT + 4);
  });

  it('refuses an entry naming a unit that does not exist', () => {
    expect(recordConversion(base, recent('length.smoot', 'length.foot', 1))).toBe(base);
  });

  it('refuses a value that is not a finite number', () => {
    expect(recordConversion(base, recent('length.metre', 'length.foot', Number.NaN))).toBe(base);
    expect(
      recordConversion(base, recent('length.metre', 'length.foot', Number.POSITIVE_INFINITY)),
    ).toBe(base);
  });

  it('clears the whole list, and leaves an empty one alone', () => {
    const one = recordConversion(base, recent('length.metre', 'length.foot', 1));
    expect(clearRecents(one).recents).toEqual([]);
    expect(clearRecents(base)).toBe(base);
  });

  it('gives every distinct entry a distinct key', () => {
    const entries = [
      recent('length.metre', 'length.foot', 1),
      recent('length.metre', 'length.foot', 2),
      recent('length.foot', 'length.metre', 1),
      recent('length.metre', 'length.yard', 1),
    ];
    expect(new Set(entries.map(recentKey)).size).toBe(entries.length);
  });
});
