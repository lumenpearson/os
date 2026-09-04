import { describe, expect, it } from 'vitest';
import { indexAt, offsets, scrollToShow, visibleWindow } from './geometry';

const uniform = (count: number, size: number) => offsets(count, () => size);

describe('offsets', () => {
  it('starts at zero and ends at the total', () => {
    expect(uniform(4, 10)).toEqual([0, 10, 20, 30, 40]);
  });

  it('handles differing sizes', () => {
    expect(offsets(3, (i) => [100, 50, 25][i] ?? 0)).toEqual([0, 100, 150, 175]);
  });

  it('is just [0] for an empty grid', () => {
    expect(offsets(0, () => 10)).toEqual([0]);
  });
});

describe('indexAt', () => {
  const list = uniform(5, 20);

  it('finds the track a position falls in', () => {
    expect(indexAt(list, 0, 5)).toBe(0);
    expect(indexAt(list, 19, 5)).toBe(0);
    expect(indexAt(list, 20, 5)).toBe(1);
    expect(indexAt(list, 45, 5)).toBe(2);
  });

  it('clamps outside the grid', () => {
    expect(indexAt(list, -50, 5)).toBe(0);
    expect(indexAt(list, 10_000, 5)).toBe(4);
  });

  it('handles uneven tracks', () => {
    const uneven = offsets(3, (i) => [140, 40, 200][i] ?? 0);
    expect(indexAt(uneven, 139, 3)).toBe(0);
    expect(indexAt(uneven, 140, 3)).toBe(1);
    expect(indexAt(uneven, 179, 3)).toBe(1);
    expect(indexAt(uneven, 180, 3)).toBe(2);
  });

  it('is 0 for an empty grid', () => {
    expect(indexAt([0], 10, 0)).toBe(0);
  });
});

describe('visibleWindow', () => {
  const cols = uniform(52, 100);
  const rows = uniform(200, 20);
  const size = { cols: 52, rows: 200 };

  it('covers the viewport plus the overscan', () => {
    const w = visibleWindow(cols, rows, size, { left: 0, top: 0 }, { width: 300, height: 100 }, 3);
    expect(w.startCol).toBe(0);
    expect(w.endCol).toBe(6);
    expect(w.startRow).toBe(0);
    expect(w.endRow).toBe(8);
  });

  it('follows the scroll position', () => {
    const w = visibleWindow(
      cols,
      rows,
      size,
      { left: 1000, top: 400 },
      { width: 300, height: 100 },
      3,
    );
    expect(w.startCol).toBe(7);
    expect(w.endCol).toBe(16);
    expect(w.startRow).toBe(17);
    expect(w.endRow).toBe(28);
  });

  it('never runs past the grid', () => {
    const w = visibleWindow(
      cols,
      rows,
      size,
      { left: 1e6, top: 1e6 },
      { width: 300, height: 100 },
      3,
    );
    expect(w.endCol).toBe(51);
    expect(w.endRow).toBe(199);
    expect(w.startCol).toBeGreaterThanOrEqual(0);
  });

  it('renders a handful of cells, not the whole grid', () => {
    const w = visibleWindow(cols, rows, size, { left: 0, top: 0 }, { width: 800, height: 600 });
    const drawn = (w.endCol - w.startCol + 1) * (w.endRow - w.startRow + 1);
    expect(drawn).toBeLessThan(size.cols * size.rows);
    expect(drawn).toBeLessThan(600);
  });
});

describe('scrollToShow', () => {
  it('scrolls up to a cell above the viewport', () => {
    expect(scrollToShow({ start: 40, end: 60 }, { offset: 100, size: 200 })).toBe(40);
  });

  it('scrolls down to a cell below the viewport', () => {
    expect(scrollToShow({ start: 400, end: 420 }, { offset: 100, size: 200 })).toBe(220);
  });

  it('leaves a visible cell alone', () => {
    expect(scrollToShow({ start: 120, end: 140 }, { offset: 100, size: 200 })).toBeNull();
  });
});
