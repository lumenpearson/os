import { describe, expect, it } from 'vitest';
import { damp, drift, parallax, windows } from './layout';

describe('windows', () => {
  it('sit inside the visible area at their resting positions', () => {
    for (const spec of windows) {
      const [w, h] = spec.size;
      const [x, y] = spec.position;
      expect(Math.abs(x) + w / 2).toBeLessThan(3.6);
      expect(Math.abs(y) + h / 2).toBeLessThan(2.2);
    }
  });

  it('have distinct depths so the stack has an order', () => {
    const depths = windows.map((spec) => spec.position[2]);
    expect(new Set(depths).size).toBe(depths.length);
  });
});

describe('drift', () => {
  it('never exceeds the amplitude', () => {
    const spec = { phase: 1.2, amplitude: 0.05 };
    for (let t = 0; t < 60; t += 0.37) {
      const [dx, dy] = drift(t, spec);
      expect(Math.abs(dx)).toBeLessThanOrEqual(spec.amplitude);
      expect(Math.abs(dy)).toBeLessThanOrEqual(spec.amplitude);
    }
  });
});

describe('parallax', () => {
  it('is zero at the centre and clamps beyond the edges', () => {
    expect(parallax({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(parallax({ x: 4, y: -4 })).toEqual(parallax({ x: 1, y: -1 }));
  });

  it('tilts toward the pointer', () => {
    expect(parallax({ x: 1, y: 0 }).y).toBeGreaterThan(0);
    expect(parallax({ x: 0, y: 1 }).x).toBeLessThan(0);
  });
});

describe('damp', () => {
  it('halves the remaining distance every half-life', () => {
    expect(damp(0, 1, 0.1, 0.1)).toBeCloseTo(0.5);
    expect(damp(0, 1, 0.1, 0.2)).toBeCloseTo(0.75);
  });

  it('stays put when already at the target', () => {
    expect(damp(1, 1, 0.1, 0.016)).toBe(1);
  });
});
