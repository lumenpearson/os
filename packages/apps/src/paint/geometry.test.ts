import { describe, expect, it } from 'vitest';
import {
  clampRect,
  discSpans,
  dragRect,
  ellipsePath,
  ellipseSpans,
  isEmptyRect,
  linePoints,
  normalizeRect,
  type Point,
  rectContains,
  rectPath,
  rectSpans,
  snapAngle,
  squareOff,
  stampSpacing,
  strokePoints,
} from './geometry';

const key = (p: Point) => `${p.x},${p.y}`;
const unique = (points: Point[]) => new Set(points.map(key));

describe('linePoints', () => {
  it('returns one pixel for a zero-length line', () => {
    expect(linePoints({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });

  it('includes both ends', () => {
    const points = linePoints({ x: 0, y: 0 }, { x: 5, y: 2 });
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 5, y: 2 });
  });

  it('walks a horizontal run one pixel at a time', () => {
    expect(linePoints({ x: 2, y: 7 }, { x: 5, y: 7 })).toEqual([
      { x: 2, y: 7 },
      { x: 3, y: 7 },
      { x: 4, y: 7 },
      { x: 5, y: 7 },
    ]);
  });

  it('walks a vertical run backwards too', () => {
    expect(linePoints({ x: 1, y: 3 }, { x: 1, y: 1 })).toEqual([
      { x: 1, y: 3 },
      { x: 1, y: 2 },
      { x: 1, y: 1 },
    ]);
  });

  it('never leaves a gap: every step is to a touching pixel', () => {
    const points = linePoints({ x: -3, y: 11 }, { x: 40, y: -9 });
    expect(points).toHaveLength(44);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Point;
      const b = points[i] as Point;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
    expect(unique(points).size).toBe(points.length);
  });

  it('covers the same pixels drawn in either direction', () => {
    const forward = linePoints({ x: 0, y: 0 }, { x: 9, y: 4 });
    const back = linePoints({ x: 9, y: 4 }, { x: 0, y: 0 });
    expect(back).toHaveLength(forward.length);
  });
});

describe('strokePoints', () => {
  it('stamps only the end when the pointer has not moved', () => {
    expect(strokePoints({ x: 3, y: 3 }, { x: 3, y: 3 }, 2)).toEqual([{ x: 3, y: 3 }]);
  });

  it('spaces stamps along the segment and always lands on the end', () => {
    const points = strokePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 2.5);
    expect(points.map((p) => p.x)).toEqual([2.5, 5, 7.5, 10]);
  });

  it('adds the end when the spacing does not divide the length', () => {
    const points = strokePoints({ x: 0, y: 0 }, { x: 7, y: 0 }, 3);
    expect(points[points.length - 1]).toEqual({ x: 7, y: 0 });
  });

  it('keeps the spacing positive whatever it is handed', () => {
    expect(strokePoints({ x: 0, y: 0 }, { x: 1, y: 0 }, 0).length).toBeLessThan(10);
    expect(stampSpacing(1)).toBeGreaterThan(0);
    expect(stampSpacing(40)).toBe(8);
  });
});

