import { describe, expect, it } from 'vitest';
import {
  type AngleUnit,
  CalcFailure,
  canonicalizeInput,
  type ErrorCode,
  evaluate,
  parse,
  tokenize,
} from './expression';

/** The value of an expression, or a failure if it did not evaluate. */
function value(source: string, angle: AngleUnit = 'rad'): number {
  const result = evaluate(source, { angle });
  if (!result.ok) throw new Error(`${source}: ${result.error.code} — ${result.error.message}`);
  return result.value;
}

/** The error code of an expression that must fail. */
function code(source: string, angle: AngleUnit = 'rad'): ErrorCode {
  const result = evaluate(source, { angle });
  if (result.ok) throw new Error(`${source} evaluated to ${result.value}, expected a failure`);
  return result.error.code;
}

describe('tokenize', () => {
  it('reads numbers, names and operators', () => {
    expect(tokenize('12+3.5')).toEqual([
      { kind: 'number', value: 12, start: 0 },
      { kind: 'operator', op: '+', start: 2 },
      { kind: 'number', value: 3.5, start: 3 },
    ]);
  });

  it('reads exponent notation as one number', () => {
    expect(tokenize('2e3')).toEqual([{ kind: 'number', value: 2000, start: 0 }]);
  });

  it('maps typographic operators onto their plain forms', () => {
    expect(tokenize('1×2÷3−4')).toEqual([
      { kind: 'number', value: 1, start: 0 },
      { kind: 'operator', op: '*', start: 1 },
      { kind: 'number', value: 2, start: 2 },
      { kind: 'operator', op: '/', start: 3 },
      { kind: 'number', value: 3, start: 4 },
      { kind: 'operator', op: '-', start: 5 },
      { kind: 'number', value: 4, start: 6 },
    ]);
  });

  it('maps symbol names onto function names', () => {
    expect(tokenize('√π')).toEqual([
      { kind: 'name', name: 'sqrt', start: 0 },
      { kind: 'name', name: 'pi', start: 1 },
    ]);
  });

  it('reads "mod" as an operator and other words as names', () => {
    expect(tokenize('mod cos')).toEqual([
      { kind: 'operator', op: 'mod', start: 0 },
      { kind: 'name', name: 'cos', start: 4 },
    ]);
  });

  it('refuses a character that is not part of the language', () => {
    expect(() => tokenize('1 $ 2')).toThrow(CalcFailure);
  });
});

describe('precedence and associativity', () => {
  it('multiplies before it adds', () => {
    expect(value('2+3*4')).toBe(14);
    expect(value('2+3*4^2')).toBe(50);
  });

  it('reads + - / and mod from left to right', () => {
    expect(value('2-3-4')).toBe(-5);
    expect(value('100/10/2')).toBe(5);
    expect(value('20/4*5')).toBe(25);
  });

  it('reads ^ from right to left', () => {
    expect(value('2^3^2')).toBe(512);
    expect(parse('2^3^2')).toEqual({
      kind: 'binary',
      op: '^',
      left: { kind: 'number', value: 2 },
      right: {
        kind: 'binary',
        op: '^',
        left: { kind: 'number', value: 3 },
        right: { kind: 'number', value: 2 },
      },
    });
  });

  it('binds ^ tighter than a leading minus', () => {
    expect(value('-2^2')).toBe(-4);
    expect(value('(-2)^2')).toBe(4);
    expect(parse('-2^2')).toEqual({
      kind: 'unary',
      op: '-',
      operand: {
        kind: 'binary',
        op: '^',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 2 },
      },
    });
  });

  it('takes a minus on the right of ^ as an exponent', () => {
    expect(value('2^-1')).toBe(0.5);
  });
});

describe('unary signs', () => {
  it('negates and re-negates', () => {
    expect(value('-5')).toBe(-5);
    expect(value('--5')).toBe(5);
    expect(value('+5')).toBe(5);
    expect(value('-(3)')).toBe(-3);
    expect(value('3*-2')).toBe(-6);
  });

  it('applies a postfix before the sign', () => {
    expect(value('-3!')).toBe(-6);
  });
});

describe('parentheses', () => {
  it('nests', () => {
    expect(value('((1+2)*(3+4))')).toBe(21);
    expect(value('2*(3+(4-1)*2)')).toBe(18);
    expect(value('((((5))))')).toBe(5);
  });

  it('accepts square brackets as the same thing', () => {
    expect(value('[1+2]*2')).toBe(6);
  });
});

describe('implicit multiplication', () => {
  it('multiplies a value written straight before a bracket', () => {
    expect(value('2(3+4)')).toBe(14);
    expect(value('(1+2)(3+4)')).toBe(21);
  });

  it('multiplies a value written straight before a name', () => {
    expect(value('2π')).toBeCloseTo(Math.PI * 2, 12);
    expect(value('3e')).toBeCloseTo(Math.E * 3, 12);
  });

  it('keeps × below ^ and above +', () => {
    expect(value('1+2(3)')).toBe(7);
    expect(value('2(3)^2')).toBe(18);
  });
});

describe('whitespace', () => {
  it('is ignored between tokens', () => {
    expect(value('  12  +  3  ')).toBe(15);
    expect(value('1\t+\n2')).toBe(3);
    expect(value('10 mod 3')).toBe(1);
  });
});

