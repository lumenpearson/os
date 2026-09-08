import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  columnOf,
  columnsFor,
  moveCursor,
  rowOf,
  rowsFor,
  scrollTopFor,
  visibleRows,
} from './grid';

describe('columnsFor', () => {
  it('fits whole cells and never fewer than one', () => {
    expect(columnsFor(400, 40)).toBe(10);
    expect(columnsFor(419, 40)).toBe(10);
    expect(columnsFor(0, 40)).toBe(1);
    expect(columnsFor(-100, 40)).toBe(1);
  });

  it('defaults to the cell the grid actually draws', () => {
    expect(columnsFor(CELL_SIZE * 7)).toBe(7);
  });
});

describe('rowsFor', () => {
  it('gives the last, short row a row of its own', () => {
    expect(rowsFor(100, 10)).toBe(10);
    expect(rowsFor(101, 10)).toBe(11);
    expect(rowsFor(0, 10)).toBe(0);
    expect(rowsFor(5, 0)).toBe(0);
  });
});

describe('rowOf and columnOf', () => {
  it('place an index in the grid', () => {
    expect(rowOf(0, 10)).toBe(0);
    expect(rowOf(23, 10)).toBe(2);
    expect(columnOf(23, 10)).toBe(3);
  });
});

describe('visibleRows', () => {
  it('covers the viewport with a margin either side', () => {
    expect(visibleRows(0, 400, 1000, 40, 4)).toEqual({ start: 0, end: 15 });
    expect(visibleRows(4000, 400, 1000, 40, 4)).toEqual({ start: 96, end: 115 });
  });

  it('never runs past either end', () => {
    expect(visibleRows(-100, 400, 10, 40, 4).start).toBe(0);
    expect(visibleRows(1_000_000, 400, 10, 40, 4)).toEqual({ start: 5, end: 10 });
  });

  it('has nothing to build for an empty grid', () => {
    expect(visibleRows(0, 400, 0)).toEqual({ start: 0, end: 0 });
    expect(visibleRows(0, 400, 10, 0)).toEqual({ start: 0, end: 0 });
  });

  it('builds every row when they all fit', () => {
    expect(visibleRows(0, 4000, 12, 40, 4)).toEqual({ start: 0, end: 12 });
  });
});

describe('moveCursor', () => {
  const count = 25;
  const columns = 10;

  it('moves one cell at a time, across rows', () => {
    expect(moveCursor(0, count, columns, 'ArrowRight')).toBe(1);
    expect(moveCursor(10, count, columns, 'ArrowLeft')).toBe(9);
  });

  it('stops at the ends rather than wrapping', () => {
    expect(moveCursor(0, count, columns, 'ArrowLeft')).toBe(0);
    expect(moveCursor(24, count, columns, 'ArrowRight')).toBe(24);
  });

  it('moves a row at a time and stays put when there is no row to move to', () => {
    expect(moveCursor(12, count, columns, 'ArrowUp')).toBe(2);
    expect(moveCursor(2, count, columns, 'ArrowUp')).toBe(2);
    expect(moveCursor(12, count, columns, 'ArrowDown')).toBe(22);
    // The last row is short: down from 18 would land past the end, so it stays.
    expect(moveCursor(18, count, columns, 'ArrowDown')).toBe(18);
  });

  it('goes to the first and last character', () => {
    expect(moveCursor(12, count, columns, 'Home')).toBe(0);
    expect(moveCursor(12, count, columns, 'End')).toBe(24);
  });

  it('pages by whole screens, clamped', () => {
    expect(moveCursor(0, 1000, 10, 'PageDown', 5)).toBe(50);
    expect(moveCursor(50, 1000, 10, 'PageUp', 5)).toBe(0);
    expect(moveCursor(20, 25, 10, 'PageDown', 5)).toBe(24);
  });

  it('leaves keys it does not own alone', () => {
    expect(moveCursor(0, count, columns, 'Enter')).toBeNull();
    expect(moveCursor(0, count, columns, 'a')).toBeNull();
  });

  it('has nowhere to go in an empty grid', () => {
    expect(moveCursor(0, 0, columns, 'ArrowRight')).toBeNull();
  });

  it('never leaves the grid, whatever the key', () => {
    const keys = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ];
    for (let cursor = 0; cursor < count; cursor += 1) {
      for (const key of keys) {
        const next = moveCursor(cursor, count, columns, key, 3);
        expect(next, `${key} from ${cursor}`).not.toBeNull();
        expect(next as number).toBeGreaterThanOrEqual(0);
        expect(next as number).toBeLessThan(count);
      }
    }
  });
});

describe('scrollTopFor', () => {
  it('leaves a visible row where it is', () => {
    expect(scrollTopFor(3, 0, 400, 40)).toBe(0);
  });

  it('scrolls up just far enough', () => {
    expect(scrollTopFor(2, 200, 400, 40)).toBe(80);
  });

  it('scrolls down just far enough', () => {
    expect(scrollTopFor(20, 0, 400, 40)).toBe(440);
  });

  it('shows the top of a cell taller than the viewport', () => {
    expect(scrollTopFor(0, 0, 20, 40)).toBe(0);
    expect(scrollTopFor(3, 0, 20, 40)).toBe(120);
  });
});
