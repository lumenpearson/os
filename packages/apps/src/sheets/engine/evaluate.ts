/**
 * Sheet evaluation: every cell computed once per pass, formulas parsed once
 * per distinct text, references resolved recursively with cycle detection.
 */
import { compareScalars, type FnContext, lookupFunction, scalar as scalarOf } from './functions';
import { type Node, ParseError, parseFormula } from './parser';
import { type CellRef, type Coord, coordKey, formatRange, formatRef, type RangeRef } from './refs';
import { type Token, tokenize } from './tokenizer';
import {
  CellError,
  type ErrorCode,
  isError,
  isMatrix,
  type Matrix,
  type Scalar,
  toNumber,
  toText,
  type Value,
} from './values';

export type CellInput = string | number;
export type Cells = Record<string, CellInput>;

export interface CellResult {
  value: Scalar;
  error: ErrorCode | null;
}

export type Evaluated = Map<string, CellResult>;

export interface EvaluateOptions {
  now?: () => Date;
  random?: () => number;
  locale?: string;
}

export function isFormula(input: CellInput | null | undefined): input is string {
  return typeof input === 'string' && input.length > 1 && input.charAt(0) === '=';
}

// ── parse cache ───────────────────────────────────────────────────────────

const astCache = new Map<string, Node | ParseError>();
const AST_CACHE_LIMIT = 4000;

function parsed(formula: string): Node | ParseError {
  const hit = astCache.get(formula);
  if (hit) return hit;
  let result: Node | ParseError;
  try {
    result = parseFormula(formula);
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    result = e;
  }
  if (astCache.size >= AST_CACHE_LIMIT) astCache.clear();
  astCache.set(formula, result);
  return result;
}

// ── evaluation ────────────────────────────────────────────────────────────

interface EvalContext extends FnContext {
  get: (key: string) => Scalar;
}

function literal(input: CellInput): Scalar {
  return input;
}

function divide(a: number, b: number): number {
  if (b === 0) throw new CellError('#DIV/0!');
  return a / b;
}

function power(a: number, b: number): number {
  const r = a ** b;
  if (!Number.isFinite(r) || Number.isNaN(r)) throw new CellError('#NUM!');
  return r;
}

function binary(op: string, l: Scalar, r: Scalar): Scalar {
  switch (op) {
    case '+':
      return toNumber(l) + toNumber(r);
    case '-':
      return toNumber(l) - toNumber(r);
    case '*':
      return toNumber(l) * toNumber(r);
    case '/':
      return divide(toNumber(l), toNumber(r));
    case '^':
      return power(toNumber(l), toNumber(r));
    case '&':
      return toText(l) + toText(r);
    case '=':
      return compareScalars(l, r) === 0;
    case '<>':
      return compareScalars(l, r) !== 0;
    case '<':
      return compareScalars(l, r) < 0;
    case '>':
      return compareScalars(l, r) > 0;
    case '<=':
      return compareScalars(l, r) <= 0;
    case '>=':
      return compareScalars(l, r) >= 0;
    default:
      throw new CellError('#ERROR!');
  }
}

function guard(fn: () => Value): Value {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CellError) return e;
    throw e;
  }
}

function evalNode(node: Node, ctx: EvalContext): Value {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value;
    case 'error':
      return new CellError(node.code);
    case 'ref':
      return ctx.get(coordKey(node.ref));
    case 'range': {
      const rows: Matrix = [];
      for (let row = node.range.start.row; row <= node.range.end.row; row++) {
        const line: Scalar[] = [];
        for (let col = node.range.start.col; col <= node.range.end.col; col++)
          line.push(ctx.get(coordKey({ col, row })));
        rows.push(line);
      }
      return rows;
    }
    case 'unary':
      return guard(() => {
        const v = scalarOf(evalNode(node.operand, ctx));
        if (isError(v)) return v;
        return node.op === '-' ? -toNumber(v) : toNumber(v);
      });
    case 'percent':
      return guard(() => {
        const v = scalarOf(evalNode(node.operand, ctx));
        if (isError(v)) return v;
        return toNumber(v) / 100;
      });
    case 'binary':
      return guard(() => {
        const l = scalarOf(evalNode(node.left, ctx));
        if (isError(l)) return l;
        const r = scalarOf(evalNode(node.right, ctx));
        if (isError(r)) return r;
        return binary(node.op, l, r);
      });
    case 'call': {
      const fn = lookupFunction(node.name);
      if (!fn) return new CellError('#NAME?');
      const args = node.args.map((a) => evalNode(a, ctx));
      return guard(() => fn(args, ctx));
    }
  }
}

function toScalar(v: Value): Scalar {
  if (!isMatrix(v)) return v;
  try {
    return scalarOf(v);
  } catch (e) {
    if (e instanceof CellError) return e;
    throw e;
  }
}

function makeContext(cells: Cells, options: EvaluateOptions, results: Evaluated): EvalContext {
  const inProgress = new Set<string>();
  const ctx: EvalContext = {
    now: options.now ?? (() => new Date()),
    random: options.random ?? Math.random,
    locale: options.locale ?? 'en-US',
    get: (key) => {
      const memo = results.get(key);
      if (memo) return memo.value;
      const input = cells[key];
      if (input === undefined) return null;
      if (!isFormula(input)) {
        const value = literal(input);
        results.set(key, { value, error: null });
        return value;
      }
      if (inProgress.has(key)) return new CellError('#CYCLE!');
      inProgress.add(key);
      let value: Scalar;
      try {
        const ast = parsed(input);
        value = ast instanceof ParseError ? new CellError('#ERROR!') : toScalar(evalNode(ast, ctx));
      } finally {
        inProgress.delete(key);
      }
      results.set(key, { value, error: isError(value) ? value.code : null });
      return value;
    },
  };
  return ctx;
}