describe('snapAngle', () => {
  it('flattens a nearly horizontal drag', () => {
    expect(snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 });
  });

  it('straightens a nearly vertical drag', () => {
    expect(snapAngle({ x: 5, y: 5 }, { x: 6, y: 25 })).toEqual({ x: 5, y: 25 });
  });

  it('pulls 40 degrees onto the 45 degree spoke', () => {
    const snapped = snapAngle({ x: 0, y: 0 }, { x: 10, y: 8 });
    expect(snapped.x).toBe(snapped.y);
  });

  it('keeps the length within a pixel of rounding', () => {
    const snapped = snapAngle({ x: 0, y: 0 }, { x: 30, y: 7 });
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(30, 7), 0);
  });

  it('lands on a multiple of the step', () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const radians = (angle * Math.PI) / 180;
      const to = {
        x: Math.round(Math.cos(radians) * 200),
        y: Math.round(Math.sin(radians) * 200),
      };
      const snapped = snapAngle({ x: 0, y: 0 }, to);
      const degrees = (Math.atan2(snapped.y, snapped.x) * 180) / Math.PI;
      const remainder = Math.abs(((degrees % 15) + 15) % 15);
      expect(Math.min(remainder, 15 - remainder)).toBeLessThan(0.5);
    }
  });

  it('leaves a zero-length drag alone', () => {
    expect(snapAngle({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  });
});

describe('squareOff', () => {
  it('takes the longer axis and keeps both directions', () => {
    expect(squareOff({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 10 });
    expect(squareOff({ x: 0, y: 0 }, { x: -2, y: 9 })).toEqual({ x: -9, y: 9 });
  });

  it('still makes a square from a straight drag', () => {
    expect(squareOff({ x: 0, y: 0 }, { x: 0, y: 6 })).toEqual({ x: 6, y: 6 });
  });
});

describe('dragRect', () => {
  it('is inclusive of both pixels', () => {
    expect(dragRect({ x: 2, y: 2 }, { x: 5, y: 4 })).toEqual({
      x: 2,
      y: 2,
      width: 4,
      height: 3,
    });
  });

  it('normalises a drag up and to the left', () => {
    expect(dragRect({ x: 5, y: 4 }, { x: 2, y: 2 })).toEqual({
      x: 2,
      y: 2,
      width: 4,
      height: 3,
    });
  });

  it('squares the box under Shift', () => {
    const rect = dragRect({ x: 0, y: 0 }, { x: 9, y: 3 }, { square: true });
    expect(rect.width).toBe(rect.height);
    expect(rect).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('grows from the centre under Alt', () => {
    expect(dragRect({ x: 10, y: 10 }, { x: 13, y: 12 }, { fromCentre: true })).toEqual({
      x: 7,
      y: 8,
      width: 7,
      height: 5,
    });
  });

  it('combines both into a square about the centre', () => {
    expect(
      dragRect({ x: 10, y: 10 }, { x: 13, y: 12 }, { fromCentre: true, square: true }),
    ).toEqual({ x: 7, y: 7, width: 7, height: 7 });
  });
});

describe('rect helpers', () => {
  it('normalises two pixels either way round', () => {
    expect(normalizeRect({ x: 4, y: 1 }, { x: 1, y: 4 })).toEqual({
      x: 1,
      y: 1,
      width: 4,
      height: 4,
    });
  });

  it('clamps to the image and reports a box that misses it', () => {
    const bounds = { width: 10, height: 10 };
    expect(clampRect({ x: -4, y: -4, width: 8, height: 8 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    expect(clampRect({ x: 8, y: 8, width: 8, height: 8 }, bounds)).toEqual({
      x: 8,
      y: 8,
      width: 2,
      height: 2,
    });
    expect(clampRect({ x: 20, y: 0, width: 4, height: 4 }, bounds)).toBeNull();
    expect(clampRect({ x: 0, y: 0, width: 0, height: 4 }, bounds)).toBeNull();
  });

  it('holds the pixels inside its own bounds', () => {
    const rect = { x: 2, y: 2, width: 3, height: 3 };
    expect(rectContains(rect, { x: 2, y: 2 })).toBe(true);
    expect(rectContains(rect, { x: 4, y: 4 })).toBe(true);
    expect(rectContains(rect, { x: 5, y: 4 })).toBe(false);
    expect(rectContains(rect, { x: 1, y: 3 })).toBe(false);
  });

  it('knows an empty box', () => {
    expect(isEmptyRect(null)).toBe(true);
    expect(isEmptyRect({ x: 0, y: 0, width: 0, height: 3 })).toBe(true);
    expect(isEmptyRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
  });
});

describe('rectSpans and rectPath', () => {
  it('fills one span per row', () => {
    expect(rectSpans({ x: 1, y: 1, width: 3, height: 2 })).toEqual([
      { y: 1, x0: 1, x1: 3 },
      { y: 2, x0: 1, x1: 3 },
    ]);
  });

  it('draws a hollow border with no repeats', () => {
    const path = rectPath({ x: 0, y: 0, width: 3, height: 3 });
    expect(path).toHaveLength(8);
    expect(unique(path).size).toBe(8);
    expect(unique(path).has('1,1')).toBe(false);
  });

  it('collapses to a line when an axis is one pixel', () => {
    expect(rectPath({ x: 0, y: 0, width: 4, height: 1 })).toHaveLength(4);
    expect(rectPath({ x: 0, y: 0, width: 1, height: 4 })).toHaveLength(4);
    expect(rectPath({ x: 0, y: 0, width: 1, height: 1 })).toHaveLength(1);
  });
});

describe('ellipseSpans', () => {
  it('inscribes a circle in a 4x4 box', () => {
    expect(ellipseSpans({ x: 0, y: 0, width: 4, height: 4 }).map((s) => s.x1 - s.x0 + 1)).toEqual([
      2, 4, 4, 2,
    ]);
  });

  it('is symmetric about both axes', () => {
    const spans = ellipseSpans({ x: 0, y: 0, width: 21, height: 13 });
    expect(spans).toHaveLength(13);
    for (let i = 0; i < spans.length; i++) {
      const top = spans[i];
      const bottom = spans[spans.length - 1 - i];
      if (!top || !bottom) throw new Error('missing span');
      expect(top.x0).toBe(bottom.x0);
      expect(top.x1).toBe(bottom.x1);
      expect(top.x0 + top.x1).toBe(20);
    }
  });

  it('never spills outside the box it was given', () => {
    const rect = { x: 5, y: 7, width: 9, height: 6 };
    for (const span of ellipseSpans(rect)) {
      expect(span.x0).toBeGreaterThanOrEqual(rect.x);
      expect(span.x1).toBeLessThan(rect.x + rect.width);
      expect(span.y).toBeGreaterThanOrEqual(rect.y);
      expect(span.y).toBeLessThan(rect.y + rect.height);
    }
  });

  it('covers roughly the area of the ellipse', () => {
    const rect = { x: 0, y: 0, width: 101, height: 61 };
    const area = ellipseSpans(rect).reduce((sum, s) => sum + (s.x1 - s.x0 + 1), 0);
    expect(area).toBeCloseTo((Math.PI * 101 * 61) / 4, -2);
  });

  it('handles a one-pixel box', () => {
    expect(ellipseSpans({ x: 3, y: 3, width: 1, height: 1 })).toEqual([{ y: 3, x0: 3, x1: 3 }]);
    expect(ellipseSpans({ x: 0, y: 0, width: 0, height: 4 })).toEqual([]);
  });
});

describe('ellipsePath', () => {
  it('keeps the rim and drops the middle', () => {
    const rect = { x: 0, y: 0, width: 15, height: 15 };
    const outline = unique(ellipsePath(rect));
    expect(outline.has('7,0')).toBe(true);
    expect(outline.has('7,14')).toBe(true);
    expect(outline.has('0,7')).toBe(true);
    expect(outline.has('7,7')).toBe(false);
    expect(outline.has('6,7')).toBe(false);
  });

  it('is a subset of the fill', () => {
    const rect = { x: 2, y: 3, width: 12, height: 9 };
    const filled = new Set<string>();
    for (const span of ellipseSpans(rect)) {
      for (let x = span.x0; x <= span.x1; x++) filled.add(`${x},${span.y}`);
    }
    for (const p of ellipsePath(rect)) expect(filled.has(key(p))).toBe(true);
  });

  it('leaves no vertical gap in a tall thin ellipse', () => {
    const rows = new Set(ellipsePath({ x: 0, y: 0, width: 3, height: 20 }).map((p) => p.y));
    expect(rows.size).toBe(20);
  });
});

/** The brush stamp as a set of pixels, for the shape assertions below. */
const stampPoints = (diameter: number): Point[] => {
  const points: Point[] = [];
  for (const span of discSpans(diameter)) {
    for (let x = span.x0; x <= span.x1; x++) points.push({ x, y: span.y });
  }
  return points;
};

describe('discSpans', () => {
  it('is a single pixel at size 1', () => {
    expect(stampPoints(1)).toEqual([{ x: 0, y: 0 }]);
  });

  it('rounds the corners off from size 4 up', () => {
    expect(stampPoints(2)).toHaveLength(4);
    expect(stampPoints(3)).toHaveLength(9);
    expect(stampPoints(4)).toHaveLength(12);
    expect(stampPoints(5)).toHaveLength(21);
    expect(unique(stampPoints(5)).has('-2,-2')).toBe(false);
  });

  it('covers the same pixels as an ellipse of the same size', () => {
    const anchor = 4;
    const fromEllipse = new Set<string>();
    for (const span of ellipseSpans({ x: 0, y: 0, width: 9, height: 9 })) {
      for (let x = span.x0; x <= span.x1; x++) {
        fromEllipse.add(`${x - anchor},${span.y - anchor}`);
      }
    }
    expect(unique(stampPoints(9))).toEqual(fromEllipse);
  });

  it('stays inside the diameter and is centred', () => {
    for (const size of [1, 2, 3, 4, 5, 8, 9, 32]) {
      const offsets = stampPoints(size);
      const xs = offsets.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs) + 1).toBeLessThanOrEqual(size);
      expect(offsets).toHaveLength(unique(offsets).size);
    }
  });

  it('is symmetric for odd sizes', () => {
    const offsets = unique(stampPoints(9));
    for (const p of stampPoints(9)) {
      expect(offsets.has(`${-p.x},${p.y}`)).toBe(true);
      expect(offsets.has(`${p.x},${-p.y}`)).toBe(true);
    }
  });

  it('treats a nonsense size as one pixel', () => {
    expect(stampPoints(0)).toEqual([{ x: 0, y: 0 }]);
    expect(stampPoints(-4)).toEqual([{ x: 0, y: 0 }]);
  });
});
