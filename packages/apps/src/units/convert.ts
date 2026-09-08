/**
 * Converting and printing values.
 *
 * Everything goes through the category's base unit: the input is taken to the
 * base, then out of it into the target. The three scale kinds are handled
 * separately because they genuinely are different arithmetic — a factor is a
 * multiplication, temperature is affine, and fuel economy is a reciprocal.
 * Treating any of the latter two as a factor is the classic converter bug:
 * it makes 0 °C convert to 0 °F, and 40 mpg to 40 L/100 km.
 */

import { type Unit, type UnitId, unitById } from './catalogue';

/** Take a value in `unit` to the category's base unit. */
export function toBase(value: number, unit: Unit): number {
  const scale = unit.scale;
  switch (scale.kind) {
    case 'factor':
      return value * scale.factor;
    case 'affine':
      return value * scale.scale + scale.offset;
    case 'reciprocal':
      return scale.constant / value;
  }
}

/** Take a value in the category's base unit into `unit`. */
export function fromBase(base: number, unit: Unit): number {
  const scale = unit.scale;
  switch (scale.kind) {
    case 'factor':
      return base / scale.factor;
    case 'affine': {
      /**
       * Subtracting two numbers of similar size throws away the digits they
       * agree on: 459.67 degrees Rankine is absolute 0 °F, but the difference
       * comes out of the doubles as a few parts in 10^14 rather than as
       * nothing. What is left below the resolution of the numbers that
       * produced it is the subtraction's own rounding, not a temperature.
       */
      const shifted = base - scale.offset;
      const noise = Math.abs(base) * Number.EPSILON * 8;
      return (Math.abs(shifted) < noise ? 0 : shifted) / scale.scale;
    }
    case 'reciprocal':
      return scale.constant / base;
  }
}

/**
 * Convert between two units. Returns null when the units are unknown, belong
 * to different categories, or the answer is not a finite number — a car doing
 * 0 mpg burns fuel over no distance at all, and there is no honest figure to
 * print for that.
 */
export function convert(value: number, fromId: UnitId, toId: UnitId): number | null {
  const from = unitById(fromId);
  const to = unitById(toId);
  if (!from || !to || from.category !== to.category) return null;
  if (!Number.isFinite(value)) return null;
  // The identity is exact; routing it through the base would add rounding.
  if (from.id === to.id) return value;
  const result = fromBase(toBase(value, from), to);
  return Number.isFinite(result) ? result : null;
}

// ── printing ───────────────────────────────────────────────────────────────

/**
 * Significant digits a result is shown to. A double carries about 15–17, and
 * the last two or three are the arithmetic's own noise: showing 12 keeps every
 * digit that means something and prints 0.1 + 0.2 as 0.3.
 */
export const DEFAULT_PRECISION = 12;

/** Below this exponent a fixed-point string is more zeros than value. */
const SMALL_EXPONENT = -7;

export interface FormatOptions {
  /** Significant digits, 1–17. Defaults to `DEFAULT_PRECISION`. */
  precision?: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function trimZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '');
}

function exponentOf(value: number): number {
  const parts = value.toExponential().split('e');
  return Number(parts[1] ?? '0');
}

/**
 * A number as the field shows it: rounded to a fixed budget of significant
 * digits, trailing zeros trimmed, and in exponent form once fixed point would
 * be a wall of digits. Anything that is not a finite number prints as nothing
 * at all rather than as `NaN` or `Infinity`.
 */
export function formatValue(value: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';

  const precision = Math.round(clamp(options.precision ?? DEFAULT_PRECISION, 1, 17));
  const rounded = Number(value.toPrecision(precision));
  if (rounded === 0) return '0';
  const exponent = exponentOf(rounded);

  if (exponent >= precision || exponent <= SMALL_EXPONENT) {
    const [mantissa = '0'] = rounded.toExponential(precision - 1).split('e');
    return `${trimZeros(mantissa)}e${exponent}`;
  }
  const decimals = clamp(precision - 1 - exponent, 0, 100);
  return trimZeros(rounded.toFixed(decimals));
}

/** The separator between groups of digits: a thin space, not a comma. */
export const GROUP_SEPARATOR = '\u2009';

/**
 * Digits grouped in threes with `GROUP_SEPARATOR`, so a long integer can be
 * read at a glance. Exponent strings are left whole.
 */
export function groupDigits(text: string, separator = GROUP_SEPARATOR): string {
  if (text.includes('e') || text.includes('E')) return text;
  const sign = text.startsWith('-') ? '-' : '';
  const body = sign ? text.slice(1) : text;
  const point = body.indexOf('.');
  const whole = point === -1 ? body : body.slice(0, point);
  const rest = point === -1 ? '' : body.slice(point);
  if (!/^\d{5,}$/.test(whole)) return text;
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) + rest;
}

/**
 * A value with its unit, the way the status line and the recents list read it:
 * long integers grouped so the eye can count the digits.
 */
export function formatQuantity(value: number, unit: Unit, options: FormatOptions = {}): string {
  return `${groupDigits(formatValue(value, options))} ${unit.symbol}`;
}

/** Thousands separators written the way `groupDigits` writes them. */
const GROUPED = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/**
 * Read a number out of a field. Spaces, underscores and the typographic minus
 * are tolerated. A comma is only dropped when the whole string is grouped in
 * threes: `1,234` is one thousand two hundred and thirty-four, but `1,5` is
 * refused rather than silently read as fifteen, because in half of Europe the
 * person typing it meant one and a half.
 */
export function parseValue(text: string): number | null {
  const trimmed = text
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/[\s _]/g, '');
  if (trimmed === '') return null;
  const cleaned = GROUPED.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
