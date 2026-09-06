import { type CellRef, lettersToCol, normalizeRange, type RangeRef } from './refs';
import { type ErrorCode, parseErrorCode } from './values';

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';
export type Op = BinaryOp | '%';

interface Span {
  start: number;
  end: number;
}

export type Token = Span &
  (
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'error'; code: ErrorCode }
    | { type: 'ref'; ref: CellRef }
    | { type: 'range'; range: RangeRef }
    | { type: 'ident'; value: string }
    | { type: 'op'; value: Op }
    | { type: 'lparen' }
    | { type: 'rparen' }
    | { type: 'comma' }
  );

export class ParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

const NUMBER_RE = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/;
const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;
const ERROR_RE = /^#(DIV\/0!|REF!|NAME\?|VALUE!|N\/A|CYCLE!|NUM!|ERROR!)/i;
const TWO_CHAR_OPS = ['<>', '<=', '>='] as const;
const ONE_CHAR_OPS = ['+', '-', '*', '/', '^', '%', '&', '=', '<', '>'] as const;

function refFromMatch(m: RegExpExecArray): CellRef {
  return {
    col: lettersToCol(m[2] ?? 'A'),
    row: Number(m[4]) - 1,
    absCol: m[1] === '$',
    absRow: m[3] === '$',
  };
}

function nextNonSpace(src: string, from: number): string {
  let i = from;
  while (i < src.length && /\s/.test(src.charAt(i))) i++;
  return src.charAt(i);
}

/** Tokens of a formula body (without the leading "="). Throws ParseError. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);

    if (ch === '"') {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < src.length) {
        const c = src.charAt(j);
        if (c === '"') {
          if (src.charAt(j + 1) === '"') {
            value += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += c;
        j++;
      }
      if (!closed) throw new ParseError('Unterminated string', i);
      tokens.push({ type: 'string', value, start: i, end: j });
      i = j;
      continue;
    }

    const num = NUMBER_RE.exec(rest);
    if (num && /[\d.]/.test(ch)) {
      tokens.push({ type: 'number', value: Number(num[0]), start: i, end: i + num[0].length });
      i += num[0].length;
      continue;
    }

    if (ch === '#') {
      const err = ERROR_RE.exec(rest);
      if (!err) throw new ParseError('Unknown error literal', i);
      const code = parseErrorCode(err[0]);
      if (!code) throw new ParseError('Unknown error literal', i);
      tokens.push({ type: 'error', code, start: i, end: i + err[0].length });
      i += err[0].length;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const ref = REF_RE.exec(rest);
      const identAfterRef = ref ? /[A-Za-z0-9_.]/.test(src.charAt(i + ref[0].length)) : false;
      if (ref && !identAfterRef && nextNonSpace(src, i + ref[0].length) !== '(') {
        const start = ref[0].length;
        const after = rest.slice(start);
        const colon = /^\s*:\s*/.exec(after);
        const second = colon ? REF_RE.exec(after.slice(colon[0].length)) : null;
        if (colon && second) {
          const len = start + colon[0].length + second[0].length;
          tokens.push({
            type: 'range',
            range: normalizeRange({ start: refFromMatch(ref), end: refFromMatch(second) }),
            start: i,
            end: i + len,
          });
          i += len;
          continue;
        }
        tokens.push({ type: 'ref', ref: refFromMatch(ref), start: i, end: i + start });
        i += start;
        continue;
      }
      const ident = IDENT_RE.exec(rest);
      if (!ident) throw new ParseError(`Unexpected "${ch}"`, i);
      const upper = ident[0].toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({
          type: 'boolean',
          value: upper === 'TRUE',
          start: i,
          end: i + ident[0].length,
        });
      } else {
        tokens.push({ type: 'ident', value: upper, start: i, end: i + ident[0].length });
      }
      i += ident[0].length;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      tokens.push({ type: 'comma', start: i, end: i + 1 });
      i++;
      continue;
    }

    const two = TWO_CHAR_OPS.find((op) => rest.startsWith(op));
    if (two) {
      tokens.push({ type: 'op', value: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    const one = ONE_CHAR_OPS.find((op) => op === ch);
    if (one) {
      tokens.push({ type: 'op', value: one, start: i, end: i + 1 });
      i++;
      continue;
    }
    throw new ParseError(`Unexpected "${ch}"`, i);
  }
  return tokens;
}
