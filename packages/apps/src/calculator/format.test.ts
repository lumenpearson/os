import { describe, expect, it } from 'vitest';
import {
  DISPLAY_PRECISION,
  displayFontSize,
  formatNumber,
  groupDigits,
  parseNumberText,
} from './format';

describe('formatNumber', () => {
  it('hides the noise of binary floating point', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(0.3 - 0.1)).toBe('0.2');
    expect(formatNumber(1.005 * 100)).toBe('100.5');
    expect(formatNumber(4.35 * 100)).toBe('435');
  });

  it('trims trailing zeros and a bare point', () => {
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(1.1000000000001)).toBe('1.1');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(0.5)).toBe('0.5');
  });

  it('keeps the sign and the zero', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-42.25)).toBe('-42.25');
  });

  it('rounds to twelve significant digits', () => {
    expect(DISPLAY_PRECISION).toBe(12);
    expect(formatNumber(1 / 3)).toBe('0.333333333333');
    expect(formatNumber(2 / 3)).toBe('0.666666666667');
    expect(formatNumber(Math.PI)).toBe('3.14159265359');
  });

  it('honours a different precision', () => {
    expect(formatNumber(1 / 3, { precision: 4 })).toBe('0.3333');
    expect(formatNumber(Math.PI, { precision: 3 })).toBe('3.14');
    expect(formatNumber(Math.PI, { precision: 0 })).toBe('3');
    expect(formatNumber(Math.PI, { precision: 99 })).toBe('3.1415926535897931');
  });

  it('switches to an exponent for very large magnitudes', () => {
    expect(formatNumber(1e12)).toBe('1e12');
    expect(formatNumber(1.5e21)).toBe('1.5e21');
    expect(formatNumber(1e100)).toBe('1e100');
    expect(formatNumber(-2.5e30)).toBe('-2.5e30');
    expect(formatNumber(123456789012345)).toBe('1.23456789012e14');
  });

  it('switches to an exponent for very small magnitudes', () => {
    expect(formatNumber(1e-7)).toBe('1e-7');
    expect(formatNumber(1.25e-9)).toBe('1.25e-9');
    expect(formatNumber(-3e-40)).toBe('-3e-40');
    expect(formatNumber(5e-324)).toBe('4.94065645841e-324');
  });

  it('stays in fixed point on the near side of both thresholds', () => {
    expect(formatNumber(999999999999)).toBe('999999999999');
    expect(formatNumber(1e-6)).toBe('0.000001');
    expect(formatNumber(0.000001234)).toBe('0.000001234');
  });

  it('gives a word to the values that are not numbers', () => {
    expect(formatNumber(Number.NaN)).toBe('Undefined');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('-Infinity');
  });

  it('groups the integer part on request', () => {
    expect(formatNumber(1234567.5, { group: true })).toBe('1,234,567.5');
    expect(formatNumber(1234567.5)).toBe('1234567.5');
    expect(formatNumber(1.5e21, { group: true })).toBe('1.5e21');
  });
});

describe('groupDigits', () => {
  it('separates the integer part in threes', () => {
    expect(groupDigits('1234')).toBe('1,234');
    expect(groupDigits('1234567')).toBe('1,234,567');
    expect(groupDigits('123')).toBe('123');
    expect(groupDigits('1234.5678')).toBe('1,234.5678');
    expect(groupDigits('-1234567')).toBe('-1,234,567');
  });

  it('takes another separator', () => {
    expect(groupDigits('1234567', ' ')).toBe('1 234 567');
  });

  it('leaves an exponential string as one token', () => {
    expect(groupDigits('1.5e21')).toBe('1.5e21');
    expect(groupDigits('1.5E21')).toBe('1.5E21');
  });

  it('leaves text that is not a number alone', () => {
    expect(groupDigits('Infinity')).toBe('Infinity');
  });
});

describe('parseNumberText', () => {
  it('reads a plain number', () => {
    expect(parseNumberText('42')).toBe(42);
    expect(parseNumberText('-3.5')).toBe(-3.5);
    expect(parseNumberText('.5')).toBe(0.5);
    expect(parseNumberText('1e5')).toBe(100000);
  });

  it('tolerates separators, spaces and a typographic minus', () => {
    expect(parseNumberText('1,234.5')).toBe(1234.5);
    expect(parseNumberText('  −42  ')).toBe(-42);
    expect(parseNumberText('12 34')).toBe(1234);
    expect(parseNumberText('1_000')).toBe(1000);
  });

  it('refuses anything else', () => {
    expect(parseNumberText('')).toBeNull();
    expect(parseNumberText('abc')).toBeNull();
    expect(parseNumberText('1+2')).toBeNull();
    expect(parseNumberText('1.2.3')).toBeNull();
    expect(parseNumberText('1e999')).toBeNull();
  });
});

describe('displayFontSize', () => {
  it('keeps the largest size while the value fits', () => {
    expect(displayFontSize(4, 300)).toBe(34);
    expect(displayFontSize(1, 300)).toBe(34);
  });

  it('shrinks as the value grows', () => {
    const short = displayFontSize(10, 300);
    const long = displayFontSize(20, 300);
    expect(short).toBeGreaterThan(long);
    expect(displayFontSize(20, 300)).toBe(24);
  });

  it('stops shrinking at the floor', () => {
    expect(displayFontSize(80, 300)).toBe(15);
    expect(displayFontSize(400, 300)).toBe(15);
  });

  it('honours its own bounds and advance width', () => {
    expect(displayFontSize(10, 300, { max: 20 })).toBe(20);
    expect(displayFontSize(80, 300, { min: 10 })).toBe(10);
    expect(displayFontSize(10, 300, { advance: 1 })).toBe(30);
  });

  it('falls back to the largest size without a measurement', () => {
    expect(displayFontSize(20, 0)).toBe(34);
    expect(displayFontSize(0, 300)).toBe(34);
    expect(displayFontSize(20, Number.NaN)).toBe(34);
  });
});
