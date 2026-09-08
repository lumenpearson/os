import { describe, expect, it } from 'vitest';
import {
  columnsFor,
  GRID_GAP,
  GRID_PAD,
  moveCursor,
  rowCount,
  rowHeight,
  rowsPerPage,
  rowTop,
  scrollTopFor,
  TILE_MIN_WIDTH,
  visibleRange,
} from './grid';

describe('columnsFor', () => {
  it('fits as many columns as the width allows', () => {
    const min = TILE_MIN_WIDTH.medium;
    expect(columnsFor(min, 'medium')).toBe(1);
    expect(columnsFor(min * 2 + GRID_GAP, 'medium')).toBe(2);
    expect(columnsFor(min * 3 + GRID_GAP * 2, 'medium')).toBe(3);
  });

  it('drops a column one pixel before it stops fitting', () => {
    const min = TILE_MIN_WIDTH.medium;
    expect(columnsFor(min * 2 + GRID_GAP - 1, 'medium')).toBe(1);
  });

  it('never reports fewer than one column, however narrow the window', () => {
    for (const width of [0, -10, 1, 40, Number.NaN]) {
      expect(columnsFor(width, 'large')).toBeGreaterThanOrEqual(1);
    }
  });

  it('fits more small thumbnails than large ones in the same width', () => {
    expect(columnsFor(900, 'small')).toBeGreaterThan(columnsFor(900, 'large'));
  });
});

describe('visibleRange', () => {
  const height = rowHeight('medium');

  it('is empty when there is nothing to show', () => {
    expect(
      visibleRange({ scrollTop: 0, viewportHeight: 600, rowHeight: height, columns: 4, total: 0 }),
    ).toEqual({ start: 0, end: 0 });
  });

  it('is empty before the port has been measured into columns', () => {
    expect(
      visibleRange({ scrollTop: 0, viewportHeight: 0, rowHeight: height, columns: 0, total: 40 }),
    ).toEqual({ start: 0, end: 0 });
  });

  it('starts at the first tile at the top of the list', () => {
    const range = visibleRange({
      scrollTop: 0,
      viewportHeight: height * 3,
      rowHeight: height,
      columns: 4,
      total: 100,
      overscanRows: 0,
    });
    expect(range.start).toBe(0);
    expect(range.end).toBe(12);
  });

  it('follows the scroll down the list', () => {
    const range = visibleRange({
      scrollTop: GRID_PAD + height * 10,
      viewportHeight: height * 2,
      rowHeight: height,
      columns: 4,
      total: 100,
      overscanRows: 0,
    });
    expect(range).toEqual({ start: 40, end: 48 });
  });

  it('keeps whole rows either side, so a flick does not show empty tiles', () => {
    const range = visibleRange({
      scrollTop: GRID_PAD + height * 10,
      viewportHeight: height * 2,
      rowHeight: height,
      columns: 4,
      total: 100,
      overscanRows: 2,
    });
    expect(range).toEqual({ start: 32, end: 56 });
  });

  it('never runs past the end of the list', () => {
    const range = visibleRange({
      scrollTop: height * 1000,
      viewportHeight: height * 4,
      rowHeight: height,
      columns: 3,
      total: 10,
    });
    expect(range.end).toBe(10);
    expect(range.start).toBeLessThanOrEqual(range.end);
  });

  /**
   * The property that matters: whatever the scroll position, every tile a
   * person can actually see is inside the range. A range that misses one
   * leaves a blank square on screen.
   */
  it('covers every row the port touches', () => {
    const columns = 5;
    const total = 137;
    const viewportHeight = 480;
    const rows = rowCount(total, columns);
    for (let scrollTop = 0; scrollTop <= rows * height; scrollTop += 17) {
      const range = visibleRange({ scrollTop, viewportHeight, rowHeight: height, columns, total });
      for (let row = 0; row < rows; row++) {
        const top = rowTop(row, height);
        const touches = top + height > scrollTop && top < scrollTop + viewportHeight;
        if (!touches) continue;
        expect(range.start).toBeLessThanOrEqual(row * columns);
        expect(range.end).toBeGreaterThanOrEqual(Math.min(total, (row + 1) * columns));
      }
    }
  });
});

