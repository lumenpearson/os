import { describe, expect, it } from 'vitest';
import {
  averagePixels,
  chromeTintValue,
  parseHex,
  presetTint,
  quietTint,
  toHex,
  weightedAverage,
} from './tint';
import { WALLPAPERS, wallpaperById } from './wallpapers';

describe('parseHex', () => {
  it('reads both lengths and either case', () => {
    expect(parseHex('#204')).toEqual({ r: 0x22, g: 0x00, b: 0x44 });
    expect(parseHex('#20242C')).toEqual({ r: 32, g: 36, b: 44 });
    expect(parseHex('  #20242c  ')).toEqual({ r: 32, g: 36, b: 44 });
  });

  it('refuses anything that is not a hex colour', () => {
    for (const s of ['', '20242c', '#20242', 'rgb(1,2,3)', 'currentColor', '#gg0000']) {
      expect(parseHex(s)).toBeNull();
    }
  });

  it('round-trips through toHex', () => {
    expect(toHex(parseHex('#1f2125') as never)).toBe('#1f2125');
  });
});

describe('weightedAverage', () => {
  it('weights by area, not by count', () => {
    const avg = weightedAverage([
      { colour: { r: 0, g: 0, b: 0 }, weight: 3 },
      { colour: { r: 100, g: 100, b: 100 }, weight: 1 },
    ]);
    expect(avg).toEqual({ r: 25, g: 25, b: 25 });
  });

  it('has no answer for nothing, or for zero area', () => {
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ colour: { r: 1, g: 2, b: 3 }, weight: 0 }])).toBeNull();
  });
});

describe('presetTint', () => {
  it('derives a colour for every built-in wallpaper', () => {
    for (const preset of WALLPAPERS) {
      const tint = presetTint(preset);
      expect(tint, preset.id).not.toBeNull();
    }
  });

  it('gives a dark preset a dark tint and a light one a light tint', () => {
    for (const preset of WALLPAPERS) {
      const tint = presetTint(preset) as { r: number; g: number; b: number };
      const luma = 0.299 * tint.r + 0.587 * tint.g + 0.114 * tint.b;
      if (preset.tone === 'dark') expect(luma, preset.id).toBeLessThan(128);
      else expect(luma, preset.id).toBeGreaterThan(128);
    }
  });

  it("takes Dawn's ground into account, not only its sky", () => {
    // #20242c above the horizon over 64% of the frame, #1a1d24 below it.
    const dawn = wallpaperById('preset:dawn') as never;
    const tint = presetTint(dawn) as { r: number; g: number; b: number };
    expect(tint.r).toBeGreaterThan(0x1a);
    expect(tint.r).toBeLessThan(0x20);
  });

  it('has no answer for artwork with no flat rectangle to average', () => {
    expect(presetTint({ id: 'x', name: 'x', tone: 'dark', svg: '<svg></svg>' })).toBeNull();
  });
});

describe('quietTint', () => {
  it('leaves a grey exactly where it was', () => {
    expect(quietTint({ r: 80, g: 80, b: 80 })).toEqual({ r: 80, g: 80, b: 80 });
  });

  it('keeps the hue and drops most of the saturation', () => {
    const loud = { r: 0, g: 200, b: 0 };
    const quiet = quietTint(loud);
    expect(quiet.g).toBeGreaterThan(quiet.r);
    expect(quiet.g - quiet.r).toBeLessThan((loud.g - loud.r) * 0.5);
  });

  it('stays inside the channel range for the loudest colour there is', () => {
    for (const c of [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
    ]) {
      const q = quietTint(c);
      for (const v of [q.r, q.g, q.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('chromeTintValue', () => {
  it('mixes into the theme token rather than replacing it', () => {
    const value = chromeTintValue({ r: 32, g: 36, b: 44 });
    expect(value).toContain('var(--lumen-chrome-base)');
    expect(value).toMatch(/^color-mix\(in srgb, #[0-9a-f]{6} \d+%, var\(--lumen-chrome-base\)\)$/);
  });
});

describe('averagePixels', () => {
  it('averages RGBA quads', () => {
    // one black pixel, one white one
    expect(averagePixels([0, 0, 0, 255, 255, 255, 255, 255])).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
    });
  });

  it('skips transparent pixels instead of counting them as black', () => {
    expect(averagePixels([10, 20, 30, 0, 200, 200, 200, 255])).toEqual({
      r: 200,
      g: 200,
      b: 200,
    });
  });

  it('weights a half-transparent pixel by half', () => {
    const avg = averagePixels([0, 0, 0, 255, 255, 255, 255, 128]) as { r: number };
    expect(avg.r).toBeCloseTo((255 * (128 / 255)) / (1 + 128 / 255), 6);
  });

  it('has no answer for an empty or fully transparent block', () => {
    expect(averagePixels([])).toBeNull();
    expect(averagePixels([1, 2, 3, 0])).toBeNull();
  });

  it('ignores a trailing partial pixel rather than reading past the end', () => {
    expect(averagePixels([255, 255, 255, 255, 9, 9])).toEqual({ r: 255, g: 255, b: 255 });
  });
});
