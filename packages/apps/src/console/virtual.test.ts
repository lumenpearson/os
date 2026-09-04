import { describe, expect, it } from 'vitest';
import {
  DETAIL_LINE_HEIGHT,
  DETAIL_PADDING,
  detailHeight,
  ROW_HEIGHT,
  rowAt,
  rowHeight,
  rowOffsets,
  totalHeight,
  windowFor,
} from './virtual';

const uniform = (count: number) => rowOffsets(new Array<number>(count).fill(ROW_HEIGHT));

describe('row heights', () => {
  it('is one line high when nothing is expanded', () => {
    expect(rowHeight()).toBe(ROW_HEIGHT);
    expect(detailHeight(0)).toBe(0);
    expect(detailHeight(-1)).toBe(0);
  });

  it('grows by the payload line count plus its padding', () => {
    expect(detailHeight(3)).toBe(3 * DETAIL_LINE_HEIGHT + DETAIL_PADDING * 2);
    expect(rowHeight(3)).toBe(ROW_HEIGHT + detailHeight(3));
  });
});

describe('rowOffsets', () => {
  it('is one longer than the list and starts at zero', () => {
    const offsets = rowOffsets([10, 20, 30]);
    expect(offsets).toEqual([0, 10, 30, 60]);
  });

  it('has one entry for an empty list', () => {
    expect(rowOffsets([])).toEqual([0]);
    expect(totalHeight(rowOffsets([]))).toBe(0);
  });

  it('treats a negative height as nothing', () => {
    expect(rowOffsets([10, -5, 10])).toEqual([0, 10, 10, 20]);
  });

  it('reports the total height', () => {
    expect(totalHeight(uniform(4))).toBe(4 * ROW_HEIGHT);
  });
});

describe('rowAt', () => {
  const offsets = rowOffsets([10, 20, 30]);

  it('finds the row a position lands in', () => {
    expect(rowAt(offsets, 0)).toBe(0);
    expect(rowAt(offsets, 9)).toBe(0);
    expect(rowAt(offsets, 10)).toBe(1);
    expect(rowAt(offsets, 29)).toBe(1);
    expect(rowAt(offsets, 30)).toBe(2);
  });

  it('clamps past either end', () => {
    expect(rowAt(offsets, -100)).toBe(0);
    expect(rowAt(offsets, 10_000)).toBe(2);
    expect(rowAt(rowOffsets([]), 5)).toBe(0);
  });

  it('agrees with a linear scan over uneven rows', () => {
    const heights = [12, 40, 8, 96, 24, 24];
    const uneven = rowOffsets(heights);
    for (let y = 0; y < totalHeight(uneven); y++) {
      let expected = 0;
      let top = 0;
      for (let i = 0; i < heights.length; i++) {
        const height = heights[i] ?? 0;
        if (y >= top && y < top + height) expected = i;
        top += height;
      }
      expect(rowAt(uneven, y)).toBe(expected);
    }
  });
});

describe('windowFor', () => {
  it('renders nothing for an empty list', () => {
    expect(windowFor(rowOffsets([]), 0, 400)).toEqual({ start: 0, end: 0 });
  });

  it('renders the viewport plus the overscan', () => {
    const offsets = uniform(1000);
    expect(windowFor(offsets, 0, 240, 2)).toEqual({ start: 0, end: 13 });
  });

  it('moves the window as the list scrolls', () => {
    const offsets = uniform(1000);
    expect(windowFor(offsets, 24 * 100, 240, 2)).toEqual({ start: 98, end: 113 });
  });

  it('never reaches past either end', () => {
    const offsets = uniform(10);
    expect(windowFor(offsets, -50, 240, 4)).toEqual({ start: 0, end: 10 });
    expect(windowFor(offsets, 100_000, 240, 4)).toEqual({ start: 5, end: 10 });
  });

  it('renders far fewer rows than the list holds', () => {
    const offsets = uniform(5000);
    const { start, end } = windowFor(offsets, 24 * 2000, 600, 8);
    expect(end - start).toBeLessThan(60);
    expect(start).toBeGreaterThan(1990);
  });

  it('still renders a row when the viewport has not been measured', () => {
    const window = windowFor(uniform(50), 0, 0, 8);
    expect(window.start).toBe(0);
    expect(window.end).toBeGreaterThan(0);
  });

  it('covers a tall expanded row', () => {
    const offsets = rowOffsets([ROW_HEIGHT, rowHeight(20), ROW_HEIGHT]);
    expect(windowFor(offsets, 0, 40, 0)).toEqual({ start: 0, end: 2 });
    expect(windowFor(offsets, 0, 400, 0)).toEqual({ start: 0, end: 3 });
  });
});
