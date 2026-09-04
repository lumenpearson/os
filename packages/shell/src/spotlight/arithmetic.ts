/**
 * A tiny arithmetic evaluator for the search palette: + - * / ^ % and
 * parentheses over decimal numbers. Returns null for anything else so ordinary
 * text never evaluates.
 */
export function evaluateArithmetic(input: string): string | null {
  const src = input.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  if (!/^[\d.()+\-*/^%]+$/.test(src) || !/\d/.test(src) || !/[+\-*/^%]/.test(src)) return null;
  let pos = 0;
  const peek = () => src[pos];
  const next = () => src[pos++];
  const number = (): number => {
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos] as string)) pos++;
    const n = Number(src.slice(start, pos));
    if (Number.isNaN(n) || start === pos) throw new Error('number');
    return n;
  };
  const factor = (): number => {
    const c = peek();
    if (c === '(') {
      next();
      const v = expr();
      if (next() !== ')') throw new Error('paren');
      return v;
    }
    if (c === '-') {
      next();
      return -factor();
    }
    if (c === '+') {
      next();
      return factor();
    }
    return number();
  };
  const power = (): number => {
    const base = factor();
    if (peek() === '^') {
      next();
      return base ** power();
    }
    return base;
  };
  const term = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = power();
      if (op === '*') v *= r;
      else if (op === '/') v /= r;
      else v %= r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const value = expr();
    if (pos !== src.length || !Number.isFinite(value)) return null;
    return formatNumber(value);
  } catch {
    return null;
  }
}

function formatNumber(v: number): string {
  const rounded = Math.round(v * 1e10) / 1e10;
  if (Math.abs(rounded) >= 1e15 || (Math.abs(rounded) < 1e-6 && rounded !== 0))
    return rounded.toExponential(6);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 10, useGrouping: false }).format(
    rounded,
  );
}
