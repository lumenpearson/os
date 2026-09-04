/**
 * Colour in the three shapes this app moves between: RGBA bytes (what a
 * canvas holds), HSV (what the picker's square and strip are drawn in) and a
 * hex string (what the user types and what is written to the config file).
 *
 * Every conversion clamps rather than throws: a colour that came back from a
 * text field or a JSON file is never trusted, and a paint program that
 * refuses to draw because a hue was 361 is worse than one that draws at 1.
 */

export interface Rgba {
  /** 0–255. */
  r: number;
  g: number;
  b: number;
  /** 0–255; 0 is fully transparent. */
  a: number;
}

export interface Hsv {
  /** Degrees, 0–360 (360 wraps to 0). */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
}

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };
export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/** How many colours the recent row keeps. */
export const RECENT_LIMIT = 12;

export function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Hue is a circle: −30 is 330, 360 is 0. */
export function wrapHue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a: clampChannel(a) };
}

export function withAlpha(colour: Rgba, a: number): Rgba {
  return { ...colour, a: clampChannel(a) };
}

export function equalColour(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

const HEX = /^[0-9a-f]+$/i;

/**
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, with or without the hash and with
 * surrounding space. Anything else is null — the field shows it as invalid
 * rather than guessing.
 */
export function parseHex(text: string): Rgba | null {
  const body = text.trim().replace(/^#/, '');
  if (!HEX.test(body)) return null;
  const pair = (index: number) => Number.parseInt(body.slice(index * 2, index * 2 + 2), 16);
  const single = (index: number) => {
    const digit = body.charAt(index);
    return Number.parseInt(digit + digit, 16);
  };
  switch (body.length) {
    case 3:
      return rgba(single(0), single(1), single(2));
    case 4:
      return rgba(single(0), single(1), single(2), single(3));
    case 6:
      return rgba(pair(0), pair(1), pair(2));
    case 8:
      return rgba(pair(0), pair(1), pair(2), pair(3));
    default:
      return null;
  }
}

const byte = (value: number) => clampChannel(value).toString(16).padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when the colour is not opaque. */
export function formatHex(colour: Rgba): string {
  const base = `#${byte(colour.r)}${byte(colour.g)}${byte(colour.b)}`;
  return clampChannel(colour.a) === 255 ? base : `${base}${byte(colour.a)}`;
}

/** What goes into `fillStyle`. */
export function cssColour(colour: Rgba): string {
  const alpha = clampChannel(colour.a) / 255;
  return `rgba(${clampChannel(colour.r)}, ${clampChannel(colour.g)}, ${clampChannel(colour.b)}, ${alpha})`;
}

export function rgbToHsv(colour: Rgba): Hsv {
  const r = clampChannel(colour.r) / 255;
  const g = clampChannel(colour.g) / 255;
  const b = clampChannel(colour.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  let h = 0;
  if (span > 0) {
    if (max === r) h = ((g - b) / span) % 6;
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;
    h *= 60;
  }
  return { h: wrapHue(h), s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToRgb(hsv: Hsv, alpha = 255): Rgba {
  const h = wrapHue(hsv.h) / 60;
  const s = clampUnit(hsv.s);
  const v = clampUnit(hsv.v);
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const sector = Math.floor(h) % 6;
  const triples: ReadonlyArray<readonly [number, number, number]> = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [r, g, b] = triples[sector] ?? triples[0] ?? [0, 0, 0];
  const base = v - chroma;
  return rgba((r + base) * 255, (g + base) * 255, (b + base) * 255, alpha);
}

/**
 * Most-recent-first, no duplicates, capped. Colours are compared by their hex
 * so a colour reached twice by different routes lands in one swatch.
 */
export function pushRecent(list: readonly string[], hex: string, cap = RECENT_LIMIT): string[] {
  const normalized = hex.toLowerCase();
  const rest = list.filter((entry) => entry.toLowerCase() !== normalized);
  return [normalized, ...rest].slice(0, Math.max(1, cap));
}