describe('percent', () => {
  it('divides by a hundred on its own', () => {
    expect(value('10%')).toBeCloseTo(0.1, 12);
    expect(value('50%%')).toBeCloseTo(0.005, 12);
    expect(value('200*10%')).toBeCloseTo(20, 12);
  });

  it('means a share of the left side after + and -', () => {
    expect(value('200+10%')).toBe(220);
    expect(value('200-10%')).toBe(180);
  });
});

describe('factorial', () => {
  it('multiplies the whole numbers up to n', () => {
    expect(value('0!')).toBe(1);
    expect(value('5!')).toBe(120);
    expect(value('3!+1')).toBe(7);
  });

  it('refuses fractions and negatives', () => {
    expect(code('2.5!')).toBe('domain');
    expect(code('(-1)!')).toBe('domain');
  });
});

describe('functions and constants', () => {
  it('reads a function applied without brackets', () => {
    expect(value('sqrt 16')).toBe(4);
    expect(value('√16')).toBe(4);
    expect(value('∛27')).toBe(3);
  });

  it('takes a function tighter than a binary operator', () => {
    expect(value('sqrt 16 + 9')).toBe(13);
    expect(value('sqrt(16+9)')).toBe(5);
  });

  it('has pi and e', () => {
    expect(value('pi')).toBe(Math.PI);
    expect(value('e')).toBe(Math.E);
    expect(value('ln(e)')).toBe(1);
    expect(value('log(1000)')).toBeCloseTo(3, 12);
    expect(value('log2(8)')).toBe(3);
    expect(value('abs(-4)')).toBe(4);
  });
});

describe('angle unit', () => {
  it('changes what the trig functions answer', () => {
    expect(value('sin(90)', 'deg')).toBe(1);
    expect(value('sin(90)', 'rad')).toBeCloseTo(0.893996663601, 10);
    expect(value('cos(180)', 'deg')).toBe(-1);
    expect(value('sin(pi/2)', 'rad')).toBe(1);
  });

  it('stays exact on the quadrant boundaries in degrees', () => {
    expect(value('cos(90)', 'deg')).toBe(0);
    expect(value('sin(180)', 'deg')).toBe(0);
    expect(value('sin(-90)', 'deg')).toBe(-1);
    expect(value('cos(450)', 'deg')).toBe(0);
  });

  it('changes what the inverse trig functions answer', () => {
    expect(value('asin(1)', 'deg')).toBe(90);
    expect(value('asin(1)', 'rad')).toBeCloseTo(Math.PI / 2, 12);
    expect(value('atan(1)', 'deg')).toBeCloseTo(45, 12);
  });

  it('leaves the hyperbolic functions alone', () => {
    expect(value('sinh(1)', 'deg')).toBe(Math.sinh(1));
    expect(value('tanh(0)', 'deg')).toBe(0);
  });
});

describe('failures', () => {
  it('reports an empty line', () => {
    expect(code('')).toBe('empty');
    expect(code('   ')).toBe('empty');
  });

  it('reports division by zero', () => {
    expect(code('1/0')).toBe('divide-by-zero');
    expect(code('1 mod 0')).toBe('divide-by-zero');
    expect(code('0^-1')).toBe('divide-by-zero');
  });

  it('reports a value outside a function domain', () => {
    expect(code('√-1')).toBe('domain');
    expect(code('sqrt(-1)')).toBe('domain');
    expect(code('log 0')).toBe('domain');
    expect(code('ln(0)')).toBe('domain');
    expect(code('ln(-1)')).toBe('domain');
    expect(code('log2(0)')).toBe('domain');
    expect(code('asin(2)')).toBe('domain');
    expect(code('acos(-2)')).toBe('domain');
    expect(code('acosh(0)')).toBe('domain');
    expect(code('atanh(1)')).toBe('domain');
    expect(code('tan(90)', 'deg')).toBe('domain');
  });

  it('reports a result too large to hold', () => {
    expect(code('1e308*10')).toBe('overflow');
    expect(code('9^999')).toBe('overflow');
    expect(code('171!')).toBe('overflow');
    expect(code('exp(1000)')).toBe('overflow');
    expect(code('cosh(1000)')).toBe('overflow');
  });

  it('reports an unfinished expression', () => {
    expect(code('1+')).toBe('incomplete');
    expect(code('(1+2')).toBe('incomplete');
    expect(code('sqrt')).toBe('incomplete');
  });

  it('reports a syntax error with the place it happened', () => {
    expect(code('*3')).toBe('syntax');
    expect(code('1+2)')).toBe('syntax');
    expect(code('1 $ 2')).toBe('syntax');
    const result = evaluate('1+2)');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.position).toBe(3);
  });

  it('reports a name it does not know', () => {
    expect(code('foo(2)')).toBe('unknown-name');
    expect(code('2x')).toBe('unknown-name');
  });

  it('comes back as a value rather than an exception', () => {
    expect(() => evaluate('(((')).not.toThrow();
    expect(evaluate('1/0')).toEqual({
      ok: false,
      error: { code: 'divide-by-zero', message: 'Division by zero', position: undefined },
    });
  });
});

describe('canonicalizeInput', () => {
  it('swaps typed operators for the glyphs the display uses', () => {
    expect(canonicalizeInput('2*3/4')).toBe('2×3÷4');
  });

  it('keeps the string the same length so the caret does not move', () => {
    const typed = '12*34/5';
    expect(canonicalizeInput(typed)).toHaveLength(typed.length);
  });

  it('produces text the parser still reads', () => {
    expect(value(canonicalizeInput('6/2*3'))).toBe(9);
  });
});