describe('scrollTopFor', () => {
  const height = rowHeight('medium');

  it('leaves a row that is already in view where it is', () => {
    const scrollTop = rowTop(4, height);
    expect(scrollTopFor(4 * 3, 3, height, scrollTop, height * 3)).toBe(scrollTop);
  });

  it('scrolls up to a row above the port', () => {
    const scrollTop = rowTop(10, height);
    expect(scrollTopFor(2 * 3, 3, height, scrollTop, height * 3)).toBe(rowTop(2, height));
  });

  it('scrolls down just far enough to show a row below the port', () => {
    const viewportHeight = height * 3;
    const next = scrollTopFor(9 * 3, 3, height, 0, viewportHeight);
    expect(next).toBe(rowTop(9, height) + height - viewportHeight);
  });

  it('goes to the very top for the first row, so its padding shows', () => {
    expect(scrollTopFor(1, 4, height, 500, 400)).toBe(0);
  });

  it('stays put when asked about nothing', () => {
    expect(scrollTopFor(-1, 4, height, 120, 400)).toBe(120);
  });
});

describe('moveCursor', () => {
  // 10 pictures in rows of 4: two full rows and a short one of two.
  const columns = 4;
  const total = 10;

  it('walks one tile at a time across the rows', () => {
    expect(moveCursor(0, 'ArrowRight', columns, total)).toBe(1);
    expect(moveCursor(4, 'ArrowLeft', columns, total)).toBe(3);
  });

  it('moves a whole row up and down', () => {
    expect(moveCursor(5, 'ArrowDown', columns, total)).toBe(9);
    expect(moveCursor(5, 'ArrowUp', columns, total)).toBe(1);
  });

  it('stays on the first row rather than moving above it', () => {
    expect(moveCursor(2, 'ArrowUp', columns, total)).toBe(2);
  });

  it('lands on the last picture when the row below is short', () => {
    expect(moveCursor(6, 'ArrowDown', columns, total)).toBe(9);
    expect(moveCursor(9, 'ArrowDown', columns, total)).toBe(9);
  });

  it('does not wrap at either end', () => {
    expect(moveCursor(0, 'ArrowLeft', columns, total)).toBe(0);
    expect(moveCursor(9, 'ArrowRight', columns, total)).toBe(9);
  });

  it('jumps to the ends', () => {
    expect(moveCursor(5, 'Home', columns, total)).toBe(0);
    expect(moveCursor(5, 'End', columns, total)).toBe(9);
  });

  it('pages by whole screens, clamped to the list', () => {
    expect(moveCursor(0, 'PageDown', columns, total, 2)).toBe(8);
    expect(moveCursor(9, 'PageUp', columns, total, 2)).toBe(1);
    expect(moveCursor(9, 'PageDown', columns, total, 2)).toBe(9);
  });

  it('starts from the first picture when nothing is selected yet', () => {
    expect(moveCursor(-1, 'ArrowRight', columns, total)).toBe(1);
  });

  it('answers nothing for a key that is not a movement', () => {
    expect(moveCursor(0, 'Enter', columns, total)).toBeNull();
    expect(moveCursor(0, 'ArrowRight', columns, 0)).toBeNull();
  });

  it('always answers with a real index', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      for (let i = 0; i < total; i++) {
        const next = moveCursor(i, key, columns, total);
        expect(next).not.toBeNull();
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(total);
      }
    }
  });
});

describe('rowsPerPage', () => {
  it('counts whole rows in the port', () => {
    expect(rowsPerPage(400, 100)).toBe(4);
    expect(rowsPerPage(450, 100)).toBe(4);
  });

  it('is at least one row, however short the port', () => {
    expect(rowsPerPage(10, 100)).toBe(1);
    expect(rowsPerPage(0, 0)).toBe(1);
  });
});