/** Evaluate every cell of a sheet. Formulas that reference themselves (directly or not) get #CYCLE!. */
export function evaluateSheet(cells: Cells, options: EvaluateOptions = {}): Evaluated {
  const results: Evaluated = new Map();
  const ctx = makeContext(cells, options, results);
  for (const key of Object.keys(cells)) ctx.get(key);
  return results;
}

/** Evaluate one formula against a sheet without storing it. */
export function evaluateFormula(
  formula: string,
  cells: Cells = {},
  options: EvaluateOptions = {},
): Scalar {
  const results: Evaluated = new Map();
  const ctx = makeContext(cells, options, results);
  const ast = parsed(formula.startsWith('=') ? formula : `=${formula}`);
  if (ast instanceof ParseError) return new CellError('#ERROR!');
  return toScalar(evalNode(ast, ctx));
}

/** Null when the formula parses, otherwise the error to show. */
export function formulaSyntaxError(formula: string): ParseError | null {
  const ast = parsed(formula);
  return ast instanceof ParseError ? ast : null;
}

// ── reference rewriting ───────────────────────────────────────────────────

function tokensOf(formula: string): { body: string; tokens: Token[] } | null {
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  try {
    return { body, tokens: tokenize(body) };
  } catch {
    return null;
  }
}

/** Replace reference tokens in a formula from the end so earlier offsets stay valid. */
function rewrite(formula: string, replace: (t: Token) => string | null): string {
  const parsedTokens = tokensOf(formula);
  if (!parsedTokens) return formula;
  let out = parsedTokens.body;
  for (let i = parsedTokens.tokens.length - 1; i >= 0; i--) {
    const t = parsedTokens.tokens[i];
    if (!t) continue;
    const text = replace(t);
    if (text === null) continue;
    out = out.slice(0, t.start) + text + out.slice(t.end);
  }
  return `=${out}`;
}

function shiftRef(ref: CellRef, dRow: number, dCol: number): CellRef | null {
  const row = ref.absRow ? ref.row : ref.row + dRow;
  const col = ref.absCol ? ref.col : ref.col + dCol;
  if (row < 0 || col < 0) return null;
  return { ...ref, row, col };
}

/** Move relative references by a delta, as when filling or pasting. `$` parts stay put. */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!isFormula(formula) || (dRow === 0 && dCol === 0)) return formula;
  return rewrite(formula, (t) => {
    if (t.type === 'ref') {
      const moved = shiftRef(t.ref, dRow, dCol);
      return moved ? formatRef(moved) : '#REF!';
    }
    if (t.type === 'range') {
      const start = shiftRef(t.range.start, dRow, dCol);
      const end = shiftRef(t.range.end, dRow, dCol);
      return start && end ? formatRange({ start, end }) : '#REF!';
    }
    return null;
  });
}

export interface StructuralChange {
  axis: 'row' | 'col';
  kind: 'insert' | 'delete';
  /** Zero-based index where the change starts. */
  at: number;
  count: number;
}

function adjustIndex(index: number, change: StructuralChange): number | null {
  if (change.kind === 'insert') return index >= change.at ? index + change.count : index;
  if (index >= change.at + change.count) return index - change.count;
  if (index >= change.at) return null;
  return index;
}

function adjustRef(ref: CellRef, change: StructuralChange): CellRef | null {
  const index = change.axis === 'row' ? ref.row : ref.col;
  const next = adjustIndex(index, change);
  if (next === null) return null;
  return change.axis === 'row' ? { ...ref, row: next } : { ...ref, col: next };
}

function adjustRange(range: RangeRef, change: StructuralChange): RangeRef | null {
  const axis = change.axis;
  const s = axis === 'row' ? range.start.row : range.start.col;
  const e = axis === 'row' ? range.end.row : range.end.col;
  let ns: number;
  let ne: number;
  if (change.kind === 'insert') {
    ns = s >= change.at ? s + change.count : s;
    ne = e >= change.at ? e + change.count : e;
  } else {
    const after = change.at + change.count;
    ns = s >= after ? s - change.count : s >= change.at ? change.at : s;
    ne = e >= after ? e - change.count : e >= change.at ? change.at - 1 : e;
    if (ns > ne) return null;
  }
  const set = (ref: CellRef, v: number): CellRef =>
    axis === 'row' ? { ...ref, row: v } : { ...ref, col: v };
  return { start: set(range.start, ns), end: set(range.end, ne) };
}

/** Rewrite references after rows or columns are inserted or deleted. Absolute refs move too. */
export function adjustFormula(formula: string, change: StructuralChange): string {
  if (!isFormula(formula) || change.count <= 0) return formula;
  return rewrite(formula, (t) => {
    if (t.type === 'ref') {
      const moved = adjustRef(t.ref, change);
      return moved ? formatRef(moved) : '#REF!';
    }
    if (t.type === 'range') {
      const moved = adjustRange(t.range, change);
      return moved ? formatRange(moved) : '#REF!';
    }
    return null;
  });
}

/** Cells and ranges a formula reads, for highlighting while editing. */
export function formulaReferences(formula: string): Array<{ start: Coord; end: Coord }> {
  const parsedTokens = tokensOf(formula);
  if (!parsedTokens) return [];
  const out: Array<{ start: Coord; end: Coord }> = [];
  for (const t of parsedTokens.tokens) {
    if (t.type === 'ref') out.push({ start: t.ref, end: t.ref });
    else if (t.type === 'range') out.push({ start: t.range.start, end: t.range.end });
  }
  return out;
}
