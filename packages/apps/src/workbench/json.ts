/**
 * JSON formatting, minifying and querying.
 *
 * The document is parsed by hand rather than through `JSON.parse` for two
 * reasons. First, the engine's own error text is a moving target and reports a
 * character offset at best — a person editing a 200-line file needs a line and
 * a column. Second, `JSON.parse` builds plain objects, and a plain object
 * reorders integer-like keys (`{"2":…,"1":…}` comes back the other way round)
 * and rounds long number literals; a formatter that quietly rewrites the
 * document it was asked to tidy is worse than no formatter.
 *
 * So objects are `Map`s, which keep insertion order for every key, and numbers
 * keep the text they were written with.
 */

// ── the document model ────────────────────────────────────────────────────

/** A number literal, kept as written so formatting never changes its digits. */
export interface JsonNumber {
  readonly kind: 'number';
  readonly raw: string;
}

export type JsonObject = Map<string, JsonValue>;
export type JsonArray = JsonValue[];
export type JsonValue = null | boolean | string | JsonNumber | JsonArray | JsonObject;

export const isJsonNumber = (value: JsonValue): value is JsonNumber =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Map) &&
  value.kind === 'number';

export const isJsonObject = (value: JsonValue): value is JsonObject => value instanceof Map;

/** The numeric value of a literal. Infinite for a literal too large to hold. */
export function numberValue(value: JsonNumber): number {
  return Number(value.raw);
}

/** Plain JavaScript, for tests and for handing a value to other code. */
export function toPlain(value: JsonValue): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of value) out[key] = toPlain(item);
    return out;
  }
  return numberValue(value);
}

// ── parsing ───────────────────────────────────────────────────────────────

export interface JsonError {
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based, counted in UTF-16 code units. */
  column: number;
  /** 0-based index into the source text. */
  offset: number;
}

export type JsonParse = { ok: true; value: JsonValue } | { ok: false; error: JsonError };

/** Where an offset falls, for the message beside the field. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < at; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: at - lineStart + 1 };
}

class ParseFailure extends Error {
  constructor(
    readonly reason: string,
    readonly offset: number,
  ) {
    super(reason);
    this.name = 'ParseFailure';
  }
}

const isDigit = (code: number) => code >= 48 && code <= 57;
const isHex = (code: number) =>
  isDigit(code) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);

class Reader {
  pos = 0;
  constructor(readonly text: string) {}

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  peek(): string {
    return this.text.charAt(this.pos);
  }

  /** What to call the character the cursor is on, for a message. */
  here(): string {
    return this.done ? 'end of input' : `'${this.peek()}'`;
  }

  fail(reason: string, offset = this.pos): never {
    throw new ParseFailure(reason, offset);
  }

  skipWhitespace(): void {
    while (!this.done) {
      const code = this.text.charCodeAt(this.pos);
      if (code === 32 || code === 9 || code === 10 || code === 13) this.pos += 1;
      else break;
    }
  }
}

function parseString(r: Reader): string {
  r.pos += 1; // the opening quote
  let out = '';
  for (;;) {
    if (r.done) r.fail('Unterminated string');
    const code = r.text.charCodeAt(r.pos);
    if (code === 34) {
      r.pos += 1;
      return out;
    }
    if (code === 92) {
      const start = r.pos;
      r.pos += 1;
      if (r.done) r.fail('Unterminated string', start);
      const letter = r.text.charAt(r.pos);
      r.pos += 1;
      switch (letter) {
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case '/':
          out += '/';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'u': {
          const hex = r.text.slice(r.pos, r.pos + 4);
          if (hex.length < 4 || ![...hex].every((c) => isHex(c.charCodeAt(0))))
            r.fail('Incomplete \\u escape: four hex digits are required', start);
          out += String.fromCharCode(Number.parseInt(hex, 16));
          r.pos += 4;
          break;
        }
        default:
          r.fail(`Unknown escape '\\${letter}'`, start);
      }
      continue;
    }
    if (code < 0x20) r.fail('Control character in a string: write it as an escape');
    out += r.text.charAt(r.pos);
    r.pos += 1;
  }
}

