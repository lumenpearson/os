import type { CellRef, RangeRef } from './refs';
import { type BinaryOp, ParseError, type Token, tokenize } from './tokenizer';
import type { ErrorCode } from './values';

export type Node =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; code: ErrorCode }
  | { type: 'ref'; ref: CellRef }
  | { type: 'range'; range: RangeRef }
  | { type: 'unary'; op: '-' | '+'; operand: Node }
  | { type: 'percent'; operand: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

const PRECEDENCE: Record<BinaryOp, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly src: string,
  ) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new ParseError('Empty formula', 0);
    const node = this.expression(1);
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      throw new ParseError('Unexpected token', t?.start ?? this.src.length);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ParseError('Unexpected end of formula', this.src.length);
    this.pos++;
    return t;
  }

  /** Precedence climbing; every binary operator is left-associative, as in spreadsheets. */
  private expression(minPrec: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.type !== 'op' || t.value === '%') break;
      const prec = PRECEDENCE[t.value];
      if (prec < minPrec) break;
      this.pos++;
      const right = this.expression(prec + 1);
      left = { type: 'binary', op: t.value, left, right };
    }
    return left;
  }

  /** Unary minus binds tighter than ^ (so -2^2 = 4), matching Excel. */
  private unary(): Node {
    const t = this.peek();
    if (t && t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.pos++;
      return { type: 'unary', op: t.value, operand: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const t = this.peek();
      if (t && t.type === 'op' && t.value === '%') {
        this.pos++;
        node = { type: 'percent', operand: node };
        continue;
      }
      break;
    }
    return node;
  }

  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'number':
        return { type: 'number', value: t.value };
      case 'string':
        return { type: 'string', value: t.value };
      case 'boolean':
        return { type: 'boolean', value: t.value };
      case 'error':
        return { type: 'error', code: t.code };
      case 'ref':
        return { type: 'ref', ref: t.ref };
      case 'range':
        return { type: 'range', range: t.range };
      case 'lparen': {
        const inner = this.expression(1);
        const close = this.next();
        if (close.type !== 'rparen') throw new ParseError('Expected ")"', close.start);
        return inner;
      }
      case 'ident': {
        const open = this.peek();
        if (open?.type !== 'lparen') throw new ParseError(`Unknown name "${t.value}"`, t.start);
        this.pos++;
        const args: Node[] = [];
        const first = this.peek();
        if (first && first.type === 'rparen') {
          this.pos++;
          return { type: 'call', name: t.value, args };
        }
        for (;;) {
          const here = this.peek();
          // An empty argument (IF(A1,,"x")) reads as a blank.
          if (here && (here.type === 'comma' || here.type === 'rparen')) {
            args.push({ type: 'string', value: '' });
          } else {
            args.push(this.expression(1));
          }
          const sep = this.next();
          if (sep.type === 'rparen') break;
          if (sep.type !== 'comma') throw new ParseError('Expected "," or ")"', sep.start);
        }
        return { type: 'call', name: t.value, args };
      }
      default:
        throw new ParseError('Unexpected token', t.start);
    }
  }
}

/** Parse a formula; a leading "=" is optional. Throws ParseError. */
export function parseFormula(formula: string): Node {
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  return new Parser(tokenize(src), src).parse();
}

export { ParseError };
