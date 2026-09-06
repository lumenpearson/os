import { describe, expect, it } from 'vitest';
import { evaluate, formatNumber } from './calc';
import {
  calendar,
  columns,
  defaultDate,
  formatDate,
  formatDuration,
  listingDate,
  table,
} from './format';

describe('columns', () => {
  it('lays names out column-major within the width', () => {
    const out = columns(['a', 'b', 'c', 'd'], 10);
    expect(out).toBe('a  c\nb  d\n');
  });

  it('falls back to one per line when the width is small', () => {
    expect(columns(['alpha', 'beta'], 4)).toBe('alpha\nbeta\n');
  });

  it('returns nothing for an empty list', () => {
    expect(columns([], 80)).toBe('');
  });
});

describe('table', () => {
  it('aligns columns under the header', () => {
    const out = table(
      [{ label: 'PID', align: 'right' }, { label: 'NAME' }],
      [
        ['7', 'sh'],
        ['100', 'terminal'],
      ],
    );
    expect(out).toBe('PID  NAME\n  7  sh\n100  terminal\n');
  });
});

describe('formatDate', () => {
  const d = new Date(2026, 8, 4, 9, 5, 3);

  it('renders the common specifiers', () => {
    expect(formatDate(d, '%Y-%m-%d')).toBe('2026-09-04');
    expect(formatDate(d, '%H:%M:%S')).toBe('09:05:03');
    expect(formatDate(d, '%A %B')).toBe('Friday September');
    expect(formatDate(d, '%a %b')).toBe('Fri Sep');
    expect(formatDate(d, '%I:%M %p')).toBe('09:05 AM');
    expect(formatDate(d, '%e')).toBe(' 4');
    expect(formatDate(d, '%F %T')).toBe('2026-09-04 09:05:03');
  });

  it('passes text through and handles %%', () => {
    expect(formatDate(d, 'week %% %Y!')).toBe('week % 2026!');
    expect(formatDate(d, 'no specifiers')).toBe('no specifiers');
  });

  it('leaves an unknown specifier visible', () => {
    expect(formatDate(d, '%Q')).toBe('%Q');
  });

  it('formats the default date and a listing date', () => {
    expect(defaultDate(d)).toBe('Fri Sep  4 09:05:03 2026');
    expect(listingDate(d.getTime(), d.getTime())).toBe('Sep  4 09:05');
    expect(listingDate(new Date(2024, 0, 2).getTime(), d.getTime())).toBe('Jan  2  2024');
  });
});

describe('calendar', () => {
  it('draws a month starting on Monday with aligned columns', () => {
    const lines = calendar(new Date(2026, 8, 1), 1, new Date(2026, 8, 4)).split('\n');
    expect(lines[0]?.trim()).toBe('September 2026');
    expect(lines[1]).toBe('Mo Tu We Th Fr Sa Su');
    // 1 September 2026 is a Tuesday.
    expect(lines[2]?.startsWith('    1  2  3 *4')).toBe(true);
  });

  it('can start the week on Sunday', () => {
    expect(calendar(new Date(2026, 8, 1), 0).split('\n')[1]).toBe('Su Mo Tu We Th Fr Sa');
  });

  it('marks nothing when today is in another month', () => {
    expect(calendar(new Date(2026, 0, 1), 1, new Date(2026, 8, 4))).not.toContain('*');
  });
});

describe('formatDuration', () => {
  it('scales from seconds to days', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(3661)).toBe('1:01');
    expect(formatDuration(90_000)).toBe('1 day, 1:00');
    expect(formatDuration(180_000)).toBe('2 days, 2:00');
  });
});

describe('calc', () => {
  it('respects precedence and parentheses', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('10 % 3')).toBe(1);
    expect(evaluate('-4 + 2')).toBe(-2);
    expect(evaluate('2 ^ -1')).toBe(0.5);
  });

  it('supports constants and functions', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('max(2, 9)')).toBe(9);
    expect(evaluate('round(pi * 100) / 100')).toBe(3.14);
  });

  it('rejects bad input', () => {
    expect(() => evaluate('1 / 0')).toThrow('division by zero');
    expect(() => evaluate('2 +')).toThrow();
    expect(() => evaluate('(1')).toThrow();
    expect(() => evaluate('nope(2)')).toThrow('unknown function');
    expect(() => evaluate('alert(1)')).toThrow();
    expect(() => evaluate('')).toThrow('empty expression');
  });

  it('prints results without floating-point noise', () => {
    expect(formatNumber(evaluate('0.1 + 0.2'))).toBe('0.3');
    expect(formatNumber(evaluate('1 / 3'))).toBe('0.333333333333');
    expect(formatNumber(4)).toBe('4');
  });
});
