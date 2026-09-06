import { describe, expect, it } from 'vitest';
import { over, parseRgb } from './color';

describe('parseRgb', () => {
  it('reads the legacy comma form', () => {
    expect(parseRgb('rgb(255, 0, 51)')).toEqual({ r: 1, g: 0, b: 0.2, a: 1 });
    expect(parseRgb('rgba(0, 0, 0, 0.09)')).toEqual({ r: 0, g: 0, b: 0, a: 0.09 });
  });

  it('reads the space-separated form with a slash alpha', () => {
    expect(parseRgb('rgb(255 255 255 / 0.5)')).toEqual({ r: 1, g: 1, b: 1, a: 0.5 });
    expect(parseRgb('rgb(0 0 0 / 50%)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('returns null for anything else', () => {
    expect(parseRgb('')).toBeNull();
    expect(parseRgb('hsl(218 92% 58%)')).toBeNull();
  });
});

describe('over', () => {
  it('composites a translucent colour onto an opaque one', () => {
    const result = over({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 1, g: 1, b: 1, a: 1 });
    expect(result.r).toBeCloseTo(0.5);
    expect(result.g).toBeCloseTo(0.5);
    expect(result.b).toBeCloseTo(0.5);
    expect(result.a).toBe(1);
  });

  it('leaves an opaque colour unchanged', () => {
    expect(over({ r: 0.2, g: 0.4, b: 0.6, a: 1 }, { r: 1, g: 1, b: 1, a: 1 })).toEqual({
      r: 0.2,
      g: 0.4,
      b: 0.6,
      a: 1,
    });
  });
});
