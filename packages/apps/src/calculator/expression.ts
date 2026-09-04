/**
 * The calculator's arithmetic: a tokenizer, a precedence-climbing parser that
 * produces an AST, and an evaluator over IEEE doubles.
 *
 * Rules the parser holds to:
 *  - `^` is right associative and binds tighter than unary minus, so
 *    `-2^2` is -4 and `2^3^2` is 512.
 *  - juxtaposition multiplies: `2(3+4)`, `2π`, `(1+2)(3+4)`.
 *  - `%` is postfix. As the right operand of `+`/`-` it means "percent of the
 *    left side" (`200+10%` is 220); anywhere else it divides by 100.
 *  - every failure is a value, never an exception that escapes `evaluate`.
 */

export type AngleUnit = 'deg' | 'rad';

export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | 'mod';
export type PostfixOperator = '!' | '%';

export type Token =
  | { kind: 'number'; value: number; start: number }
  | { kind: 'name'; name: string; start: number }
  | { kind: 'operator'; op: BinaryOperator | PostfixOperator; start: number }
  | { kind: 'lparen'; start: number }
  | { kind: 'rparen'; start: number };

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'constant'; name: ConstantName }
  | { kind: 'unary'; op: '+' | '-'; operand: Node }
  | { kind: 'binary'; op: BinaryOperator; left: Node; right: Node }
  | { kind: 'postfix'; op: PostfixOperator; operand: Node }
  | { kind: 'call'; name: FunctionName; argument: Node };

export type ErrorCode =
  | 'empty'
  | 'syntax'
  | 'incomplete'
  | 'unknown-name'
  | 'divide-by-zero'
  | 'domain'
  | 'overflow';

export interface CalcError {
  code: ErrorCode;
  message: string;
  /** Index into the source string, when the failure has a place. */
  position?: number;
}

export type EvalResult = { ok: true; value: number } | { ok: false; error: CalcError };

export interface EvalOptions {
  angle?: AngleUnit;
}

/** Thrown inside the module, converted to a `CalcError` by `evaluate`. */
export class CalcFailure extends Error {
  readonly error: CalcError;
  constructor(error: CalcError) {
    super(error.message);
    this.name = 'CalcFailure';
    this.error = error;
  }
}

const fail = (code: ErrorCode, message: string, position?: number): never => {
  throw new CalcFailure({ code, message, position });
};

// ── tokenizer ─────────────────────────────────────────────────────────────

/** Symbols users type or the keypad inserts, mapped to their canonical form. */
const CHAR_ALIASES: Record<string, BinaryOperator | PostfixOperator | 'lparen' | 'rparen'> = {
  '+': '+',
  '-': '-',
  '−': '-', // minus sign
  '–': '-', // en dash
  '—': '-', // em dash
  '*': '*',
  '×': '*', // multiplication sign
  '·': '*', // middle dot
  '⋅': '*', // dot operator
  '/': '/',
  '÷': '/', // division sign
  '∕': '/', // division slash
  '^': '^',
  '!': '!',
  '%': '%',
  '(': 'lparen',
  '[': 'lparen',
  ')': 'rparen',
  ']': 'rparen',
};

const NAME_ALIASES: Record<string, string> = {
  π: 'pi', // π
  '√': 'sqrt', // √
  '∛': 'cbrt', // ∛
};

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const LETTERS = /^[A-Za-z_][A-Za-z0-9_]*/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (/\s/.test(ch) || ch === ' ') {
      i += 1;
      continue;
    }
    const alias = NAME_ALIASES[ch];
    if (alias) {
      tokens.push({ kind: 'name', name: alias, start: i });
      i += 1;
      continue;
    }
    const symbol = CHAR_ALIASES[ch];
    if (symbol) {
      if (symbol === 'lparen' || symbol === 'rparen') tokens.push({ kind: symbol, start: i });
      else tokens.push({ kind: 'operator', op: symbol, start: i });
      i += 1;
      continue;
    }
    const rest = source.slice(i);
    const digits = NUMBER.exec(rest);
    if (digits) {
      tokens.push({ kind: 'number', value: Number(digits[0]), start: i });
      i += digits[0].length;
      continue;
    }
    const word = LETTERS.exec(rest);
    if (word) {
      const name = word[0].toLowerCase();
      if (name === 'mod') tokens.push({ kind: 'operator', op: 'mod', start: i });
      else tokens.push({ kind: 'name', name, start: i });
      i += word[0].length;
      continue;
    }
    fail('syntax', `Unexpected character "${ch}"`, i);
  }
  return tokens;
}

// ── names ─────────────────────────────────────────────────────────────────

