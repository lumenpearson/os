import { describe, expect, it } from 'vitest';
import { evaluateArithmetic } from './arithmetic';

describe('spotlight arithmetic', () => {
  it('evaluates expressions with precedence', () => {
    expect(evaluateArithmetic('2+3*4')).toBe('14');
    expect(evaluateArithmetic('(2+3)*4')).toBe('20');
    expect(evaluateArithmetic('2^10')).toBe('1024');
    expect(evaluateArithmetic('10/4')).toBe('2.5');
    expect(evaluateArithmetic('-3 * -2')).toBe('6');
    expect(evaluateArithmetic('7 % 3')).toBe('1');
    expect(evaluateArithmetic('0.1+0.2')).toBe('0.3');
  });
  it('ignores text and bare numbers', () => {
    expect(evaluateArithmetic('files')).toBeNull();
    expect(evaluateArithmetic('42')).toBeNull();
    expect(evaluateArithmetic('2+')).toBeNull();
    expect(evaluateArithmetic('1/0')).toBeNull();
    expect(evaluateArithmetic('(2+3')).toBeNull();
  });
});
