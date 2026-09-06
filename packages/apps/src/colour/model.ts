/**
 * The four notations this app reads and writes, and the two spaces Paint did
 * not need: HSL, which CSS has always had, and Oklch, which it now has too.
 *
 * RGBA bytes are the single representation everything else is derived from.
 * Paint already owns the hex and HSV conversions and they are imported rather
 * than repeated — a second implementation of `parseHex` is a second set of
 * rounding decisions, and the two would drift.
 *
 * Every parser returns null rather than a guess. A field that cannot read what
 * was typed says so and leaves the colour alone, because the alternative —
 * silently picking black when someone mistypes an `oklch()` — loses work.
 */

import {
  clampChannel,
  clampUnit,
  formatHex,
  type Hsv,
  parseHex,
  type Rgba,
  rgba,
  rgbToHsv,
  wrapHue,
} from '../paint/colour';

export type { Hsv, Rgba };
export { formatHex, parseHex, rgbToHsv, wrapHue };

/** Hue in degrees, saturation and lightness as 0–1. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Oklch: lightness 0–1, chroma (unbounded in principle), hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export type Notation = 'hex' | 'rgb' | 'hsl' | 'oklch';

export const NOTATIONS: ReadonlyArray<{ id: Notation; label: string }> = [
  { id: 'hex', label: 'Hex' },
  { id: 'rgb', label: 'RGB' },
  { id: 'hsl', label: 'HSL' },
  { id: 'oklch', label: 'Oklch' },
];

// ── the sRGB transfer function ────────────────────────────────────────────
// IEC 61966-2-1. Contrast and the colour-vision simulation both need light
// rather than signal, so they share these two.

export function srgbToLinear(channel: number): number {
  const v = clampUnit(channel);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
  const v = clampUnit(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

// ── HSL ───────────────────────────────────────────────────────────────────

export function rgbToHsl(colour: Rgba): Hsl {
  const r = clampChannel(colour.r) / 255;
  const g = clampChannel(colour.g) / 255;
  const b = clampChannel(colour.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (span > 0) {
    if (max === r) h = ((g - b) / span) % 6;
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;
    h *= 60;
  }
  const s = span === 0 || l === 0 || l === 1 ? 0 : span / (1 - Math.abs(2 * l - 1));
  return { h: wrapHue(h), s: clampUnit(s), l: clampUnit(l) };
}

export function hslToRgb(hsl: Hsl, alpha = 255): Rgba {
  const h = wrapHue(hsl.h) / 60;
  const s = clampUnit(hsl.s);
  const l = clampUnit(hsl.l);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
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
  const [r, g, b] = triples[sector] ?? [0, 0, 0];
  const base = l - chroma / 2;
  return rgba((r + base) * 255, (g + base) * 255, (b + base) * 255, alpha);
}

// ── Oklch ─────────────────────────────────────────────────────────────────
// Björn Ottosson's Oklab (2020), the matrices published with it, wrapped in
// the polar form CSS Color 4 spells `oklch()`.

export function rgbToOklch(colour: Rgba): Oklch {
  const r = srgbToLinear(clampChannel(colour.r) / 255);
  const g = srgbToLinear(clampChannel(colour.g) / 255);
  const b = srgbToLinear(clampChannel(colour.b) / 255);
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bb = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  const chroma = Math.hypot(a, bb);
  // Grey has no hue. Reporting 0 keeps the readout round-trippable; the
  // alternative CSS spelling, `none`, is not something this field can parse.
  const hue = chroma < 1e-6 ? 0 : wrapHue((Math.atan2(bb, a) * 180) / Math.PI);
  return { l: lightness, c: chroma, h: hue };
}

export function oklchToRgb(colour: Oklch, alpha = 255): Rgba {
  const radians = (wrapHue(colour.h) * Math.PI) / 180;
  const a = Math.max(0, colour.c) * Math.cos(radians);
  const b = Math.max(0, colour.c) * Math.sin(radians);
  const lightness = colour.l;
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short;
  const g = -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short;
  const bl = -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short;
  return rgba(linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(bl) * 255, alpha);
}

// ── reading what was typed ────────────────────────────────────────────────

const FUNCTIONAL = /^([a-z]+)\(([^()]*)\)$/i;

function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const value = Number(t);
  return Number.isFinite(value) ? value : null;
}

function parsePercent(text: string): number | null {
  const t = text.trim();
  if (!t.endsWith('%')) return null;
  const value = parseNumber(t.slice(0, -1));
  return value === null ? null : value / 100;
}

/** A byte channel: `255` or `100%`. */
function parseByte(text: string): number | null {
  const percent = parsePercent(text);
  if (percent !== null) return clampChannel(percent * 255);
  const value = parseNumber(text);
  return value === null ? null : clampChannel(value);
}

/** Alpha as CSS writes it: `0.5` or `50%`. Returns a byte. */
function parseAlpha(text: string | null): number | null {
  if (text === null) return 255;
  const percent = parsePercent(text);
  if (percent !== null) return clampChannel(percent * 255);
  const value = parseNumber(text);
  return value === null ? null : clampChannel(clampUnit(value) * 255);
}

const ANGLE_UNITS: ReadonlyArray<readonly [string, number]> = [
  ['deg', 1],
  ['grad', 0.9],
  ['turn', 360],
  ['rad', 180 / Math.PI],
];

