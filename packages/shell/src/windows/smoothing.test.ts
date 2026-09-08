import { describe, expect, it } from 'vitest';
import { approach, DRAG_HALF_LIFE, settled } from './smoothing';

describe('approach', () => {
  it('covers half the distance in one half-life', () => {
    expect(approach(0, 100, DRAG_HALF_LIFE)).toBeCloseTo(50, 6);
  });

  it('is framerate independent: two half-frames equal one frame', () => {
    const once = approach(0, 100, 32);
    const twice = approach(approach(0, 100, 16), 100, 16);
    expect(twice).toBeCloseTo(once, 6);
  });

  it('lands exactly on the target rather than approaching it forever', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = approach(v, 100, 16);
    expect(v).toBe(100);
  });

  it('holds still when no time has passed', () => {
    expect(approach(10, 100, 0)).toBe(10);
  });

  it('snaps when time stops within half a pixel of the target', () => {
    expect(approach(99.8, 100, 0)).toBe(100);
  });

  it('works in both directions', () => {
    expect(approach(100, 0, DRAG_HALF_LIFE)).toBeCloseTo(50, 6);
  });

  it('never overshoots', () => {
    for (const dt of [1, 16, 33, 200, 5000]) {
      const v = approach(0, 100, dt);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('settled', () => {
  it('is true only when both axes have arrived', () => {
    expect(settled({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(settled({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
  });
});
