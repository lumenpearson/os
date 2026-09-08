import { describe, expect, it } from 'vitest';
import {
  clampChannel,
  clampUnit,
  cssColour,
  equalColour,
  formatHex,
  type Hsv,
  hsvToRgb,
  parseHex,
  pushRecent,
  rgba,
  rgbToHsv,
  withAlpha,
  wrapHue,
} from './colour';

describe('clamping', () => {
  it('rounds and bounds a channel', () => {
    expect(clampChannel(-40)).toBe(0);
    expect(clampChannel(300)).toBe(255);
    expect(clampChannel(127.6)).toBe(128);
  });

  it('treats a non-number as zero rather than spreading NaN', () => {
    expect(clampChannel(Number.NaN)).toBe(0);
    expect(clampUnit(Number.NaN)).toBe(0);
    expect(wrapHue(Number.NaN)).toBe(0);
  });

  it('wraps hue around the circle', () => {
    expect(wrapHue(0)).toBe(0);
    expect(wrapHue(360)).toBe(0);
    expect(wrapHue(-30)).toBe(330);
    expect(wrapHue(725)).toBe(5);
  });

  it('bounds the unit range', () => {
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(0.25)).toBe(0.25);
  });
});

describe('parseHex', () => {
  it('reads three, four, six and eight digits', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(parseHex('#f00c')).toEqual({ r: 255, g: 0, b: 0, a: 204 });
    expect(parseHex('#3c8d4f')).toEqual({ r: 60, g: 141, b: 79, a: 255 });
    expect(parseHex('#3c8d4f80')).toEqual({ r: 60, g: 141, b: 79, a: 128 });
  });

  it('tolerates a missing hash, surrounding space and upper case', () => {
    expect(parseHex('  FFCC00 ')).toEqual({ r: 255, g: 204, b: 0, a: 255 });
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '#', '#ff', '#12345', '#1234567', 'xyz', '#gggggg', '#ff cc 00']) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe('formatHex', () => {
  it('pads each channel to two digits', () => {
    expect(formatHex({ r: 0, g: 8, b: 16, a: 255 })).toBe('#000810');
  });

  it('appends alpha only when the colour is not opaque', () => {
    expect(formatHex({ r: 255, g: 0, b: 0, a: 255 })).toBe('#ff0000');
    expect(formatHex({ r: 255, g: 0, b: 0, a: 0 })).toBe('#ff000000');
  });

  it('round-trips through parseHex', () => {
    for (const hex of ['#000000', '#ffffff', '#3c8d4f', '#6f5bd0', '#c9484880']) {
      const parsed = parseHex(hex);
      expect(parsed).not.toBeNull();
      if (parsed) expect(formatHex(parsed)).toBe(hex);
    }
  });
});

describe('rgbToHsv / hsvToRgb', () => {
  it('reads the primaries', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0, a: 255 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0, a: 255 })).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255, a: 255 })).toEqual({ h: 240, s: 1, v: 1 });
  });

  it('gives grey no hue and no saturation', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128, a: 255 })).toEqual({ h: 0, s: 0, v: 128 / 255 });
    expect(rgbToHsv({ r: 0, g: 0, b: 0, a: 255 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('round-trips every eighth colour of the cube', () => {
    for (let r = 0; r <= 255; r += 37) {
      for (let g = 0; g <= 255; g += 41) {
        for (let b = 0; b <= 255; b += 43) {
          const start = rgba(r, g, b);
          expect(hsvToRgb(rgbToHsv(start))).toEqual(start);
        }
      }
    }
  });

  it('round-trips a saturated hsv through rgb', () => {
    // Only full chroma pins the hue: at s = 0.05 the whole circle lands in a
    // handful of byte triples, so the angle cannot survive the trip.
    for (let h = 0; h < 360; h += 17) {
      const back = rgbToHsv(hsvToRgb({ h, s: 1, v: 1 }));
      expect(back.h).toBeCloseTo(h, 0);
      expect(back.s).toBe(1);
      expect(back.v).toBe(1);
    }
  });

  it('round-trips saturation and value at any hue', () => {
    for (let h = 0; h < 360; h += 23) {
      for (const s of [0.2, 0.6, 1]) {
        for (const v of [0.2, 0.6, 1]) {
          const back = rgbToHsv(hsvToRgb({ h, s, v }));
          expect(back.s).toBeCloseTo(s, 1);
          expect(back.v).toBeCloseTo(v, 1);
        }
      }
    }
  });

  it('clamps an out-of-range hsv instead of producing NaN channels', () => {
    const out: Hsv = { h: 400, s: 3, v: -1 };
    expect(hsvToRgb(out)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(hsvToRgb({ h: -60, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 255, a: 255 });
  });

  it('carries alpha through unchanged', () => {
    expect(hsvToRgb({ h: 0, s: 0, v: 1 }, 40).a).toBe(40);
  });
});

describe('cssColour', () => {
  it('writes an rgba() string with alpha as a fraction', () => {
    expect(cssColour({ r: 1, g: 2, b: 3, a: 255 })).toBe('rgba(1, 2, 3, 1)');
    expect(cssColour({ r: 1, g: 2, b: 3, a: 0 })).toBe('rgba(1, 2, 3, 0)');
  });
});

describe('equalColour / withAlpha', () => {
  it('compares all four channels', () => {
    expect(equalColour(rgba(1, 2, 3), rgba(1, 2, 3))).toBe(true);
    expect(equalColour(rgba(1, 2, 3), withAlpha(rgba(1, 2, 3), 0))).toBe(false);
  });
});

describe('pushRecent', () => {
  it('puts the newest first', () => {
    expect(pushRecent(['#111111'], '#222222')).toEqual(['#222222', '#111111']);
  });

  it('moves a repeat to the front instead of duplicating it', () => {
    expect(pushRecent(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
    expect(pushRecent(['#AABBCC'], '#aabbcc')).toEqual(['#aabbcc']);
  });

  it('caps the list, dropping the oldest', () => {
    const many = ['#a', '#b', '#c'].map((s) => s.repeat(1));
    expect(pushRecent(many, '#d', 3)).toEqual(['#d', '#a', '#b']);
    expect(pushRecent([], '#d', 0)).toEqual(['#d']);
  });
});
