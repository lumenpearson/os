import { describe, expect, it } from 'vitest';
import { compareValues, rankMap, type SortValue, sortRows, toggleSort } from './sort';

interface Row {
  id: string;
  n: number;
  text: string;
  flag: boolean;
  maybe: number | null;
}

const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  n: 0,
  text: '',
  flag: false,
  maybe: null,
  ...over,
});

describe('compareValues', () => {
  it('orders numbers by value, not by their text', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(-1, 0)).toBeLessThan(0);
    expect(compareValues(3, 3)).toBe(0);
  });

  it('orders false before true', () => {
    expect(compareValues(false, true)).toBeLessThan(0);
    expect(compareValues(true, false)).toBeGreaterThan(0);
    expect(compareValues(true, true)).toBe(0);
  });

  it('orders text without regard to case and with numbers read as numbers', () => {
    expect(compareValues('apple', 'Banana')).toBeLessThan(0);
    expect(compareValues('Apple', 'apple')).toBe(0);
    expect(compareValues('item2', 'item10')).toBeLessThan(0);
  });

  it('sorts values the platform cannot report to the end', () => {
    expect(compareValues(null, 5)).toBeGreaterThan(0);
    expect(compareValues(5, null)).toBeLessThan(0);
    expect(compareValues(undefined, 'a')).toBeGreaterThan(0);
    expect(compareValues(null, undefined)).toBe(0);
  });
});

describe('sortRows', () => {
  const rows: Row[] = [
    row('a', { n: 3, text: 'Beta', flag: true }),
    row('b', { n: 1, text: 'alpha', flag: false }),
    row('c', { n: 2, text: 'Gamma', flag: true }),
  ];
  const ids = (list: readonly Row[]) => list.map((r) => r.id);

  it('sorts numbers in both directions', () => {
    expect(ids(sortRows(rows, (r) => r.n))).toEqual(['b', 'c', 'a']);
    expect(ids(sortRows(rows, (r) => r.n, 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('sorts text in both directions', () => {
    expect(ids(sortRows(rows, (r) => r.text))).toEqual(['b', 'a', 'c']);
    expect(ids(sortRows(rows, (r) => r.text, 'desc'))).toEqual(['c', 'a', 'b']);
  });

  it('sorts flags in both directions', () => {
    expect(ids(sortRows(rows, (r) => r.flag))).toEqual(['b', 'a', 'c']);
    expect(ids(sortRows(rows, (r) => r.flag, 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('is stable: rows with the same key keep the order they arrived in', () => {
    const same: Row[] = [row('a'), row('b'), row('c'), row('d')];
    expect(ids(sortRows(same, (r) => r.n))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(sortRows(same, (r) => r.n, 'desc'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps unmeasured values at the bottom in both directions', () => {
    const mixed: Row[] = [
      row('a', { maybe: null }),
      row('b', { maybe: 5 }),
      row('c', { maybe: null }),
      row('d', { maybe: 1 }),
    ];
    expect(ids(sortRows(mixed, (r) => r.maybe))).toEqual(['d', 'b', 'a', 'c']);
    expect(ids(sortRows(mixed, (r) => r.maybe, 'desc'))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('leaves the input array untouched', () => {
    const input = [...rows];
    sortRows(input, (r) => r.n, 'desc');
    expect(ids(input)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(sortRows<Row>([], (r) => r.n)).toEqual([]);
  });
});

describe('rankMap', () => {
  const ordered = [row('a'), row('b'), row('c')];
  const key = (r: Row) => r.id;

  it('numbers an ascending order upwards', () => {
    expect([...rankMap(ordered, key, 'asc')]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('numbers a descending order downwards', () => {
    expect([...rankMap(ordered, key, 'desc')]).toEqual([
      ['a', -0],
      ['b', -1],
      ['c', -2],
    ]);
  });

  it('survives a second sort by rank in the same direction', () => {
    // DataTable re-sorts by the accessor and applies the direction itself;
    // the rank has to reproduce the order it was given.
    for (const direction of ['asc', 'desc'] as const) {
      const ranks = rankMap(ordered, key, direction);
      const sign = direction === 'asc' ? 1 : -1;
      const again = [...ordered].sort(
        (a, b) => ((ranks.get(key(a)) ?? 0) - (ranks.get(key(b)) ?? 0)) * sign,
      );
      expect(again.map(key)).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('toggleSort', () => {
  it('starts a new column ascending', () => {
    expect(toggleSort({ column: 'name', direction: 'desc' }, 'pid')).toEqual({
      column: 'pid',
      direction: 'asc',
    });
  });

  it('flips the column that is already sorted', () => {
    expect(toggleSort({ column: 'pid', direction: 'asc' }, 'pid')).toEqual({
      column: 'pid',
      direction: 'desc',
    });
    expect(toggleSort({ column: 'pid', direction: 'desc' }, 'pid')).toEqual({
      column: 'pid',
      direction: 'asc',
    });
  });
});

describe('column value types', () => {
  it('compares every type a column can yield', () => {
    const values: SortValue[] = [3, 'text', true, null, undefined];
    for (const value of values) expect(compareValues(value, value)).toBe(0);
  });
});
