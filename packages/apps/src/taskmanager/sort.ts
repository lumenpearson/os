/**
 * Column sorting for the tables. The app owns the order: rows are sorted here
 * and handed to DataTable already ordered, with `rankMap` feeding its header
 * state (see rankMap's note).
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState<C extends string = string> {
  column: C;
  direction: SortDirection;
}

/** What a column can yield: a number, text, a flag, or nothing measured. */
export type SortValue = string | number | boolean | null | undefined;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Ascending order for one cell. Values the platform cannot report sort last in
 * both directions, so an em-dash never wins a "largest first" sort.
 */
export function compareValues(a: SortValue, b: SortValue): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/** Stable sort by one accessor. Equal rows keep the order they arrived in. */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection = 'asc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      const missing =
        a.key === null || a.key === undefined || b.key === null || b.key === undefined;
      const cmp = compareValues(a.key, b.key);
      // Missing values stay at the bottom, so their order is not flipped.
      if (cmp !== 0) return missing ? cmp : cmp * sign;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * DataTable sorts by its own accessor and applies the direction itself.
 * Giving it `sign * position` for rows this module already ordered keeps the
 * rendered order and the header's aria-sort in agreement.
 */
export function rankMap<T, K>(
  ordered: readonly T[],
  key: (row: T) => K,
  direction: SortDirection,
): Map<K, number> {
  const sign = direction === 'asc' ? 1 : -1;
  const out = new Map<K, number>();
  ordered.forEach((row, i) => {
    out.set(key(row), sign * i);
  });
  return out;
}

/** Clicking a header: the same column flips, a new column starts ascending. */
export function toggleSort<C extends string>(current: SortState<C>, column: C): SortState<C> {
  if (current.column !== column) return { column, direction: 'asc' };
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}