export type ConstantName = 'pi' | 'e';

const CONSTANTS: Record<ConstantName, number> = { pi: Math.PI, e: Math.E };

export const FUNCTION_NAMES = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'ln',
  'log',
  'log2',
  'exp',
  'sqrt',
  'cbrt',
  'abs',
] as const;

export type FunctionName = (typeof FUNCTION_NAMES)[number];

const FUNCTION_SET = new Set<string>(FUNCTION_NAMES);

function isConstant(name: string): name is ConstantName {
  return name === 'pi' || name === 'e';
}

// ── parser ────────────────────────────────────────────────────────────────

const BINDING: Record<BinaryOperator, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  mod: 2,
  '^': 4,
};
const UNARY_BINDING = 3;

/** Parse an expression into an AST. Throws `CalcFailure`. */
export function parse(source: string): Node {
  const tokens = tokenize(source);
  if (tokens.length === 0) fail('empty', 'Nothing to calculate');
  let index = 0;

  const peek = (): Token | undefined => tokens[index];
  const next = (): Token | undefined => tokens[index++];

  function parsePrimary(): Node {
    const token = next();
    if (!token) return fail('incomplete', 'The expression is unfinished', source.length);
    switch (token.kind) {
      case 'number':
        return { kind: 'number', value: token.value };
      case 'lparen': {
        const inner = parseBinary(0);
        const close = peek();
        if (close?.kind !== 'rparen')
          return fail('incomplete', 'A bracket is still open', token.start);
        index += 1;
        return inner;
      }
      case 'name': {
        if (isConstant(token.name)) return { kind: 'constant', name: token.name };
        if (FUNCTION_SET.has(token.name))
          return { kind: 'call', name: token.name as FunctionName, argument: parseUnary() };
        return fail('unknown-name', `Unknown name "${token.name}"`, token.start);
      }
      case 'operator':
        return fail('syntax', `"${token.op}" needs a number before it`, token.start);
      case 'rparen':
        return fail('syntax', 'Unmatched bracket', token.start);
    }
  }

  function parsePostfix(): Node {
    let node = parsePrimary();
    for (;;) {
      const token = peek();
      if (token?.kind !== 'operator') break;
      if (token.op !== '!' && token.op !== '%') break;
      index += 1;
      node = { kind: 'postfix', op: token.op, operand: node };
    }
    return node;
  }

  function parseUnary(): Node {
    const token = peek();
    if (token?.kind === 'operator' && (token.op === '-' || token.op === '+')) {
      index += 1;
      return { kind: 'unary', op: token.op, operand: parseBinary(UNARY_BINDING) };
    }
    return parsePostfix();
  }

  function parseBinary(minBinding: number): Node {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (!token) break;
      if (token.kind === 'operator') {
        if (token.op === '!' || token.op === '%') break;
        const binding = BINDING[token.op];
        if (binding < minBinding) break;
        index += 1;
        const right = parseBinary(token.op === '^' ? binding : binding + 1);
        left = { kind: 'binary', op: token.op, left, right };
        continue;
      }
      // Juxtaposition: a number, name or "(" straight after a value multiplies.
      if (token.kind === 'number' || token.kind === 'name' || token.kind === 'lparen') {
        const binding = BINDING['*'];
        if (binding < minBinding) break;
        left = { kind: 'binary', op: '*', left, right: parseBinary(binding + 1) };
        continue;
      }
      break;
    }
    return left;
  }

  const node = parseBinary(0);
  const extra = peek();
  if (extra) fail('syntax', 'Unmatched bracket', extra.start);
  return node;
}

// ── evaluator ─────────────────────────────────────────────────────────────

function finite(value: number, what: string): number {
  if (Number.isNaN(value)) return fail('domain', `${what} is undefined here`);
  if (!Number.isFinite(value)) return fail('overflow', 'The result is too large to show');
  return value;
}

const wrapDegrees = (x: number): number => ((x % 360) + 360) % 360;

/** Sine, cosine and tangent that stay exact on the quadrant boundaries in degrees. */
function trig(fn: 'sin' | 'cos' | 'tan', x: number, angle: AngleUnit): number {
  if (angle === 'deg') {
    const turn = wrapDegrees(x);
    if (turn % 90 === 0) {
      const quadrant = turn / 90;
      if (fn === 'sin') return [0, 1, 0, -1][quadrant] ?? 0;
      if (fn === 'cos') return [1, 0, -1, 0][quadrant] ?? 0;
      if (quadrant % 2 === 1) return fail('domain', 'Tangent is undefined at 90° and 270°');
      return 0;
    }
    return Math[fn]((x * Math.PI) / 180);
  }
  return Math[fn](x);
}

