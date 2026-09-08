import { describe, expect, it } from 'vitest';
import { WALLPAPERS, wallpaperById, wallpaperUrl } from './wallpapers';

/** Relative luminance of a "#rrggbb" fill, weighted the way an eye reads it. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe('WALLPAPERS', () => {
  it('gives every preset its own id under the preset namespace', () => {
    const ids = WALLPAPERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Settings tells a preset from a picture on disk by this prefix.
    for (const id of ids) expect(id.startsWith('preset:')).toBe(true);
  });

  it('draws one complete SVG per preset', () => {
    for (const preset of WALLPAPERS) {
      expect(preset.svg.startsWith('<svg xmlns=')).toBe(true);
      expect(preset.svg.endsWith('</svg>')).toBe(true);
      expect(preset.svg).toContain('viewBox="0 0 1600 1000"');
    }
  });

  it('declares a tone that matches the picture, since the chrome follows it', () => {
    for (const preset of WALLPAPERS) {
      const base = /fill="(#[0-9a-f]{6})"/.exec(preset.svg)?.[1];
      expect(base, `${preset.id} has no base fill`).toBeDefined();
      const light = luminance(base as string) > 0.5;
      expect(light, `${preset.id} is declared ${preset.tone}`).toBe(preset.tone === 'light');
    }
  });

  it('offers both tones, so neither theme is left without a picture', () => {
    const tones = WALLPAPERS.map((w) => w.tone);
    expect(tones).toContain('light');
    expect(tones).toContain('dark');
  });
});

describe('wallpaperUrl', () => {
  it('escapes the SVG so it survives a CSS url()', () => {
    const preset = WALLPAPERS[0] as (typeof WALLPAPERS)[number];
    const url = wallpaperUrl(preset);
    expect(url.startsWith('url("data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(url).not.toContain('<svg');
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1, -2))).toBe(preset.svg);
  });
});

describe('wallpaperById', () => {
  it('finds a preset and refuses anything else', () => {
    expect(wallpaperById('preset:dawn')?.name).toBe('Dawn');
    expect(wallpaperById('/home/ada/Pictures/lake.png')).toBeUndefined();
  });
});
