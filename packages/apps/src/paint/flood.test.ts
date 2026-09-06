import { describe, expect, it } from 'vitest';
import type { Rgba } from './colour';
import { type Bitmap, colourDistance, floodFill, sampleAt } from './flood';

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 };
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };

function bitmap(width: number, height: number, colour: Rgba): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = colour.r;
    data[i * 4 + 1] = colour.g;
    data[i * 4 + 2] = colour.b;
    data[i * 4 + 3] = colour.a;
  }
  return { data, width, height };
}

function put(target: Bitmap, x: number, y: number, colour: Rgba): void {
  const i = (y * target.width + x) * 4;
  target.data[i] = colour.r;
  target.data[i + 1] = colour.g;
  target.data[i + 2] = colour.b;
  target.data[i + 3] = colour.a;
}

function at(target: Bitmap, x: number, y: number): Rgba {
  const colour = sampleAt(target, { x, y });
  if (!colour) throw new Error(`no pixel at ${x},${y}`);
  return colour;
}

function count(target: Bitmap, colour: Rgba): number {
  let total = 0;
  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      if (colourDistance(at(target, x, y), colour) === 0) total++;
    }
  }
  return total;
}

/** 8×8 white with a black 4×4 ring from (2,2) to (5,5), so (3,3)–(4,4) is sealed in. */
function withEnclosure(): Bitmap {
  const target = bitmap(8, 8, WHITE);
  for (let i = 2; i <= 5; i++) {
    put(target, i, 2, BLACK);
    put(target, i, 5, BLACK);
    put(target, 2, i, BLACK);
    put(target, 5, i, BLACK);
  }
  return target;
}

describe('colourDistance', () => {
  it('is the largest channel difference', () => {
    expect(colourDistance(WHITE, BLACK)).toBe(255);
    expect(colourDistance(WHITE, WHITE)).toBe(0);
    expect(colourDistance({ r: 10, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 0, a: 255 })).toBe(10);
  });

  it('counts alpha, so transparent black is not black', () => {
    expect(colourDistance(BLACK, { r: 0, g: 0, b: 0, a: 0 })).toBe(255);
  });
});

describe('sampleAt', () => {
  it('reads a pixel', () => {
    const target = withEnclosure();
    expect(sampleAt(target, { x: 2, y: 2 })).toEqual(BLACK);
    expect(sampleAt(target, { x: 3, y: 3 })).toEqual(WHITE);
  });

  it('is null outside the image', () => {
    const target = bitmap(4, 4, WHITE);
    expect(sampleAt(target, { x: -1, y: 0 })).toBeNull();
    expect(sampleAt(target, { x: 4, y: 0 })).toBeNull();
    expect(sampleAt(target, { x: 0, y: 4 })).toBeNull();
  });

  it('floors a fractional coordinate onto its pixel', () => {
    const target = withEnclosure();
    expect(sampleAt(target, { x: 2.9, y: 2.1 })).toEqual(BLACK);
  });
});