function parseAngle(text: string): number | null {
  const t = text.trim().toLowerCase();
  for (const [suffix, factor] of ANGLE_UNITS) {
    if (t.endsWith(suffix)) {
      const value = parseNumber(t.slice(0, -suffix.length));
      return value === null ? null : value * factor;
    }
  }
  const value = parseNumber(t);
  return value === null ? null : value;
}

/**
 * Saturation and lightness are percentages in CSS. A bare number is taken as
 * one anyway: people copy `hsl(210, 90, 45)` out of design tools that print it
 * that way, and refusing it teaches nothing.
 */
function parseUnitPercent(text: string): number | null {
  const percent = parsePercent(text);
  if (percent !== null) return clampUnit(percent);
  const value = parseNumber(text);
  return value === null ? null : clampUnit(value / 100);
}

interface Arguments {
  values: string[];
  alpha: string | null;
}

/**
 * Both spellings CSS allows: `f(a, b, c, alpha)` and `f(a b c / alpha)`. A
 * second slash, or a slash with nothing after it, is not a colour.
 */
function splitArguments(body: string): Arguments | null {
  const halves = body.split('/');
  if (halves.length > 2) return null;
  const head = (halves[0] ?? '').trim();
  const tail = halves.length === 2 ? (halves[1] ?? '').trim() : null;
  if (tail === '') return null;
  const values = head.split(/[\s,]+/).filter(Boolean);
  if (tail !== null) return { values, alpha: tail };
  if (values.length === 4) return { values: values.slice(0, 3), alpha: values[3] ?? null };
  return { values, alpha: null };
}

/** Any of the four notations, or null. Leading and trailing space is ignored. */
export function parseColour(text: string): Rgba | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const functional = FUNCTIONAL.exec(trimmed);
  if (!functional) return parseHex(trimmed);
  const name = (functional[1] ?? '').toLowerCase();
  const args = splitArguments(functional[2] ?? '');
  if (args?.values.length !== 3) return null;
  const [first, second, third] = args.values;
  if (first === undefined || second === undefined || third === undefined) return null;
  const alpha = parseAlpha(args.alpha);
  if (alpha === null) return null;

  if (name === 'rgb' || name === 'rgba') {
    const r = parseByte(first);
    const g = parseByte(second);
    const b = parseByte(third);
    if (r === null || g === null || b === null) return null;
    return rgba(r, g, b, alpha);
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = parseAngle(first);
    const s = parseUnitPercent(second);
    const l = parseUnitPercent(third);
    if (h === null || s === null || l === null) return null;
    return hslToRgb({ h, s, l }, alpha);
  }
  if (name === 'oklch') {
    const l = parsePercent(first) ?? parseNumber(first);
    const chromaPercent = parsePercent(second);
    // CSS Color 4 maps 100% chroma to 0.4 for oklch().
    const c = chromaPercent === null ? parseNumber(second) : chromaPercent * 0.4;
    const h = parseAngle(third);
    if (l === null || c === null || h === null) return null;
    return oklchToRgb({ l: clampUnit(l), c: Math.max(0, c), h }, alpha);
  }
  return null;
}

// ── writing it back out ───────────────────────────────────────────────────

/** Fixed places with the trailing zeros removed, so `50.0%` prints as `50%`. */
export function decimal(value: number, places: number): string {
  const fixed = value.toFixed(places);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function formatRgb(colour: Rgba): string {
  const { r, g, b, a } = colour;
  const body = `${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}`;
  if (clampChannel(a) === 255) return `rgb(${body})`;
  return `rgba(${body}, ${decimal(clampChannel(a) / 255, 3)})`;
}

export function formatHsl(colour: Rgba): string {
  const { h, s, l } = rgbToHsl(colour);
  const body = `${decimal(h, 1)}, ${decimal(s * 100, 1)}%, ${decimal(l * 100, 1)}%`;
  if (clampChannel(colour.a) === 255) return `hsl(${body})`;
  return `hsla(${body}, ${decimal(clampChannel(colour.a) / 255, 3)})`;
}

export function formatOklch(colour: Rgba): string {
  const { l, c, h } = rgbToOklch(colour);
  const body = `${decimal(l, 4)} ${decimal(c, 4)} ${decimal(h, 2)}`;
  if (clampChannel(colour.a) === 255) return `oklch(${body})`;
  return `oklch(${body} / ${decimal(clampChannel(colour.a) / 255, 3)})`;
}

export function formatColour(colour: Rgba, notation: Notation): string {
  switch (notation) {
    case 'hex':
      return formatHex(colour);
    case 'rgb':
      return formatRgb(colour);
    case 'hsl':
      return formatHsl(colour);
    case 'oklch':
      return formatOklch(colour);
  }
}

/** What goes in a `background` — always the four-argument form. */
export function cssRgba(colour: Rgba): string {
  const { r, g, b, a } = colour;
  return `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${clampChannel(a) / 255})`;
}

/** Opaque CSS for the same hue, used for slider tracks and gradient stops. */
export function cssOpaque(colour: Rgba): string {
  return `rgb(${clampChannel(colour.r)}, ${clampChannel(colour.g)}, ${clampChannel(colour.b)})`;
}