function parseNumber(r: Reader): JsonNumber {
  const start = r.pos;
  if (r.peek() === '-') r.pos += 1;
  if (r.done || !isDigit(r.text.charCodeAt(r.pos))) r.fail(`Expected a digit, found ${r.here()}`);
  if (r.peek() === '0') r.pos += 1;
  else while (!r.done && isDigit(r.text.charCodeAt(r.pos))) r.pos += 1;
  if (r.peek() === '.') {
    r.pos += 1;
    if (r.done || !isDigit(r.text.charCodeAt(r.pos)))
      r.fail(`Expected a digit after the decimal point, found ${r.here()}`);
    while (!r.done && isDigit(r.text.charCodeAt(r.pos))) r.pos += 1;
  }
  if (r.peek() === 'e' || r.peek() === 'E') {
    r.pos += 1;
    if (r.peek() === '+' || r.peek() === '-') r.pos += 1;
    if (r.done || !isDigit(r.text.charCodeAt(r.pos)))
      r.fail(`Expected a digit in the exponent, found ${r.here()}`);
    while (!r.done && isDigit(r.text.charCodeAt(r.pos))) r.pos += 1;
  }
  return { kind: 'number', raw: r.text.slice(start, r.pos) };
}

function parseKeyword(r: Reader): JsonValue {
  for (const [word, value] of [
    ['true', true],
    ['false', false],
    ['null', null],
  ] as const) {
    if (r.text.startsWith(word, r.pos)) {
      r.pos += word.length;
      return value;
    }
  }
  return r.fail(`Unexpected character ${r.here()}`);
}

function parseValue(r: Reader, depth: number): JsonValue {
  if (depth > 512) r.fail('Nested too deeply');
  r.skipWhitespace();
  if (r.done) r.fail('Unexpected end of input');
  const ch = r.peek();
  if (ch === '{') return parseObject(r, depth);
  if (ch === '[') return parseArray(r, depth);
  if (ch === '"') return parseString(r);
  if (ch === '-' || isDigit(ch.charCodeAt(0))) return parseNumber(r);
  return parseKeyword(r);
}

function parseObject(r: Reader, depth: number): JsonObject {
  r.pos += 1; // '{'
  const out: JsonObject = new Map();
  r.skipWhitespace();
  if (r.peek() === '}') {
    r.pos += 1;
    return out;
  }
  for (;;) {
    r.skipWhitespace();
    if (r.peek() !== '"') r.fail(`Expected a property name in double quotes, found ${r.here()}`);
    const key = parseString(r);
    r.skipWhitespace();
    if (r.peek() !== ':') r.fail(`Expected ':' after the property name, found ${r.here()}`);
    r.pos += 1;
    out.set(key, parseValue(r, depth + 1));
    r.skipWhitespace();
    if (r.peek() === ',') {
      const comma = r.pos;
      r.pos += 1;
      r.skipWhitespace();
      if (r.peek() === '}') r.fail("Trailing comma before '}'", comma);
      continue;
    }
    if (r.peek() === '}') {
      r.pos += 1;
      return out;
    }
    r.fail(`Expected ',' or '}', found ${r.here()}`);
  }
}

function parseArray(r: Reader, depth: number): JsonArray {
  r.pos += 1; // '['
  const out: JsonArray = [];
  r.skipWhitespace();
  if (r.peek() === ']') {
    r.pos += 1;
    return out;
  }
  for (;;) {
    out.push(parseValue(r, depth + 1));
    r.skipWhitespace();
    if (r.peek() === ',') {
      const comma = r.pos;
      r.pos += 1;
      r.skipWhitespace();
      if (r.peek() === ']') r.fail("Trailing comma before ']'", comma);
      continue;
    }
    if (r.peek() === ']') {
      r.pos += 1;
      return out;
    }
    r.fail(`Expected ',' or ']', found ${r.here()}`);
  }
}

/** Parse a whole document. Errors carry a line and a column, not a raw exception. */
export function parseJson(text: string): JsonParse {
  const r = new Reader(text);
  try {
    const value = parseValue(r, 0);
    r.skipWhitespace();
    if (!r.done) r.fail(`Unexpected character ${r.here()} after the top-level value`);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ParseFailure) {
      const { line, column } = positionAt(text, error.offset);
      return { ok: false, error: { message: error.reason, line, column, offset: error.offset } };
    }
    throw error;
  }
}

// ── writing ───────────────────────────────────────────────────────────────

export type IndentId = 'minified' | '2' | '4' | 'tab';

const INDENT_TEXT: Record<IndentId, string> = { minified: '', '2': '  ', '4': '    ', tab: '\t' };

const ESCAPES: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** JSON string syntax. Control characters and unpaired surrogates become escapes. */
export function quoteJsonString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    const shorthand = ESCAPES[ch];
    if (shorthand !== undefined) {
      out += shorthand;
      continue;
    }
    const code = value.charCodeAt(i);
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      const next = value.charCodeAt(i + 1);
      const paired = code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
      if (paired) {
        out += ch + value.charAt(i + 1);
        i += 1;
      } else {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
      }
      continue;
    }
    out += ch;
  }
  return `${out}"`;
}