const fromRadians = (x: number, angle: AngleUnit): number =>
  angle === 'deg' ? (x * 180) / Math.PI : x;

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0)
    return fail('domain', 'Factorial needs a whole number that is not negative');
  if (n > 170) return fail('overflow', 'The result is too large to show');
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

function callFunction(name: FunctionName, x: number, angle: AngleUnit): number {
  switch (name) {
    case 'sin':
      return trig('sin', x, angle);
    case 'cos':
      return trig('cos', x, angle);
    case 'tan':
      return trig('tan', x, angle);
    case 'asin':
      if (x < -1 || x > 1) return fail('domain', 'asin needs a value between -1 and 1');
      return fromRadians(Math.asin(x), angle);
    case 'acos':
      if (x < -1 || x > 1) return fail('domain', 'acos needs a value between -1 and 1');
      return fromRadians(Math.acos(x), angle);
    case 'atan':
      return fromRadians(Math.atan(x), angle);
    case 'sinh':
      return finite(Math.sinh(x), 'sinh');
    case 'cosh':
      return finite(Math.cosh(x), 'cosh');
    case 'tanh':
      return Math.tanh(x);
    case 'asinh':
      return Math.asinh(x);
    case 'acosh':
      if (x < 1) return fail('domain', 'acosh needs a value of 1 or more');
      return Math.acosh(x);
    case 'atanh':
      if (x <= -1 || x >= 1) return fail('domain', 'atanh needs a value between -1 and 1');
      return Math.atanh(x);
    case 'ln':
      if (x <= 0) return fail('domain', 'The logarithm needs a value above zero');
      return Math.log(x);
    case 'log':
      if (x <= 0) return fail('domain', 'The logarithm needs a value above zero');
      return Math.log10(x);
    case 'log2':
      if (x <= 0) return fail('domain', 'The logarithm needs a value above zero');
      return Math.log2(x);
    case 'exp':
      return finite(Math.exp(x), 'exp');
    case 'sqrt':
      if (x < 0) return fail('domain', 'The square root needs a value of zero or more');
      return Math.sqrt(x);
    case 'cbrt':
      return Math.cbrt(x);
    case 'abs':
      return Math.abs(x);
  }
}

function evaluateNode(node: Node, angle: AngleUnit): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'constant':
      return CONSTANTS[node.name];
    case 'unary': {
      const value = evaluateNode(node.operand, angle);
      return node.op === '-' ? -value : value;
    }
    case 'postfix': {
      const value = evaluateNode(node.operand, angle);
      return node.op === '!' ? factorial(value) : value / 100;
    }
    case 'call':
      return finite(callFunction(node.name, evaluateNode(node.argument, angle), angle), node.name);
    case 'binary': {
      const left = evaluateNode(node.left, angle);
      // "200 + 10%" adds a tenth of 200, the way every pocket calculator reads it.
      if ((node.op === '+' || node.op === '-') && isPercent(node.right)) {
        const share = (left * evaluateNode(node.right.operand, angle)) / 100;
        return finite(node.op === '+' ? left + share : left - share, 'The result');
      }
      const right = evaluateNode(node.right, angle);
      switch (node.op) {
        case '+':
          return finite(left + right, 'The result');
        case '-':
          return finite(left - right, 'The result');
        case '*':
          return finite(left * right, 'The result');
        case '/':
          if (right === 0) return fail('divide-by-zero', 'Division by zero');
          return finite(left / right, 'The result');
        case 'mod':
          if (right === 0) return fail('divide-by-zero', 'Division by zero');
          return finite(left % right, 'The result');
        case '^':
          if (left === 0 && right < 0) return fail('divide-by-zero', 'Division by zero');
          return finite(left ** right, 'The power');
      }
    }
  }
}

function isPercent(node: Node): node is { kind: 'postfix'; op: '%'; operand: Node } {
  return node.kind === 'postfix' && node.op === '%';
}

/** Evaluate an expression. Never throws: failures come back as `ok: false`. */
export function evaluate(source: string, options: EvalOptions = {}): EvalResult {
  try {
    const value = evaluateNode(parse(source), options.angle ?? 'rad');
    return { ok: true, value: finite(value, 'The result') };
  } catch (error) {
    if (error instanceof CalcFailure) return { ok: false, error: error.error };
    throw error;
  }
}

/**
 * Rewrite typed operators into the glyphs the display uses. Every replacement
 * is one character wide, so a caret in the field does not move.
 */
export function canonicalizeInput(text: string): string {
  return text.replace(/\*/g, '×').replace(/\//g, '÷');
}
