import { describe, expect, it } from 'vitest';
import { neighbour, type Rect, squarify } from './treemap';

const CONTAINER: Rect = { x: 0, y: 0, width: 400, height: 260 };

const area = (r: Rect) => r.width * r.height;

function overlaps(a: Rect, b: Rect): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 1e-6 && h > 1e-6;
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Every rect inside the container, none crossing another, areas summing to it. */
function expectTiling(rects: Rect[], container: Rect) {
  for (const r of rects) {
    expect(r.width).toBeGreaterThanOrEqual(0);
    expect(r.height).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeGreaterThanOrEqual(container.x - 1e-6);
    expect(r.y).toBeGreaterThanOrEqual(container.y - 1e-6);
    expect(r.x + r.width).toBeLessThanOrEqual(container.x + container.width + 1e-6);
    expect(r.y + r.height).toBeLessThanOrEqual(container.y + container.height + 1e-6);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i] as Rect, rects[j] as Rect)).toBe(false);
    }
  }
  const total = rects.reduce((sum, r) => sum + area(r), 0);
  expect(total).toBeCloseTo(area(container), 4);
  // Sampled points confirm coverage directly: half-open rects mean a point
  // inside the container belongs to exactly one tile.
  for (let sx = 0; sx < 17; sx++) {
    for (let sy = 0; sy < 11; sy++) {
      const x = container.x + ((sx + 0.37) / 17) * container.width;
      const y = container.y + ((sy + 0.61) / 11) * container.height;
      expect(rects.filter((r) => contains(r, x, y))).toHaveLength(1);
    }
  }
}

describe('squarify', () => {
  it('gives a single item the whole container', () => {
    expect(squarify([7], CONTAINER)).toEqual([CONTAINER]);
  });

  it('makes areas proportional to weights', () => {
    const weights = [50, 30, 12, 5, 3];
    const rects = squarify(weights, CONTAINER);
    const total = weights.reduce((a, b) => a + b, 0);
    rects.forEach((rect, i) => {
      const expected = ((weights[i] as number) / total) * area(CONTAINER);
      expect(area(rect)).toBeCloseTo(expected, 4);
    });
  });

  it('returns rects in the order of the weights it was given', () => {
    const rects = squarify([1, 9], CONTAINER);
    expect(area(rects[0] as Rect)).toBeLessThan(area(rects[1] as Rect));
  });

  it('tiles the container with no gaps and no overlap', () => {
    expectTiling(squarify([6, 6, 4, 3, 2, 2, 1, 1, 1], CONTAINER), CONTAINER);
  });

  it('tiles a tall container as well as a wide one', () => {
    const tall: Rect = { x: 12, y: 8, width: 120, height: 480 };
    expectTiling(squarify([40, 25, 15, 10, 6, 4], tall), tall);
  });

  it('tiles for many weights of wildly different sizes', () => {
    const weights = Array.from({ length: 40 }, (_, i) => (i % 7) * 100 + 1 + i);
    expectTiling(squarify(weights, CONTAINER), CONTAINER);
  });

  it('gives zero-size items no area and still tiles with the rest', () => {
    const rects = squarify([10, 0, 5, 0, 5], CONTAINER);
    expect(area(rects[1] as Rect)).toBe(0);
    expect(area(rects[3] as Rect)).toBe(0);
    expectTiling(rects, CONTAINER);
  });

  it('drops negative and non-finite weights instead of inverting the layout', () => {
    const rects = squarify([10, -4, Number.NaN, Number.POSITIVE_INFINITY, 10], CONTAINER);
    expect(area(rects[1] as Rect)).toBe(0);
    expect(area(rects[2] as Rect)).toBe(0);
    expect(area(rects[3] as Rect)).toBe(0);
    expect(area(rects[0] as Rect)).toBeCloseTo(area(CONTAINER) / 2, 4);
    expectTiling(rects, CONTAINER);
  });

  it('has nothing to lay out for an empty list', () => {
    expect(squarify([], CONTAINER)).toEqual([]);
  });

  it('gives every item an empty rect when nothing has a size', () => {
    const rects = squarify([0, 0, 0], CONTAINER);
    expect(rects.every((r) => area(r) === 0)).toBe(true);
  });

  it('gives every item an empty rect when the container has no area', () => {
    const rects = squarify([3, 2, 1], { x: 0, y: 0, width: 0, height: 200 });
    expect(rects.every((r) => area(r) === 0)).toBe(true);
  });

  it('keeps tiles inside a container that is offset from the origin', () => {
    const offset: Rect = { x: 40, y: 90, width: 300, height: 180 };
    expectTiling(squarify([5, 4, 3, 2, 1], offset), offset);
  });
});

describe('neighbour', () => {
  // A 2×2 grid: 0 1
  //             2 3
  const grid: Rect[] = [
    { x: 0, y: 0, width: 50, height: 50 },
    { x: 50, y: 0, width: 50, height: 50 },
    { x: 0, y: 50, width: 50, height: 50 },
    { x: 50, y: 50, width: 50, height: 50 },
  ];

  it('moves to the tile on the side the arrow points at', () => {
    expect(neighbour(grid, 0, 'right')).toBe(1);
    expect(neighbour(grid, 1, 'left')).toBe(0);
    expect(neighbour(grid, 0, 'down')).toBe(2);
    expect(neighbour(grid, 3, 'up')).toBe(1);
  });

  it('prefers a tile that lines up over a nearer one that does not', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 40, height: 100 },
      { x: 40, y: 60, width: 60, height: 40 },
      { x: 40, y: 0, width: 60, height: 60 },
    ];
    expect(neighbour(rects, 0, 'right')).toBe(2);
  });

  it('stops at the edge instead of wrapping around', () => {
    expect(neighbour(grid, 1, 'right')).toBe(1);
    expect(neighbour(grid, 0, 'up')).toBe(0);
  });

  it('never lands on a tile with no area', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 0, height: 0 },
      { x: 50, y: 0, width: 50, height: 50 },
    ];
    expect(neighbour(rects, 0, 'right')).toBe(2);
  });

  it('stays put when the current tile is missing or empty', () => {
    expect(neighbour(grid, 9, 'right')).toBe(9);
    expect(neighbour([{ x: 0, y: 0, width: 0, height: 0 }], 0, 'down')).toBe(0);
  });
});
