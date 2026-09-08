import { describe, expect, it } from 'vitest';
import {
  currencyForLocale,
  defaultAlign,
  formatDate,
  formatGeneral,
  formatPattern,
  formatValue,
} from './format';
import { CellError, ymdToSerial } from './values';

const EN = 'en-US';
const DAY = ymdToSerial(2024, 5, 17);

describe('formatGeneral', () => {
  it('writes integers plainly, without grouping', () => {
    expect(formatGeneral(1234567, EN)).toBe('1234567');
    expect(formatGeneral(0, EN)).toBe('0');
    expect(formatGeneral(-42, EN)).toBe('-42');
  });

  it('keeps the decimals a number needs', () => {
    expect(formatGeneral(3.5, EN)).toBe('3.5');
    expect(formatGeneral(0.125, EN)).toBe('0.125');
  });

  it('hides float noise', () => {
    expect(formatGeneral(0.1 + 0.2, EN)).toBe('0.3');
  });

  it('stays plain while every digit is exact', () => {
    expect(formatGeneral(123456789, EN)).toBe('123456789');
    expect(formatGeneral(999999999999, EN)).toBe('999999999999');
  });

  it('uses an exponent past the exact integer range', () => {
    expect(formatGeneral(1e16, EN)).toMatch(/E/i);
    expect(formatGeneral(1e20, EN)).toMatch(/E/i);
    expect(formatGeneral(1e-12, EN)).toMatch(/E/i);
  });
});

describe('formatValue', () => {
  it('shows a blank cell as nothing', () => {
    expect(formatValue(null)).toBe('');
  });

  it('shows an error by its code', () => {
    expect(formatValue(new CellError('#DIV/0!'))).toBe('#DIV/0!');
  });

  it('shows booleans in upper case', () => {
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue(false)).toBe('FALSE');
  });

  it('passes text through under General', () => {
    expect(formatValue('hello', 'general')).toBe('hello');
  });

  it('formats a number with two decimals and thousands separators', () => {
    expect(formatValue(1234.5, 'number', { locale: EN })).toBe('1,234.50');
    expect(formatValue(-7, 'number', { locale: EN })).toBe('-7.00');
  });

  it('formats a percent', () => {
    expect(formatValue(0.256, 'percent', { locale: EN })).toBe('25.60%');
    expect(formatValue(1, 'percent', { locale: EN })).toBe('100.00%');
  });

  it('formats a currency', () => {
    expect(formatValue(9.5, 'currency', { locale: EN, currency: 'USD' })).toBe('$9.50');
    expect(formatValue(9.5, 'currency', { locale: 'de-DE', currency: 'EUR' })).toContain('9,50');
  });

  it('formats a date from a serial', () => {
    expect(formatValue(DAY, 'date', { locale: EN })).toBe('May 17, 2024');
  });

  it('formats a date from ISO text', () => {
    expect(formatValue('2024-05-17', 'date', { locale: EN })).toBe('May 17, 2024');
  });

  it('leaves text that is not a date under the date format', () => {
    expect(formatValue('hello', 'date', { locale: EN })).toBe('hello');
  });

  it('formats numeric text under a numeric format', () => {
    expect(formatValue('1234.5', 'number', { locale: EN })).toBe('1,234.50');
  });

  it('falls back to a valid locale when given a broken one', () => {
    expect(formatValue(1234.5, 'number', { locale: 'not a locale' })).toBe('1,234.50');
  });
});

describe('defaultAlign', () => {
  it('puts numbers right and text left', () => {
    expect(defaultAlign(42)).toBe('right');
    expect(defaultAlign('text')).toBe('left');
    expect(defaultAlign(null)).toBe('left');
  });

  it('centres booleans and errors', () => {
    expect(defaultAlign(true)).toBe('center');
    expect(defaultAlign(new CellError('#N/A'))).toBe('center');
  });
});

describe('formatDate', () => {
  it('formats in the requested style', () => {
    expect(formatDate(DAY, EN, 'short')).toBe('5/17/24');
    expect(formatDate(DAY, EN, 'medium')).toBe('May 17, 2024');
  });
});

describe('formatPattern', () => {
  it('formats decimals', () => {
    expect(formatPattern(1.23456, '0.00', EN)).toBe('1.23');
    expect(formatPattern(3, '0.000', EN)).toBe('3.000');
    expect(formatPattern(3.7, '0', EN)).toBe('4');
  });

  it('groups thousands', () => {
    expect(formatPattern(1234567, '#,##0', EN)).toBe('1,234,567');
    expect(formatPattern(1234.5, '#,##0.00', EN)).toBe('1,234.50');
  });

  it('formats percents', () => {
    expect(formatPattern(0.256, '0%', EN)).toBe('26%');
    expect(formatPattern(0.256, '0.0%', EN)).toBe('25.6%');
  });

  it('keeps a prefix and suffix around the number', () => {
    expect(formatPattern(5, '$0.00', EN)).toBe('$5.00');
    expect(formatPattern(5, '0.0 kg', EN)).toBe('5.0 kg');
  });

  it('formats dates', () => {
    expect(formatPattern(DAY, 'yyyy-mm-dd', EN)).toBe('2024-05-17');
    expect(formatPattern(DAY, 'd/m/yyyy', EN)).toBe('17/5/2024');
    expect(formatPattern(DAY, 'mmm d, yyyy', EN)).toBe('May 17, 2024');
    expect(formatPattern(DAY, 'mmmm', EN)).toBe('May');
    expect(formatPattern(DAY, 'yy', EN)).toBe('24');
  });

  it('formats a weekday name', () => {
    expect(formatPattern(DAY, 'dddd', EN)).toBe('Friday');
    expect(formatPattern(DAY, 'ddd', EN)).toBe('Fri');
  });

  it('formats a time from the fraction of a day', () => {
    expect(formatPattern(DAY + 0.5, 'hh:mm', EN)).toBe('12:00');
    expect(formatPattern(DAY + 13.5 / 24, 'h:mm am/pm', EN)).toBe('1:30 PM');
  });

  it('reads mm as minutes after an hour token', () => {
    expect(formatPattern(DAY + (9 * 60 + 5) / 1440, 'hh:mm', EN)).toBe('09:05');
  });

  it('formats a date from ISO text', () => {
    expect(formatPattern('2024-05-17', 'yyyy-mm-dd', EN)).toBe('2024-05-17');
  });

  it('formats numeric text', () => {
    expect(formatPattern('42', '0.00', EN)).toBe('42.00');
  });

  it('passes blanks, errors and booleans through', () => {
    expect(formatPattern(null, '0.00', EN)).toBe('');
    expect(formatPattern(new CellError('#N/A'), '0.00', EN)).toBe('#N/A');
    expect(formatPattern(true, '0.00', EN)).toBe('TRUE');
  });

  it('returns text unchanged when the pattern cannot apply', () => {
    expect(formatPattern('hello', '0.00', EN)).toBe('hello');
    expect(formatPattern('hello', 'yyyy', EN)).toBe('hello');
  });
});

describe('currencyForLocale', () => {
  it('reads the region', () => {
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale('de-DE')).toBe('EUR');
    expect(currencyForLocale('ja-JP')).toBe('JPY');
  });

  it('falls back to the language, then to USD', () => {
    expect(currencyForLocale('de')).toBe('EUR');
    expect(currencyForLocale('xx-YY')).toBe('USD');
    expect(currencyForLocale('')).toBe('USD');
  });
});