describe('floodFill', () => {
  it('stays inside an enclosed region', () => {
    const target = withEnclosure();
    const dirty = floodFill(target, { x: 3, y: 3 }, RED);
    expect(dirty).toEqual({ x: 3, y: 3, width: 2, height: 2 });
    expect(count(target, RED)).toBe(4);
    expect(at(target, 0, 0)).toEqual(WHITE);
    expect(at(target, 2, 2)).toEqual(BLACK);
  });

  it('cannot get into the enclosed region from outside', () => {
    const target = withEnclosure();
    const dirty = floodFill(target, { x: 0, y: 0 }, RED);
    expect(dirty).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    expect(count(target, RED)).toBe(64 - 12 - 4);
    expect(at(target, 3, 3)).toEqual(WHITE);
    expect(at(target, 4, 4)).toEqual(WHITE);
  });

  it('does not leak through a corner touch', () => {
    const target = bitmap(3, 3, WHITE);
    put(target, 1, 0, BLACK);
    put(target, 0, 1, BLACK);
    floodFill(target, { x: 0, y: 0 }, RED);
    expect(count(target, RED)).toBe(1);
    expect(at(target, 1, 1)).toEqual(WHITE);
  });

  it('fills a whole plain image in one go', () => {
    const target = bitmap(6, 4, WHITE);
    expect(floodFill(target, { x: 5, y: 3 }, RED)).toEqual({ x: 0, y: 0, width: 6, height: 4 });
    expect(count(target, RED)).toBe(24);
  });

  describe('tolerance', () => {
    /** White with a stripe ten steps darker down the middle. */
    const striped = () => {
      const target = bitmap(5, 1, WHITE);
      put(target, 2, 0, { r: 245, g: 245, b: 245, a: 255 });
      return target;
    };

    it('stops at a difference greater than the tolerance', () => {
      const target = striped();
      expect(floodFill(target, { x: 0, y: 0 }, RED, 9)).toEqual({
        x: 0,
        y: 0,
        width: 2,
        height: 1,
      });
      expect(count(target, RED)).toBe(2);
    });

    it('crosses a difference exactly equal to the tolerance', () => {
      const target = striped();
      expect(floodFill(target, { x: 0, y: 0 }, RED, 10)).toEqual({
        x: 0,
        y: 0,
        width: 5,
        height: 1,
      });
      expect(count(target, RED)).toBe(5);
    });

    it('measures every pixel against the one under the cursor, not its neighbour', () => {
      // A ramp of 8 per step: with tolerance 10 only the first two match.
      const target = bitmap(4, 1, WHITE);
      put(target, 1, 0, { r: 247, g: 247, b: 247, a: 255 });
      put(target, 2, 0, { r: 239, g: 239, b: 239, a: 255 });
      put(target, 3, 0, { r: 231, g: 231, b: 231, a: 255 });
      floodFill(target, { x: 0, y: 0 }, RED, 10);
      expect(count(target, RED)).toBe(2);
    });

    it('clamps a nonsense tolerance instead of matching nothing', () => {
      const target = withEnclosure();
      floodFill(target, { x: 0, y: 0 }, RED, -5);
      expect(count(target, RED)).toBe(48);
      const everything = withEnclosure();
      floodFill(everything, { x: 0, y: 0 }, RED, 9000);
      expect(count(everything, RED)).toBe(64);
    });
  });

  it('does nothing when the fill is already the colour under the cursor', () => {
    const target = withEnclosure();
    expect(floodFill(target, { x: 0, y: 0 }, WHITE)).toBeNull();
    expect(count(target, WHITE)).toBe(52);
  });

  it('terminates when the fill colour is itself within tolerance of the target', () => {
    const target = bitmap(4, 4, WHITE);
    const nearlyWhite: Rgba = { r: 250, g: 250, b: 250, a: 255 };
    expect(floodFill(target, { x: 0, y: 0 }, nearlyWhite, 20)).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    expect(count(target, nearlyWhite)).toBe(16);
  });

  it('writes the alpha it is given rather than blending', () => {
    const target = bitmap(2, 2, WHITE);
    floodFill(target, { x: 0, y: 0 }, { r: 255, g: 0, b: 0, a: 40 });
    expect(at(target, 1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 40 });
  });

  it('is null when the start is off the image', () => {
    const target = bitmap(4, 4, WHITE);
    expect(floodFill(target, { x: -1, y: 2 }, RED)).toBeNull();
    expect(floodFill(target, { x: 4, y: 4 }, RED)).toBeNull();
    expect(count(target, WHITE)).toBe(16);
  });

  it('fills a comb without missing a tooth', () => {
    // Vertical walls with a gap along the bottom row: one region, awkwardly shaped.
    const target = bitmap(7, 5, WHITE);
    for (const x of [1, 3, 5]) for (let y = 0; y < 4; y++) put(target, x, y, BLACK);
    floodFill(target, { x: 0, y: 0 }, RED);
    expect(count(target, RED)).toBe(35 - 12);
    expect(at(target, 6, 0)).toEqual(RED);
    expect(at(target, 2, 0)).toEqual(RED);
    expect(at(target, 4, 3)).toEqual(RED);
  });
});
