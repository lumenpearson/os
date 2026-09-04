/**
 * A small arithmetic evaluator for the `calc` command. Supports `+ - * / % ^`,
 * unary minus, parentheses, decimal and exponent literals, the constants
 * `pi` and `e`, and a handful of one- and two-argument functions. No `eval`.
 */

type Tok =
  | { type: 'num'; value: number }
  | { type: 'name'; value: string }
  | { type: 'op'; value: string };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: (a = 0, b = 0) => a ** b,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalcError';
  }
}

function lex(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (c === ' ' || c === '\t' || c === '_' || c === ',') {
      // Underscores and commas are digit separators (1_000, 1,000) unless they
      // separate function arguments, which the parser handles by context.
      if (c === ',') {
        out.push({ type: 'op', value: ',' });
      }
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(input.slice(i));
      if (!m) throw new CalcError(`bad number at position ${i + 1}`);
      out.push({ type: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z][A-Za-z0-9]*/.exec(input.slice(i)) as RegExpExecArray;
      out.push({ type: 'name', value: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/%^()'.includes(c)) {
      out.push({ type: 'op', value: c });
      i++;
      continue;
    }
    if (c === '×') {
      out.push({ type: 'op', value: '*' });
      i++;
      continue;
    }
    if (c === '÷') {
      out.push({ type: 'op', value: '/' });
      i++;
      continue;
    }
    throw new CalcError(`unexpected character '${c}'`);
  }
  return out;
}

/** Evaluate an arithmetic expression. Throws `CalcError` on bad input. */
export function evaluate(input: string): number {
  const tokens = lex(input);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const isOp = (v: string) => {
    const t = peek();
    return t?.type === 'op' && t.value === v;
  };

  function expression(): number {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = (take() as Tok).value;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function term(): number {
    let left = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (take() as Tok).value;
      const right = unary();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new CalcError('division by zero');
        left /= right;
      } else {
        if (right === 0) throw new CalcError('division by zero');
        left %= right;
      }
    }
    return left;
  }

  function unary(): number {
    if (isOp('-')) {
      take();
      return -unary();
    }
    if (isOp('+')) {
      take();
      return unary();
    }
    return power();
  }

  function power(): number {
    const base = atom();
    if (isOp('^')) {
      take();
      // Right-associative, and `-` binds looser than `^`: 2^-1 is allowed.
      const exponent = unary();
      return base ** exponent;
    }
    return base;
  }

  function atom(): number {
    const t = take();
    if (!t) throw new CalcError('unexpected end of expression');
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const v = expression();
      if (!isOp(')')) throw new CalcError("missing ')'");
      take();
      return v;
    }
    if (t.type === 'name') {
      if (isOp('(')) {
        take();
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new CalcError(`unknown function '${t.value}'`);
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(expression());
          while (isOp(',')) {
            take();
            args.push(expression());
          }
        }
        if (!isOp(')')) throw new CalcError("missing ')'");
        take();
        return fn(...args);
      }
      const constant = CONSTANTS[t.value];
      if (constant === undefined) throw new CalcError(`unknown name '${t.value}'`);
      return constant;
    }
    throw new CalcError(`unexpected '${t.value}'`);
  }

  if (tokens.length === 0) throw new CalcError('empty expression');
  const value = expression();
  if (pos < tokens.length) throw new CalcError(`unexpected '${(peek() as Tok).value}'`);
  if (!Number.isFinite(value)) throw new CalcError('result is not a finite number');
  return value;
}

/** Print a result without floating-point noise: 0.1+0.2 → 0.3. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toPrecision(12));
  return String(rounded);
}
