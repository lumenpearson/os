import { describe, expect, it } from 'vitest';
import {
  areaPath,
  EMPTY_STATS,
  lastPointPath,
  linePath,
  plotPoints,
  plotRange,
  Series,
} from './series';

function filled(capacity: number, values: number[]): Series {
  const s = new Series(capacity);
  for (const v of values) s.push(v);
  return s;
}

describe('Series', () => {
  it('rejects a capacity that is not a positive integer', () => {
    expect(() => new Series(0)).toThrow(RangeError);
    expect(() => new Series(-1)).toThrow(RangeError);
    expect(() => new Series(2.5)).toThrow(RangeError);
    expect(() => new Series(Number.NaN)).toThrow(RangeError);
  });

  it('starts empty', () => {
    const s = new Series(3);
    expect(s.size).toBe(0);
    expect(s.values()).toEqual([]);
    expect(s.at(0)).toBeUndefined();
    expect(s.stats()).toEqual(EMPTY_STATS);
  });

  it('reads back oldest first while it is filling', () => {
    const s = filled(4, [1, 2, 3]);
    expect(s.size).toBe(3);
    expect(s.values()).toEqual([1, 2, 3]);
    expect(s.at(0)).toBe(1);
    expect(s.at(2)).toBe(3);
  });

  it('drops the oldest sample past the capacity and never grows', () => {
    const s = filled(3, [1, 2, 3, 4, 5]);
    expect(s.size).toBe(3);
    expect(s.capacity).toBe(3);
    expect(s.values()).toEqual([3, 4, 5]);
  });

  it('keeps the order right through many wraparounds', () => {
    const s = new Series(3);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.size).toBe(3);
    expect(s.values()).toEqual([98, 99, 100]);
    expect(s.at(0)).toBe(98);
    expect(s.at(2)).toBe(100);
    expect(s.at(3)).toBeUndefined();
    expect(s.at(-1)).toBeUndefined();
  });

  it('ignores samples that are not finite numbers', () => {
    const s = filled(4, [1, Number.NaN, 2, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 3]);
    expect(s.values()).toEqual([1, 2, 3]);
  });

  it('keeps a sample of zero, which is a measurement', () => {
    expect(filled(3, [0, 0]).values()).toEqual([0, 0]);
  });

  it('empties on clear and refills from the start', () => {
    const s = filled(3, [1, 2, 3, 4]);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.values()).toEqual([]);
    s.push(7);
    expect(s.values()).toEqual([7]);
  });

  it('reports count, last, min, max and average', () => {
    expect(filled(5, [4, 1, 10, 5]).stats()).toEqual({
      count: 4,
      last: 5,
      min: 1,
      max: 10,
      avg: 5,
    });
  });

  it('reports statistics for the retained window only', () => {
    // 1 and 2 have been pushed out, so they cannot show up in min or avg.
    expect(filled(3, [1, 2, 6, 7, 8]).stats()).toEqual({
      count: 3,
      last: 8,
      min: 6,
      max: 8,
      avg: 7,
    });
  });

  it('handles negative samples', () => {
    expect(filled(3, [-4, -2]).stats()).toEqual({ count: 2, last: -2, min: -4, max: -2, avg: -3 });
  });
});

describe('plotRange', () => {
  it('defaults the floor to zero and the ceiling to the highest sample', () => {
    expect(plotRange([2, 9, 4], {})).toEqual({ min: 0, max: 9 });
  });

  it('takes an explicit floor and ceiling', () => {
    expect(plotRange([50], { min: 10, max: 100 })).toEqual({ min: 10, max: 100 });
  });

  it('widens a range that would divide by zero', () => {
    expect(plotRange([], {})).toEqual({ min: 0, max: 1 });
    expect(plotRange([0, 0], {})).toEqual({ min: 0, max: 1 });
    expect(plotRange([5], { min: 10 })).toEqual({ min: 10, max: 11 });
    expect(plotRange([5], { min: 0, max: 0 })).toEqual({ min: 0, max: 1 });
  });
});

const box = { width: 100, height: 10 };

describe('plotPoints', () => {
  it('spreads a full buffer across the width, low values at the bottom', () => {
    expect(plotPoints([0, 50, 100], { ...box, min: 0, max: 100, slots: 3 })).toEqual([
      { x: 0, y: 10 },
      { x: 50, y: 5 },
      { x: 100, y: 0 },
    ]);
  });

  it('pins the newest sample to the right edge and steps older ones left', () => {
    const points = plotPoints([1, 2], { ...box, min: 0, max: 10, slots: 5 });
    expect(points.map((p) => p.x)).toEqual([75, 100]);
  });

  it('keeps the only sample on the right edge', () => {
    expect(plotPoints([4], { ...box, min: 0, max: 10, slots: 5 })).toEqual([{ x: 100, y: 6 }]);
  });

  it('clamps a sample outside the range instead of drawing past the box', () => {
    const points = plotPoints([-20, 250], { ...box, min: 0, max: 100, slots: 2 });
    expect(points.map((p) => p.y)).toEqual([10, 0]);
  });

  it('rounds to two decimals', () => {
    const points = plotPoints([1], { width: 10, height: 3, min: 0, max: 3, slots: 3 });
    expect(points).toEqual([{ x: 10, y: 2 }]);
  });

  it('has nothing to plot without samples', () => {
    expect(plotPoints([], { ...box, slots: 5 })).toEqual([]);
  });

  it('defaults the slot count to the number of samples', () => {
    expect(plotPoints([0, 100], { ...box, min: 0, max: 100 }).map((p) => p.x)).toEqual([0, 100]);
  });
});

describe('linePath', () => {
  it('moves to the first point and lines through the rest', () => {
    expect(linePath([0, 50, 100], { ...box, min: 0, max: 100, slots: 3 })).toBe(
      'M0,10 L50,5 L100,0',
    );
  });

  it('is empty when nothing has been measured', () => {
    expect(linePath([], { ...box, slots: 3 })).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the line down to the baseline', () => {
    expect(areaPath([0, 50, 100], { ...box, min: 0, max: 100, slots: 3 })).toBe(
      'M0,10 L0,10 L50,5 L100,0 L100,10 Z',
    );
  });

  it('is empty when nothing has been measured', () => {
    expect(areaPath([], { ...box, slots: 3 })).toBe('');
  });
});

describe('lastPointPath', () => {
  it('is a zero-length subpath at the newest sample', () => {
    expect(lastPointPath([0, 50, 100], { ...box, min: 0, max: 100, slots: 3 })).toBe(
      'M100,0 L100,0',
    );
  });

  it('is empty when nothing has been measured', () => {
    expect(lastPointPath([], { ...box, slots: 3 })).toBe('');
  });
});