export interface WriteOptions {
  indent: IndentId;
  sortKeys: boolean;
}

/** Render a parsed document. `minified` writes one line with no spaces. */
export function stringifyJson(value: JsonValue, options: WriteOptions): string {
  const unit = INDENT_TEXT[options.indent];
  const pretty = unit !== '';
  const colon = pretty ? ': ' : ':';

  const write = (node: JsonValue, depth: number): string => {
    if (node === null) return 'null';
    if (typeof node === 'boolean') return node ? 'true' : 'false';
    if (typeof node === 'string') return quoteJsonString(node);
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]';
      const items = node.map((item) => write(item, depth + 1));
      if (!pretty) return `[${items.join(',')}]`;
      const inner = unit.repeat(depth + 1);
      return `[\n${items.map((item) => inner + item).join(',\n')}\n${unit.repeat(depth)}]`;
    }
    if (node instanceof Map) {
      if (node.size === 0) return '{}';
      const keys = [...node.keys()];
      if (options.sortKeys) keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const parts = keys.map(
        (key) => quoteJsonString(key) + colon + write(node.get(key) as JsonValue, depth + 1),
      );
      if (!pretty) return `{${parts.join(',')}}`;
      const inner = unit.repeat(depth + 1);
      return `{\n${parts.map((p) => inner + p).join(',\n')}\n${unit.repeat(depth)}}`;
    }
    return node.raw;
  };

  return write(value, 0);
}

export type JsonFormat = { ok: true; text: string } | { ok: false; error: JsonError };

/** Parse and re-emit in one step: what the Format and Minify commands run. */
export function formatJson(text: string, options: WriteOptions): JsonFormat {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: stringifyJson(parsed.value, options) };
}

// ── the path query ────────────────────────────────────────────────────────

export type PathStep =
  | { kind: 'member'; name: string }
  | { kind: 'wildcard' }
  | { kind: 'index'; index: number }
  | { kind: 'slice'; start: number | null; end: number | null; step: number };

export interface PathError {
  message: string;
  /** 1-based column in the path expression. */
  column: number;
}

export type PathParse = { ok: true; steps: PathStep[] } | { ok: false; error: PathError };

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

function readQuoted(path: string, from: number): { value: string; next: number } | null {
  const quote = path.charAt(from);
  let out = '';
  let i = from + 1;
  while (i < path.length) {
    const ch = path.charAt(i);
    if (ch === '\\' && i + 1 < path.length) {
      out += path.charAt(i + 1);
      i += 2;
      continue;
    }
    if (ch === quote) return { value: out, next: i + 1 };
    out += ch;
    i += 1;
  }
  return null;
}

/**
 * `$.a.b[0]`, `$.items[*].id`, `$[1:4]`, `$['a key']`. Deliberately a small
 * language: enough to reach into a document, with an error that points at the
 * character it gave up on.
 */
export function parsePath(path: string): PathParse {
  const steps: PathStep[] = [];
  const fail = (message: string, at: number): PathParse => ({
    ok: false,
    error: { message, column: at + 1 },
  });
  let i = 0;
  while (i < path.length && path.charAt(i) === ' ') i += 1;
  if (path.charAt(i) !== '$') return fail("A path starts with '$'", i);
  i += 1;

  while (i < path.length) {
    const ch = path.charAt(i);
    if (ch === ' ') {
      i += 1;
      continue;
    }
    if (ch === '.') {
      i += 1;
      if (path.charAt(i) === '*') {
        steps.push({ kind: 'wildcard' });
        i += 1;
        continue;
      }
      const start = i;
      while (i < path.length && /[A-Za-z0-9_$-]/.test(path.charAt(i))) i += 1;
      if (i === start) return fail('Expected a property name after the dot', start);
      steps.push({ kind: 'member', name: path.slice(start, i) });
      continue;
    }
    if (ch === '[') {
      const open = i;
      i += 1;
      if (path.charAt(i) === '*') {
        i += 1;
        if (path.charAt(i) !== ']') return fail("Expected ']'", i);
        steps.push({ kind: 'wildcard' });
        i += 1;
        continue;
      }
      if (path.charAt(i) === '"' || path.charAt(i) === "'") {
        const quoted = readQuoted(path, i);
        if (!quoted) return fail('Unterminated quoted name', i);
        i = quoted.next;
        if (path.charAt(i) !== ']') return fail("Expected ']'", i);
        steps.push({ kind: 'member', name: quoted.value });
        i += 1;
        continue;
      }
      const close = path.indexOf(']', i);
      if (close === -1) return fail("Expected ']'", open);
      const body = path.slice(i, close);
      if (body.includes(':')) {
        const parts = body.split(':');
        if (parts.length > 3) return fail('A slice takes at most start:end:step', i);
        const numbers: Array<number | null> = [];
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed === '') {
            numbers.push(null);
            continue;
          }
          if (!/^-?\d+$/.test(trimmed)) return fail(`'${trimmed}' is not a whole number`, i);
          numbers.push(Number(trimmed));
        }
        const step = numbers[2] ?? 1;
        if (step === 0) return fail('A slice step cannot be 0', i);
        steps.push({ kind: 'slice', start: numbers[0] ?? null, end: numbers[1] ?? null, step });
        i = close + 1;
        continue;
      }
      const trimmed = body.trim();
      if (!/^-?\d+$/.test(trimmed)) return fail(`'${body}' is not an index, a slice or a name`, i);
      steps.push({ kind: 'index', index: Number(trimmed) });
      i = close + 1;
      continue;
    }
    return fail(`Unexpected character '${ch}'`, i);
  }
  return { ok: true, steps };
}

