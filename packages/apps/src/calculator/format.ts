/**
 * Turning doubles into the text on the display. The calculator computes in
 * binary floating point, so the display rounds to a fixed budget of
 * significant digits and trims: `0.1 + 0.2` reads `0.3`, not
 * `0.30000000000000004`. This is a display convention, not arbitrary
 * precision — 17 digits in, 12 digits out.
 */

/** Digits a result is rounded to before it is shown. */
export const DISPLAY_PRECISION = 12;

/** Below this exponent a fixed-point string is more noise than value. */
const SMALL_EXPONENT = -7;

export interface NumberFormatOptions {
  /** Significant digits, 1–17. Defaults to `DISPLAY_PRECISION`. */
  precision?: number;
  /** Insert thousands separators in the integer part. */
  group?: boolean;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function trimZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '');
}

function exponentOf(value: number): number {
  const parts = value.toExponential().split('e');
  return Number(parts[1] ?? '0');
}

/** Format a finite number for the display; non-finite values get a word. */
export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
  if (Number.isNaN(value)) return 'Undefined';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  if (value === 0) return '0';

  const precision = Math.round(clamp(options.precision ?? DISPLAY_PRECISION, 1, 17));
  const rounded = Number(value.toPrecision(precision));
  if (rounded === 0) return '0';
  const exponent = exponentOf(rounded);

  if (exponent >= precision || exponent <= SMALL_EXPONENT) {
    const [mantissa = '0'] = rounded.toExponential(precision - 1).split('e');
    return `${trimZeros(mantissa)}e${exponent}`;
  }

  const decimals = clamp(precision - 1 - exponent, 0, 100);
  const fixed = trimZeros(rounded.toFixed(decimals));
  return options.group ? groupDigits(fixed) : fixed;
}

/**
 * Thousands separators in the integer part only. Exponential strings are left
 * alone: `1.5e21` stays one token.
 */
export function groupDigits(text: string, separator = ','): string {
  if (text.includes('e') || text.includes('E')) return text;
  const sign = text.startsWith('-') ? '-' : '';
  const body = sign ? text.slice(1) : text;
  const point = body.indexOf('.');
  const whole = point === -1 ? body : body.slice(0, point);
  const rest = point === -1 ? '' : body.slice(point);
  if (!/^\d+$/.test(whole)) return text;
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) + rest;
}

/**
 * Read a number out of pasted text: separators, spaces and the typographic
 * minus are tolerated, anything else is refused.
 */
export function parseNumberText(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/[\s,_]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export interface FitOptions {
  min?: number;
  max?: number;
  /** Advance width of one glyph as a fraction of the font size. */
  advance?: number;
}

/**
 * Font size for the display line: shrink long values instead of clipping
 * them. The face is monospaced, so the character count is the measurement.
 */
export function displayFontSize(
  characters: number,
  width: number,
  options: FitOptions = {},
): number {
  const max = options.max ?? 34;
  const min = options.min ?? 15;
  const advance = options.advance ?? 0.62;
  if (!Number.isFinite(width) || width <= 0 || characters <= 0) return max;
  return Math.round(clamp(width / (characters * advance), min, max));
}
