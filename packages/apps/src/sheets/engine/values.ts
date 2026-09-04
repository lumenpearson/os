/**
 * Cell values and the coercions the evaluator and functions share.
 * Errors are values (not exceptions) so IF/IFERROR can route around them;
 * coercion helpers throw a CellError, which callers turn back into a value.
 */

export type ErrorCode =
  | '#DIV/0!'
  | '#REF!'
  | '#NAME?'
  | '#VALUE!'
  | '#N/A'
  | '#CYCLE!'
  | '#NUM!'
  | '#ERROR!';

export const ERROR_CODES: readonly ErrorCode[] = [
  '#DIV/0!',
  '#REF!',
  '#NAME?',
  '#VALUE!',
  '#N/A',
  '#CYCLE!',
  '#NUM!',
  '#ERROR!',
];

export class CellError {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    this.code = code;
  }
  toString(): string {
    return this.code;
  }
}

export type Scalar = number | string | boolean | null | CellError;
export type Matrix = Scalar[][];
export type Value = Scalar | Matrix;

export function isError(v: Value): v is CellError {
  return v instanceof CellError;
}

export function isMatrix(v: Value): v is Matrix {
  return Array.isArray(v);
}

export function isBlank(v: Scalar): boolean {
  return v === null || v === '';
}

export function parseErrorCode(text: string): ErrorCode | null {
  const upper = text.toUpperCase();
  return ERROR_CODES.find((c) => c === upper) ?? null;
}

const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Number from text as a user would type it: "42", "3.5", "1e3", "12%", "1,234". */
export function parseNumberText(text: string): number | null {
  let t = text.trim();
  if (t === '') return null;
  let scale = 1;
  if (t.endsWith('%')) {
    scale = 0.01;
    t = t.slice(0, -1).trim();
  }
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  if (!NUMERIC_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n * scale : null;
}

export function toNumber(v: Scalar): number {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof CellError) throw v;
  if (v.trim() === '') return 0;
  const n = parseNumberText(v);
  if (n === null) throw new CellError('#VALUE!');
  return n;
}

export function toBoolean(v: Scalar): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof CellError) throw v;
  const upper = v.trim().toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  const n = parseNumberText(v);
  if (n === null) throw new CellError('#VALUE!');
  return n !== 0;
}

/** Text of a number without float noise: 0.1+0.2 → "0.3". */
export function numberToText(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : 'NaN';
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  return String(Number(n.toPrecision(15)));
}

export function toText(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  throw v;
}

/** Every scalar inside the arguments, ranges flattened row-major. */
export function flatten(args: Value[]): Scalar[] {
  const out: Scalar[] = [];
  for (const a of args) {
    if (isMatrix(a)) for (const row of a) out.push(...row);
    else out.push(a);
  }
  return out;
}

/**
 * Numbers for aggregate functions: direct arguments are coerced (SUM("3") = 3),
 * cells inside ranges count only when they hold a number. Errors propagate.
 */
export function numbersOf(args: Value[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    if (isMatrix(a)) {
      for (const row of a) {
        for (const v of row) {
          if (v instanceof CellError) throw v;
          if (typeof v === 'number') out.push(v);
        }
      }
    } else {
      if (a instanceof CellError) throw a;
      if (a === null) continue;
      out.push(toNumber(a));
    }
  }
  return out;
}

// ── dates ─────────────────────────────────────────────────────────────────
// Serial numbers count days since 1899-12-30 (the Excel convention), so the
// integer part is a date and the fraction a time of day.

const EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** Serial from a Date's local calendar fields (no time-zone drift). */
export function dateToSerial(d: Date): number {
  const utc = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
  return (utc - EPOCH_UTC) / DAY_MS;
}

export function ymdToSerial(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - EPOCH_UTC) / DAY_MS;
}

/** Local Date with the calendar fields the serial encodes. */
export function serialToDate(serial: number): Date {
  const utc = new Date(EPOCH_UTC + Math.round(serial * DAY_MS));
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
    utc.getUTCSeconds(),
    utc.getUTCMilliseconds(),
  );
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Serial for an ISO date or date-time string, or null. */
export function parseDateText(text: string): number | null {
  const m = ISO_DATE_RE.exec(text.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const serial = ymdToSerial(year, month, day);
  const check = serialToDate(serial);
  if (check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  const hours = Number(m[4] ?? 0);
  const minutes = Number(m[5] ?? 0);
  const seconds = Number(m[6] ?? 0);
  return serial + (hours * 3600 + minutes * 60 + seconds) / 86_400;
}

/** A date serial from a number or an ISO string; text that is not a date throws #VALUE!. */
export function toSerial(v: Scalar): number {
  if (typeof v === 'string' && v.trim() !== '') {
    const fromText = parseDateText(v);
    if (fromText !== null) return fromText;
  }
  return toNumber(v);
}
