/**
 * The colour the panels borrow from the wallpaper.
 *
 * Settings > Wallpaper > "Dynamic chrome" tints the menubar, the taskbar and
 * the popovers toward whatever is behind them. The tint has to be derived,
 * not invented: for a preset it is the area-weighted average of the flat
 * rectangles the artwork is built from, and for an image it is the average of
 * the pixels the shell samples. Either way it is then pulled most of the way
 * to grey, because rule 2 gives the accent to selection and focus and nothing
 * else — a menubar in a tint of the wallpaper is a hint of warmth, not a
 * second accent colour.
 */

import type { WallpaperPreset } from './wallpapers';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#rgb` or `#rrggbb`, in any case. Anything else is not a colour we can use. */
export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const body = m[1] as string;
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** The average of a set of colours, each weighted by how much of the frame it covers. */
export function weightedAverage(samples: { colour: Rgb; weight: number }[]): Rgb | null {
  const total = samples.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total <= 0) return null;
  const acc = samples.reduce(
    (a, s) => {
      const w = Math.max(0, s.weight);
      return { r: a.r + s.colour.r * w, g: a.g + s.colour.g * w, b: a.b + s.colour.b * w };
    },
    { r: 0, g: 0, b: 0 },
  );
  return { r: acc.r / total, g: acc.g / total, b: acc.b / total };
}

/**
 * A preset's colour: the flat rectangles it is drawn from, each weighted by
 * its area. The contour strokes and the sun in Dawn are a fraction of a
 * per cent of the frame, so leaving them out moves the answer by less than a
 * step of the eight-bit channel it lands in.
 */
export function presetTint(preset: WallpaperPreset): Rgb | null {
  const samples: { colour: Rgb; weight: number }[] = [];
  const rect = /<rect\b([^>]*)>/g;
  for (const [, attrs] of preset.svg.matchAll(rect)) {
    const fill = /fill="([^"]+)"/.exec(attrs as string)?.[1];
    const colour = fill ? parseHex(fill) : null;
    if (!colour) continue;
    const width = Number.parseFloat(/\bwidth="([\d.]+)"/.exec(attrs as string)?.[1] ?? '0');
    const height = Number.parseFloat(/\bheight="([\d.]+)"/.exec(attrs as string)?.[1] ?? '0');
    if (!(width > 0 && height > 0)) continue;
    samples.push({ colour, weight: width * height });
  }
  return weightedAverage(samples);
}

/**
 * The average of a block of RGBA pixels, as `getImageData` hands them over.
 * A fully transparent pixel has no colour to contribute, so it is skipped
 * rather than averaged in as black.
 */
export function averagePixels(data: ArrayLike<number>): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const alpha = (data[i + 3] as number) / 255;
    if (alpha <= 0) continue;
    r += (data[i] as number) * alpha;
    g += (data[i + 1] as number) * alpha;
    b += (data[i + 2] as number) * alpha;
    weight += alpha;
  }
  if (weight <= 0) return null;
  return { r: r / weight, g: g / weight, b: b / weight };
}

/** How much of the colour survives the pull to grey. */
const SATURATION = 0.35;

/**
 * The tint as it is allowed to appear: the same hue, most of the saturation
 * gone. Left alone, a green wallpaper would give the whole system a green
 * menubar, which is a colour scheme rather than a hint of one.
 */
export function quietTint(colour: Rgb): Rgb {
  const grey = 0.299 * colour.r + 0.587 * colour.g + 0.114 * colour.b;
  return {
    r: grey + (colour.r - grey) * SATURATION,
    g: grey + (colour.g - grey) * SATURATION,
    b: grey + (colour.b - grey) * SATURATION,
  };
}

/** How much of the panel is the wallpaper's colour rather than the theme's. */
export const CHROME_TINT_MIX = 18;

/**
 * The value to write to `--lumen-chrome`: the tint mixed into whatever the
 * theme's own panel colour is. Written as `color-mix` rather than resolved
 * here so the base stays a token — switching between light and dark keeps
 * working with the override in place.
 */
export function chromeTintValue(colour: Rgb, mix = CHROME_TINT_MIX): string {
  return `color-mix(in srgb, ${toHex(quietTint(colour))} ${mix}%, var(--lumen-chrome-base))`;
}
