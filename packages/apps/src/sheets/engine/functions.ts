/**
 * The function library. Each entry is registered with a one-line doc so the
 * Help → Functions dialog and the evaluator read from the same table.
 */
import { formatPattern } from './format';
import {
  CellError,
  dateToSerial,
  flatten,
  isMatrix,
  type Matrix,
  numbersOf,
  parseDateText,
  parseNumberText,
  type Scalar,
  serialToDate,
  toBoolean,
  toNumber,
  toSerial,
  toText,
  type Value,
  ymdToSerial,
} from './values';

export interface FnContext {
  now: () => Date;
  random: () => number;
  locale: string;
}

export type SheetFunction = (args: Value[], ctx: FnContext) => Scalar;
export type FunctionCategory =
  | 'Math'
  | 'Statistics'
  | 'Logic'
  | 'Text'
  | 'Date'
  | 'Lookup'
  | 'Info';

export interface FunctionDoc {
  name: string;
  signature: string;
  description: string;
  category: FunctionCategory;
}

const registry: Record<string, SheetFunction> = {};
const docs: FunctionDoc[] = [];

function define(
  category: FunctionCategory,
  name: string,
  signature: string,
  description: string,
  fn: SheetFunction,
) {
  registry[name] = fn;
  docs.push({ name, signature, description, category });
}

export function lookupFunction(name: string): SheetFunction | undefined {
  return registry[name.toUpperCase()];
}

export const FUNCTION_DOCS: readonly FunctionDoc[] = docs;

// ── helpers ───────────────────────────────────────────────────────────────

const VALUE = () => new CellError('#VALUE!');
const NUM = () => new CellError('#NUM!');
const NA = () => new CellError('#N/A');
const DIV0 = () => new CellError('#DIV/0!');

/** A single value from an argument; a 1×1 range unwraps, anything larger is #VALUE!. */
export function scalar(v: Value | undefined): Scalar {
  if (v === undefined) return null;
  if (!isMatrix(v)) return v;
  const only = v.length === 1 && v[0]?.length === 1 ? v[0][0] : undefined;
  if (only === undefined) throw VALUE();
  return only;
}

function matrixOf(v: Value | undefined): Matrix {
  if (v === undefined) return [[null]];
  return isMatrix(v) ? v : [[v]];
}

const num = (v: Value | undefined) => toNumber(scalar(v));
const text = (v: Value | undefined) => toText(scalar(v));
const bool = (v: Value | undefined) => toBoolean(scalar(v));

function arity(args: Value[], min: number, max = min) {
  if (args.length < min || args.length > max) throw VALUE();
}

function finite(n: number): number {
  if (!Number.isFinite(n)) throw NUM();
  return n;
}

const EPS = 1e-9;

function roundHalfAway(x: number, digits: number): number {
  const f = 10 ** digits;
  const v = Math.abs(x) * f;
  return (Math.sign(x) * Math.round(v + EPS)) / f;
}

function rank(v: Scalar): number {
  if (typeof v === 'number') return 0;
  if (typeof v === 'string') return 1;
  return 2;
}

/** Spreadsheet ordering: numbers < text < booleans; text compares case-insensitively. */
export function compareScalars(a: Scalar, b: Scalar): number {
  if (a instanceof CellError) throw a;
  if (b instanceof CellError) throw b;
  let left: Scalar = a;
  let right: Scalar = b;
  if (left === null && right === null) return 0;
  if (left === null) left = typeof right === 'string' ? '' : typeof right === 'boolean' ? false : 0;
  if (right === null) right = typeof left === 'string' ? '' : typeof left === 'boolean' ? false : 0;
  const ra = rank(left);
  const rb = rank(right);
  if (ra !== rb) return ra - rb;
  if (typeof left === 'number' && typeof right === 'number')
    return left === right ? 0 : left < right ? -1 : 1;
  if (typeof left === 'string' && typeof right === 'string') {
    const l = left.toLowerCase();
    const r = right.toLowerCase();
    return l === r ? 0 : l < r ? -1 : 1;
  }
  return Number(left) - Number(right);
}

function wildcardRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (ch === '~' && i + 1 < pattern.length) {
      out += pattern.charAt(i + 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    } else if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

/** COUNTIF/SUMIF criteria: 5, ">5", "<>x", "a*", "" (blank), "<>" (non-blank). */
export function criterion(c: Scalar): (v: Scalar) => boolean {
  if (c instanceof CellError) throw c;
  if (typeof c === 'string') {
    const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(c);
    const op = m ? (m[1] ?? '=') : '=';
    const rhsText = m ? (m[2] ?? '') : c;
    const rhsNumber = parseNumberText(rhsText);
    if (op === '=' || op === '<>') {
      const equals = (v: Scalar): boolean => {
        if (rhsText === '') return v === null || v === '';
        if (v === null) return false;
        if (rhsNumber !== null) {
          const n = typeof v === 'number' ? v : typeof v === 'string' ? parseNumberText(v) : null;
          if (n !== null) return n === rhsNumber;
        }
        if (typeof v === 'string') return wildcardRegex(rhsText).test(v);
        if (typeof v === 'boolean') return rhsText.toUpperCase() === (v ? 'TRUE' : 'FALSE');
        return false;
      };
      return op === '=' ? equals : (v) => !equals(v);
    }
    const rhs: Scalar = rhsNumber ?? rhsText;
    return (v) => {
      if (v === null || v instanceof CellError) return false;
      if (typeof rhs === 'number' && typeof v === 'string') {
        const n = parseNumberText(v);
        if (n === null) return false;
        return compare(n, rhs, op);
      }
      if (rank(v) !== rank(rhs)) return false;
      return compare(v, rhs, op);
    };
  }
  return (v) => {
    if (v === null) return false;
    if (typeof c === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseNumberText(v) : null;
      return n === c;
    }
    return v === c;
  };
}

function compare(a: Scalar, b: Scalar, op: string): boolean {
  const d = compareScalars(a, b);
  switch (op) {
    case '<':
      return d < 0;
    case '>':
      return d > 0;
    case '<=':
      return d <= 0;
    case '>=':
      return d >= 0;
    case '<>':
      return d !== 0;
    default:
      return d === 0;
  }
}

function pairs(range: Value | undefined, other: Value | undefined): Array<[Scalar, Scalar]> {
  const a = matrixOf(range);
  const b = other === undefined ? a : matrixOf(other);
  const out: Array<[Scalar, Scalar]> = [];
  a.forEach((row, r) => {
    row.forEach((v, c) => {
      out.push([v, b[r]?.[c] ?? null]);
    });
  });
  return out;
}

// ── math ──────────────────────────────────────────────────────────────────

define(
  'Math',
  'SUM',
  'SUM(value1, [value2, …])',
  'Adds numbers and the numeric cells of ranges.',
  (args) => numbersOf(args).reduce((a, b) => a + b, 0),
);
define(
  'Math',
  'PRODUCT',
  'PRODUCT(value1, [value2, …])',
  'Multiplies its numeric arguments.',
  (args) => {
    const ns = numbersOf(args);
    return ns.length === 0 ? 0 : ns.reduce((a, b) => a * b, 1);
  },
);
define('Math', 'ABS', 'ABS(number)', 'Absolute value.', (args) => {
  arity(args, 1);
  return Math.abs(num(args[0]));
});
define('Math', 'SQRT', 'SQRT(number)', 'Square root; negative input gives #NUM!.', (args) => {
  arity(args, 1);
  const n = num(args[0]);
  if (n < 0) throw NUM();
  return Math.sqrt(n);
});
define('Math', 'POWER', 'POWER(base, exponent)', 'Raises base to the exponent.', (args) => {
  arity(args, 2);
  return finite(num(args[0]) ** num(args[1]));
});
define('Math', 'EXP', 'EXP(number)', 'e raised to the number.', (args) => {
  arity(args, 1);
  return finite(Math.exp(num(args[0])));
});
define('Math', 'LN', 'LN(number)', 'Natural logarithm.', (args) => {
  arity(args, 1);
  const n = num(args[0]);
  if (n <= 0) throw NUM();
  return Math.log(n);
});
define(
  'Math',
  'LOG',
  'LOG(number, [base])',
  'Logarithm in the given base (10 by default).',
  (args) => {
    arity(args, 1, 2);
    const n = num(args[0]);
    const base = args.length > 1 ? num(args[1]) : 10;
    if (n <= 0 || base <= 0 || base === 1) throw NUM();
    return Math.log(n) / Math.log(base);
  },
);
define('Math', 'LOG10', 'LOG10(number)', 'Base-10 logarithm.', (args) => {
  arity(args, 1);
  const n = num(args[0]);
  if (n <= 0) throw NUM();
  return Math.log10(n);
});
define('Math', 'MOD', 'MOD(number, divisor)', 'Remainder with the sign of the divisor.', (args) => {
  arity(args, 2);
  const n = num(args[0]);
  const d = num(args[1]);
  if (d === 0) throw DIV0();
  return n - d * Math.floor(n / d);
});
define('Math', 'INT', 'INT(number)', 'Rounds down to the nearest integer.', (args) => {
  arity(args, 1);
  return Math.floor(num(args[0]));
});
define(
  'Math',
  'TRUNC',
  'TRUNC(number, [digits])',
  'Cuts the number off at the given decimals.',
  (args) => {
    arity(args, 1, 2);
    const digits = args.length > 1 ? Math.trunc(num(args[1])) : 0;
    const f = 10 ** digits;
    const x = num(args[0]);
    return (Math.sign(x) * Math.floor(Math.abs(x) * f + EPS)) / f;
  },
);
define(
  'Math',
  'ROUND',
  'ROUND(number, [digits])',
  'Rounds to the given decimals, halves away from zero.',
  (args) => {
    arity(args, 1, 2);
    return roundHalfAway(num(args[0]), args.length > 1 ? Math.trunc(num(args[1])) : 0);
  },
);
define('Math', 'ROUNDUP', 'ROUNDUP(number, [digits])', 'Rounds away from zero.', (args) => {
  arity(args, 1, 2);
  const digits = args.length > 1 ? Math.trunc(num(args[1])) : 0;
  const f = 10 ** digits;
  const x = num(args[0]);
  return (Math.sign(x) * Math.ceil(Math.abs(x) * f - EPS)) / f;
});
define('Math', 'ROUNDDOWN', 'ROUNDDOWN(number, [digits])', 'Rounds towards zero.', (args) => {
  arity(args, 1, 2);
  const digits = args.length > 1 ? Math.trunc(num(args[1])) : 0;
  const f = 10 ** digits;
  const x = num(args[0]);
  return (Math.sign(x) * Math.floor(Math.abs(x) * f + EPS)) / f;
});
define(
  'Math',
  'FLOOR',
  'FLOOR(number, [significance])',
  'Rounds down to a multiple of significance.',
  (args) => {
    arity(args, 1, 2);
    const s = args.length > 1 ? num(args[1]) : 1;
    if (s === 0) throw DIV0();
    return Math.floor(num(args[0]) / s + EPS) * s;
  },
);
define(
  'Math',
  'CEILING',
  'CEILING(number, [significance])',
  'Rounds up to a multiple of significance.',
  (args) => {
    arity(args, 1, 2);
    const s = args.length > 1 ? num(args[1]) : 1;
    if (s === 0) throw DIV0();
    return Math.ceil(num(args[0]) / s - EPS) * s;
  },
);
define('Math', 'SIGN', 'SIGN(number)', '1, 0 or −1 by the sign of the number.', (args) => {
  arity(args, 1);
  return Math.sign(num(args[0]));
});
define('Math', 'PI', 'PI()', 'The constant π.', (args) => {
  arity(args, 0);
  return Math.PI;
});
define(
  'Math',
  'RAND',
  'RAND()',
  'A random number from 0 up to 1, new on every recalculation.',
  (args, ctx) => {
    arity(args, 0);
    return ctx.random();
  },
);
define(
  'Math',
  'RANDBETWEEN',
  'RANDBETWEEN(low, high)',
  'A random integer between low and high, inclusive.',
  (args, ctx) => {
    arity(args, 2);
    const low = Math.ceil(num(args[0]));
    const high = Math.floor(num(args[1]));
    if (high < low) throw NUM();
    return low + Math.floor(ctx.random() * (high - low + 1));
  },
);
define(
  'Math',
  'SUMIF',
  'SUMIF(range, criteria, [sum_range])',
  'Adds the cells that meet a criterion.',
  (args) => {
    arity(args, 2, 3);
    const test = criterion(scalar(args[1]));
    let total = 0;
    for (const [probe, value] of pairs(args[0], args[2])) {
      if (test(probe) && typeof value === 'number') total += value;
    }
    return total;
  },
);

// ── statistics ────────────────────────────────────────────────────────────

define(
  'Statistics',
  'AVERAGE',
  'AVERAGE(value1, [value2, …])',
  'Mean of the numeric values; blanks are skipped.',
  (args) => {
    const ns = numbersOf(args);
    if (ns.length === 0) throw DIV0();
    return ns.reduce((a, b) => a + b, 0) / ns.length;
  },
);
define(
  'Statistics',
  'MEDIAN',
  'MEDIAN(value1, [value2, …])',
  'Middle value of the numbers.',
  (args) => {
    const ns = numbersOf(args).sort((a, b) => a - b);
    if (ns.length === 0) throw NUM();
    const mid = Math.floor(ns.length / 2);
    return ns.length % 2 ? (ns[mid] ?? 0) : ((ns[mid - 1] ?? 0) + (ns[mid] ?? 0)) / 2;
  },
);
define(
  'Statistics',
  'MIN',
  'MIN(value1, [value2, …])',
  'Smallest number; 0 when there are none.',
  (args) => {
    const ns = numbersOf(args);
    return ns.length === 0 ? 0 : Math.min(...ns);
  },
);
define(
  'Statistics',
  'MAX',
  'MAX(value1, [value2, …])',
  'Largest number; 0 when there are none.',
  (args) => {
    const ns = numbersOf(args);
    return ns.length === 0 ? 0 : Math.max(...ns);
  },
);
define(
  'Statistics',
  'COUNT',
  'COUNT(value1, [value2, …])',
  'How many values are numbers.',
  (args) => {
    let n = 0;
    for (const a of args) {
      if (isMatrix(a)) {
        for (const row of a) for (const v of row) if (typeof v === 'number') n++;
      } else if (typeof a === 'number' || typeof a === 'boolean') n++;
      else if (typeof a === 'string' && parseNumberText(a) !== null) n++;
    }
    return n;
  },
);
define(
  'Statistics',
  'COUNTA',
  'COUNTA(value1, [value2, …])',
  'How many values are not blank.',
  (args) => flatten(args).filter((v) => v !== null).length,
);
define(
  'Statistics',
  'COUNTBLANK',
  'COUNTBLANK(range)',
  'How many cells in the range are empty.',
  (args) => {
    arity(args, 1);
    return flatten(args).filter((v) => v === null || v === '').length;
  },
);
define(
  'Statistics',
  'COUNTIF',
  'COUNTIF(range, criteria)',
  'Counts cells meeting a criterion such as ">5" or "a*".',
  (args) => {
    arity(args, 2);
    const test = criterion(scalar(args[1]));
    return flatten([matrixOf(args[0])]).filter(test).length;
  },
);
define(
  'Statistics',
  'AVERAGEIF',
  'AVERAGEIF(range, criteria, [average_range])',
  'Mean of the cells that meet a criterion.',
  (args) => {
    arity(args, 2, 3);
    const test = criterion(scalar(args[1]));
    const hits: number[] = [];
    for (const [probe, value] of pairs(args[0], args[2])) {
      if (test(probe) && typeof value === 'number') hits.push(value);
    }
    if (hits.length === 0) throw DIV0();
    return hits.reduce((a, b) => a + b, 0) / hits.length;
  },
);

// ── logic ─────────────────────────────────────────────────────────────────

define(
  'Logic',
  'IF',
  'IF(condition, then, [else])',
  'One value when the condition holds, another otherwise.',
  (args) => {
    arity(args, 2, 3);
    if (bool(args[0])) return scalar(args[1]);
    return args.length > 2 ? scalar(args[2]) : false;
  },
);
define(
  'Logic',
  'IFERROR',
  'IFERROR(value, fallback)',
  'The value, or the fallback when the value is an error.',
  (args) => {
    arity(args, 2);
    try {
      const v = scalar(args[0]);
      return v instanceof CellError ? scalar(args[1]) : v;
    } catch {
      return scalar(args[1]);
    }
  },
);
function logicalValues(args: Value[]): boolean[] {
  const out: boolean[] = [];
  for (const a of args) {
    if (isMatrix(a)) {
      for (const row of a) {
        for (const v of row) {
          if (v instanceof CellError) throw v;
          if (typeof v === 'boolean' || typeof v === 'number') out.push(Boolean(v));
        }
      }
    } else if (a !== null) out.push(toBoolean(a));
  }
  if (out.length === 0) throw VALUE();
  return out;
}
define(
  'Logic',
  'AND',
  'AND(condition1, [condition2, …])',
  'TRUE when every condition holds.',
  (args) => logicalValues(args).every(Boolean),
);
define('Logic', 'OR', 'OR(condition1, [condition2, …])', 'TRUE when any condition holds.', (args) =>
  logicalValues(args).some(Boolean),
);
define('Logic', 'NOT', 'NOT(condition)', 'Inverts a logical value.', (args) => {
  arity(args, 1);
  return !bool(args[0]);
});

// ── text ──────────────────────────────────────────────────────────────────

define('Text', 'LEN', 'LEN(text)', 'Number of characters.', (args) => {
  arity(args, 1);
  return [...text(args[0])].length;
});
define('Text', 'UPPER', 'UPPER(text)', 'Upper case.', (args) => {
  arity(args, 1);
  return text(args[0]).toUpperCase();
});
define('Text', 'LOWER', 'LOWER(text)', 'Lower case.', (args) => {
  arity(args, 1);
  return text(args[0]).toLowerCase();
});
define('Text', 'PROPER', 'PROPER(text)', 'Capitalises each word.', (args) => {
  arity(args, 1);
  return text(args[0])
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
});
define('Text', 'TRIM', 'TRIM(text)', 'Removes leading, trailing and repeated spaces.', (args) => {
  arity(args, 1);
  return text(args[0]).trim().replace(/\s+/g, ' ');
});
const concat: SheetFunction = (args) => flatten(args).map(toText).join('');
define('Text', 'CONCAT', 'CONCAT(text1, [text2, …])', 'Joins values into one text.', concat);
define(
  'Text',
  'CONCATENATE',
  'CONCATENATE(text1, [text2, …])',
  'Joins values into one text.',
  concat,
);
define('Text', 'LEFT', 'LEFT(text, [count])', 'The first characters.', (args) => {
  arity(args, 1, 2);
  const n = args.length > 1 ? Math.trunc(num(args[1])) : 1;
  if (n < 0) throw VALUE();
  return [...text(args[0])].slice(0, n).join('');
});
define('Text', 'RIGHT', 'RIGHT(text, [count])', 'The last characters.', (args) => {
  arity(args, 1, 2);
  const n = args.length > 1 ? Math.trunc(num(args[1])) : 1;
  if (n < 0) throw VALUE();
  const chars = [...text(args[0])];
  return n === 0 ? '' : chars.slice(-n).join('');
});
define(
  'Text',
  'MID',
  'MID(text, start, count)',
  'Characters from a 1-based start position.',
  (args) => {
    arity(args, 3);
    const start = Math.trunc(num(args[1]));
    const n = Math.trunc(num(args[2]));
    if (start < 1 || n < 0) throw VALUE();
    return [...text(args[0])].slice(start - 1, start - 1 + n).join('');
  },
);
define(
  'Text',
  'TEXT',
  'TEXT(value, pattern)',
  'Formats a value with a pattern like "0.00", "#,##0", "0%" or "yyyy-mm-dd".',
  (args, ctx) => {
    arity(args, 2);
    return formatPattern(scalar(args[0]), text(args[1]), ctx.locale);
  },
);
define(
  'Text',
  'VALUE',
  'VALUE(text)',
  'The number a text holds; ISO dates become serials.',
  (args) => {
    arity(args, 1);
    const s = scalar(args[0]);
    if (typeof s === 'number') return s;
    const t = toText(s);
    const n = parseNumberText(t) ?? parseDateText(t);
    if (n === null) throw VALUE();
    return n;
  },
);
define('Text', 'REPT', 'REPT(text, times)', 'Repeats text.', (args) => {
  arity(args, 2);
  const n = Math.trunc(num(args[1]));
  if (n < 0 || n > 10_000) throw VALUE();
  return text(args[0]).repeat(n);
});
define(
  'Text',
  'SUBSTITUTE',
  'SUBSTITUTE(text, old, new, [instance])',
  'Replaces text; every occurrence unless an instance is given.',
  (args) => {
    arity(args, 3, 4);
    const source = text(args[0]);
    const from = text(args[1]);
    const to = text(args[2]);
    if (from === '') return source;
    if (args.length < 4) return source.split(from).join(to);
    const instance = Math.trunc(num(args[3]));
    if (instance < 1) throw VALUE();
    let index = -1;
    for (let i = 0; i < instance; i++) {
      index = source.indexOf(from, index + 1);
      if (index < 0) return source;
    }
    return source.slice(0, index) + to + source.slice(index + from.length);
  },
);
define(
  'Text',
  'FIND',
  'FIND(search, text, [start])',
  '1-based position of search inside text; case-sensitive.',
  (args) => {
    arity(args, 2, 3);
    const start = args.length > 2 ? Math.trunc(num(args[2])) : 1;
    if (start < 1) throw VALUE();
    const index = text(args[1]).indexOf(text(args[0]), start - 1);
    if (index < 0) throw VALUE();
    return index + 1;
  },
);

// ── date ──────────────────────────────────────────────────────────────────

define('Date', 'NOW', 'NOW()', 'The current date and time as a serial number.', (args, ctx) => {
  arity(args, 0);
  return dateToSerial(ctx.now());
});
define('Date', 'TODAY', 'TODAY()', "Today's date as a serial number.", (args, ctx) => {
  arity(args, 0);
  return Math.floor(dateToSerial(ctx.now()));
});
define(
  'Date',
  'DATE',
  'DATE(year, month, day)',
  'A date serial; months and days overflow into the next period.',
  (args) => {
    arity(args, 3);
    return ymdToSerial(
      Math.trunc(num(args[0])),
      Math.trunc(num(args[1])),
      Math.trunc(num(args[2])),
    );
  },
);
define('Date', 'YEAR', 'YEAR(date)', 'The year of a date serial or ISO text.', (args) => {
  arity(args, 1);
  return serialToDate(toSerial(scalar(args[0]))).getFullYear();
});
define('Date', 'MONTH', 'MONTH(date)', 'The month, 1 to 12.', (args) => {
  arity(args, 1);
  return serialToDate(toSerial(scalar(args[0]))).getMonth() + 1;
});
define('Date', 'DAY', 'DAY(date)', 'The day of the month.', (args) => {
  arity(args, 1);
  return serialToDate(toSerial(scalar(args[0]))).getDate();
});
define(
  'Date',
  'WEEKDAY',
  'WEEKDAY(date, [type])',
  'Day of the week: 1 = Sunday (type 1) or 1 = Monday (type 2).',
  (args) => {
    arity(args, 1, 2);
    const type = args.length > 1 ? Math.trunc(num(args[1])) : 1;
    const day = serialToDate(toSerial(scalar(args[0]))).getDay();
    if (type === 2) return day === 0 ? 7 : day;
    if (type === 1) return day + 1;
    throw NUM();
  },
);

// ── lookup ────────────────────────────────────────────────────────────────

define(
  'Lookup',
  'VLOOKUP',
  'VLOOKUP(value, range, column, [approximate])',
  'Finds value in the first column of range and returns the cell in the given column. TRUE searches a sorted range for the closest lower match.',
  (args) => {
    arity(args, 3, 4);
    const needle = scalar(args[0]);
    const table = matrixOf(args[1]);
    const column = Math.trunc(num(args[2]));
    const approximate = args.length > 3 ? bool(args[3]) : false;
    if (column < 1) throw VALUE();
    let hit: Scalar[] | undefined;
    if (approximate) {
      for (const row of table) {
        const key = row[0] ?? null;
        if (key === null) continue;
        if (compareScalars(key, needle) <= 0) hit = row;
        else break;
      }
    } else {
      hit = table.find((row) => {
        const key = row[0] ?? null;
        return key !== null && !(key instanceof CellError) && compareScalars(key, needle) === 0;
      });
    }
    if (!hit) throw NA();
    if (column > hit.length) throw new CellError('#REF!');
    return hit[column - 1] ?? null;
  },
);
define(
  'Lookup',
  'INDEX',
  'INDEX(range, row, [column])',
  'The cell at a 1-based row and column of the range.',
  (args) => {
    arity(args, 2, 3);
    const table = matrixOf(args[0]);
    let row = Math.trunc(num(args[1]));
    let col = args.length > 2 ? Math.trunc(num(args[2])) : 1;
    if (args.length < 3 && table.length === 1) {
      col = row;
      row = 1;
    }
    const line = table[row - 1];
    if (row < 1 || col < 1 || !line || col > line.length) throw new CellError('#REF!');
    return line[col - 1] ?? null;
  },
);
define(
  'Lookup',
  'MATCH',
  'MATCH(value, range, [type])',
  'Position of value in the range: type 0 exact, 1 largest below (sorted ascending), −1 smallest above.',
  (args) => {
    arity(args, 2, 3);
    const needle = scalar(args[0]);
    const list = flatten([matrixOf(args[1])]);
    const type = args.length > 2 ? Math.trunc(num(args[2])) : 1;
    let found = -1;
    list.forEach((v, i) => {
      if (v === null || v instanceof CellError) return;
      const d = compareScalars(v, needle);
      if (type === 0) {
        if (found < 0 && d === 0) found = i;
      } else if (type > 0) {
        if (d <= 0) found = i;
      } else if (d >= 0 && found < 0) found = i;
    });
    if (found < 0) throw NA();
    return found + 1;
  },
);
define(
  'Lookup',
  'CHOOSE',
  'CHOOSE(index, value1, [value2, …])',
  'The value at the 1-based index.',
  (args) => {
    if (args.length < 2) throw VALUE();
    const index = Math.trunc(num(args[0]));
    if (index < 1 || index >= args.length) throw VALUE();
    return scalar(args[index]);
  },
);

// ── info ──────────────────────────────────────────────────────────────────

function probe(v: Value | undefined): Scalar {
  try {
    return scalar(v);
  } catch (e) {
    if (e instanceof CellError) return e;
    throw e;
  }
}
define('Info', 'ISBLANK', 'ISBLANK(value)', 'TRUE for an empty cell.', (args) => {
  arity(args, 1);
  return probe(args[0]) === null;
});
define('Info', 'ISNUMBER', 'ISNUMBER(value)', 'TRUE when the value is a number.', (args) => {
  arity(args, 1);
  return typeof probe(args[0]) === 'number';
});
define('Info', 'ISTEXT', 'ISTEXT(value)', 'TRUE when the value is text.', (args) => {
  arity(args, 1);
  return typeof probe(args[0]) === 'string';
});
define('Info', 'ISERROR', 'ISERROR(value)', 'TRUE when the value is an error.', (args) => {
  arity(args, 1);
  return probe(args[0]) instanceof CellError;
});
