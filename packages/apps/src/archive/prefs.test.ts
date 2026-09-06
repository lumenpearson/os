import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, normalizePrefs } from './prefs';

describe('normalizePrefs', () => {
  it('falls back for anything that is not an object', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('sort by size')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(42)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
  });

  it('keeps a sort it recognises', () => {
    expect(normalizePrefs({ sort: { column: 'packed', direction: 'desc' } }).sort).toEqual({
      column: 'packed',
      direction: 'desc',
    });
  });

  it('replaces a column it does not have', () => {
    expect(normalizePrefs({ sort: { column: 'colour', direction: 'asc' } }).sort.column).toBe(
      'name',
    );
  });

  it('reads anything but "desc" as ascending', () => {
    expect(normalizePrefs({ sort: { column: 'size', direction: 'sideways' } }).sort.direction).toBe(
      'asc',
    );
  });

  it('takes only a real true for the byte display', () => {
    expect(normalizePrefs({ exactBytes: true }).exactBytes).toBe(true);
    expect(normalizePrefs({ exactBytes: 'yes' }).exactBytes).toBe(false);
    expect(normalizePrefs({}).exactBytes).toBe(false);
  });

  it('leaves the details panel open unless it was shut', () => {
    expect(normalizePrefs({}).showDetails).toBe(true);
    expect(normalizePrefs({ showDetails: false }).showDetails).toBe(false);
    expect(normalizePrefs({ showDetails: 'no' }).showDetails).toBe(true);
  });

  it('survives a file with the wrong shapes in it', () => {
    expect(normalizePrefs({ sort: 'name', exactBytes: [], showDetails: 0 })).toEqual({
      sort: DEFAULT_PREFS.sort,
      exactBytes: false,
      showDetails: true,
    });
  });
});