export interface JsonMatch {
  /** The canonical path of this match, e.g. `$.items[0].id`. */
  path: string;
  value: JsonValue;
}

const childPath = (parent: string, name: string) =>
  IDENTIFIER.test(name) ? `${parent}.${name}` : `${parent}[${quoteJsonString(name)}]`;

/** The indices a slice selects, in the order it selects them. */
export function sliceIndices(
  length: number,
  start: number | null,
  end: number | null,
  step: number,
): number[] {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const out: number[] = [];
  if (step > 0) {
    let from = start ?? 0;
    let to = end ?? length;
    if (from < 0) from += length;
    if (to < 0) to += length;
    from = clamp(from, 0, length);
    to = clamp(to, 0, length);
    for (let i = from; i < to; i += step) out.push(i);
    return out;
  }
  let from = start ?? length - 1;
  if (from < 0) from += length;
  from = clamp(from, -1, length - 1);
  let to = -1;
  if (end !== null) {
    to = end < 0 ? end + length : end;
    to = clamp(to, -1, length);
  }
  for (let i = from; i > to; i += step) out.push(i);
  return out;
}

function applyStep(matches: JsonMatch[], step: PathStep): JsonMatch[] {
  const out: JsonMatch[] = [];
  for (const match of matches) {
    const { value, path } = match;
    switch (step.kind) {
      case 'member':
        if (value instanceof Map && value.has(step.name))
          out.push({ path: childPath(path, step.name), value: value.get(step.name) as JsonValue });
        break;
      case 'wildcard':
        if (Array.isArray(value))
          for (const [i, item] of value.entries()) out.push({ path: `${path}[${i}]`, value: item });
        else if (value instanceof Map)
          for (const [key, item] of value) out.push({ path: childPath(path, key), value: item });
        break;
      case 'index': {
        if (!Array.isArray(value)) break;
        const i = step.index < 0 ? step.index + value.length : step.index;
        if (i >= 0 && i < value.length)
          out.push({ path: `${path}[${i}]`, value: value[i] as JsonValue });
        break;
      }
      case 'slice': {
        if (!Array.isArray(value)) break;
        for (const i of sliceIndices(value.length, step.start, step.end, step.step))
          out.push({ path: `${path}[${i}]`, value: value[i] as JsonValue });
        break;
      }
    }
  }
  return out;
}

export type JsonQuery = { ok: true; matches: JsonMatch[] } | { ok: false; error: PathError };

/** Run a path over a parsed document. An empty match list is a result, not an error. */
export function queryJson(root: JsonValue, path: string): JsonQuery {
  const parsed = parsePath(path);
  if (!parsed.ok) return parsed;
  let matches: JsonMatch[] = [{ path: '$', value: root }];
  for (const step of parsed.steps) matches = applyStep(matches, step);
  return { ok: true, matches };
}

/** The matches as text: one value per line, or the single value on its own. */
export function renderMatches(matches: JsonMatch[], options: WriteOptions): string {
  if (matches.length === 1) return stringifyJson((matches[0] as JsonMatch).value, options);
  return matches.map((m) => stringifyJson(m.value, { ...options, indent: 'minified' })).join('\n');
}
