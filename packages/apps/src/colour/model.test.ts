import { describe, expect, it } from 'vitest';
import { rgba } from '../paint/colour';
import {
  cssOpaque,
  cssRgba,
  decimal,
  formatColour,
  formatHsl,
  formatOklch,
  formatRgb,
  hslToRgb,
  linearToSrgb,
  NOTATIONS,
  oklchToRgb,
  parseColour,
  rgbToHsl,
  rgbToOklch,
  srgbToLinear,
} from './model';

/** A repeatable spread of colours; a fixed seed keeps failures reproducible. */
function* colours(count: number): Generator<{ r: number; g: number; b: number; a: number }> {
  let state = 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    yield rgba(next() * 255, next() * 255, next() * 255, next() * 255);
  }
}

describe('the sRGB transfer function', () => {
  it('is the identity through both directions', () => {
    for (let step = 0; step <= 20; step += 1) {
      const value = step / 20;
      expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 10);
    }
  });

  it('is linear below the knee and curved above it', () => {
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404114, 6);
    expect(srgbToLinear(1)).toBe(1);
  });
});

describe('HSL', () => {
  it('reads the primaries the way CSS writes them', () => {
    expect(rgbToHsl(rgba(255, 0, 0))).toMatchObject({ h: 0, s: 1, l: 0.5 });
    expect(rgbToHsl(rgba(0, 255, 0)).h).toBe(120);
    expect(rgbToHsl(rgba(0, 0, 255)).h).toBe(240);
  });

  it('gives grey no saturation and keeps its lightness', () => {
    const grey = rgbToHsl(rgba(128, 128, 128));
    expect(grey.s).toBe(0);
    expect(grey.l).toBeCloseTo(128 / 255, 6);
  });

  it('puts white and black at the ends with no saturation', () => {
    expect(rgbToHsl(rgba(255, 255, 255))).toMatchObject({ s: 0, l: 1 });
    expect(rgbToHsl(rgba(0, 0, 0))).toMatchObject({ s: 0, l: 0 });
  });

  it('round-trips every channel', () => {
    for (const colour of colours(200)) {
      const back = hslToRgb(rgbToHsl(colour), colour.a);
      expect(back).toEqual(colour);
    }
  });
});

describe('Oklch', () => {
  it('puts white at lightness one with no chroma', () => {
    const white = rgbToOklch(rgba(255, 255, 255));
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeCloseTo(0, 4);
  });

  it('puts black at lightness zero', () => {
    expect(rgbToOklch(rgba(0, 0, 0)).l).toBeCloseTo(0, 6);
  });

  it('gives sRGB red the published coordinates', () => {
    const red = rgbToOklch(rgba(255, 0, 0));
    expect(red.l).toBeCloseTo(0.6279, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it('round-trips every channel', () => {
    for (const colour of colours(200)) {
      const { l, c, h } = rgbToOklch(colour);
      expect(oklchToRgb({ l, c, h }, colour.a)).toEqual(colour);
    }
  });

  it('clips a colour outside the display gamut rather than wrapping it', () => {
    const beyond = oklchToRgb({ l: 0.7, c: 0.4, h: 150 });
    expect(beyond.r).toBeGreaterThanOrEqual(0);
    expect(beyond.g).toBeLessThanOrEqual(255);
    expect(beyond.b).toBeGreaterThanOrEqual(0);
  });
});

describe('parsing what was typed', () => {
  it('reads hex in all four lengths', () => {
    expect(parseColour('#f00')).toEqual(rgba(255, 0, 0));
    expect(parseColour('#ff0000')).toEqual(rgba(255, 0, 0));
    expect(parseColour('  #FF000080 ')).toEqual(rgba(255, 0, 0, 128));
    expect(parseColour('#f008')).toEqual(rgba(255, 0, 0, 136));
  });

  it('reads both spellings of rgb', () => {
    expect(parseColour('rgb(255, 0, 0)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('rgb(255 0 0)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('rgba(255, 0, 0, 0.5)')).toEqual(rgba(255, 0, 0, 128));
    expect(parseColour('rgb(255 0 0 / 50%)')).toEqual(rgba(255, 0, 0, 128));
    expect(parseColour('rgb(100% 0% 0%)')).toEqual(rgba(255, 0, 0));
  });

  it('reads hsl, including a bare percentage and an angle unit', () => {
    expect(parseColour('hsl(0, 100%, 50%)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('hsl(0 100 50)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('hsl(0.5turn 100% 50%)')).toEqual(rgba(0, 255, 255));
    expect(parseColour('hsla(120deg, 100%, 50%, 0.25)')).toEqual(rgba(0, 255, 0, 64));
  });

  it('reads oklch, with lightness and chroma either way', () => {
    expect(parseColour('oklch(0.6279 0.2577 29.23)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('oklch(62.79% 0.2577 29.23deg)')).toEqual(rgba(255, 0, 0));
    // 100% chroma is 0.4 in oklch(), per CSS Color 4.
    expect(parseColour('oklch(0.6279 64.425% 29.23)')).toEqual(rgba(255, 0, 0));
    expect(parseColour('oklch(0.6279 0.2577 29.23 / 0.5)')?.a).toBe(128);
  });

  it('refuses anything it cannot read, rather than guessing', () => {
    for (const text of [
      '',
      '   ',
      'crimson',
      'rgb(255, 0)',
      'rgb(255, 0, 0, 0, 0)',
      'hsl()',
      'hsl(0 100% 50% /)',
      'hsl(0 100% 50% / 1 / 1)',
      'oklch(0.5 0.1)',
      'rgb(a b c)',
      '#gg0000',
      'rgb(255 0 0',
    ]) {
      expect(parseColour(text), text).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('drops the trailing zeros a fixed number leaves behind', () => {
    expect(decimal(50, 1)).toBe('50');
    expect(decimal(20.5, 1)).toBe('20.5');
    expect(decimal(0.5, 3)).toBe('0.5');
    expect(decimal(100, 4)).toBe('100');
    expect(decimal(0, 2)).toBe('0');
  });

  it('uses the opaque form when the colour is opaque', () => {
    expect(formatRgb(rgba(255, 85, 0))).toBe('rgb(255, 85, 0)');
    expect(formatHsl(rgba(255, 0, 0))).toBe('hsl(0, 100%, 50%)');
    expect(formatOklch(rgba(255, 255, 255))).toBe('oklch(1 0 0)');
  });

  it('switches to the alpha form when it is not', () => {
    expect(formatRgb(rgba(255, 85, 0, 128))).toBe('rgba(255, 85, 0, 0.502)');
    expect(formatHsl(rgba(255, 0, 0, 0))).toBe('hsla(0, 100%, 50%, 0)');
    expect(formatOklch(rgba(0, 0, 0, 128))).toMatch(/^oklch\(0 0 0 \/ 0\.502\)$/);
  });

  it('writes something every notation can read back exactly', () => {
    for (const colour of colours(150)) {
      for (const notation of NOTATIONS) {
        const text = formatColour(colour, notation.id);
        expect(parseColour(text), `${notation.id}: ${text}`).toEqual(colour);
      }
    }
  });
});

describe('CSS output', () => {
  it('writes alpha as a fraction and drops it when asked for the opaque form', () => {
    expect(cssRgba(rgba(1, 2, 3, 255))).toBe('rgba(1, 2, 3, 1)');
    expect(cssRgba(rgba(1, 2, 3, 0))).toBe('rgba(1, 2, 3, 0)');
    expect(cssOpaque(rgba(1, 2, 3, 0))).toBe('rgb(1, 2, 3)');
  });
});
