import { describe, expect, it } from 'vitest';
import {
  type FormatOptions,
  formatDateRange,
  formatDayHeading,
  formatDayNumber,
  formatFullDate,
  formatHourLabel,
  formatMediumDate,
  formatMonthYear,
  formatTimeOfDay,
  formatTimeRange,
  formatWeekNumber,
  weekdayHeaders,
} from './format';

const us: FormatOptions = { locale: 'en-US', hour12: true };
const gb: FormatOptions = { locale: 'en-GB', hour12: false };

/** Intl separates a clock from AM/PM with a narrow space; compare plainly. */
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('times', () => {
  it('follows the clock setting', () => {
    expect(plain(formatTimeOfDay(570, us))).toBe('9:30 AM');
    expect(plain(formatTimeOfDay(570, gb))).toBe('09:30');
    expect(plain(formatTimeOfDay(0, gb))).toBe('00:00');
    expect(plain(formatTimeOfDay(13 * 60, us))).toBe('1:00 PM');
  });

  it('wraps a time past midnight back onto the clock face', () => {
    expect(plain(formatTimeOfDay(25 * 60, gb))).toBe('01:00');
  });

  it('labels the hour lines of the grid', () => {
    expect(plain(formatHourLabel(9, us))).toBe('9 AM');
    // deslop-ignore-next-line 30 — the zero-padded hour this formats.
    expect(plain(formatHourLabel(9, gb))).toBe('09');
    expect(plain(formatHourLabel(0, gb))).toBe('00');
  });

  it('writes a range with an en dash', () => {
    expect(plain(formatTimeRange(540, 630, gb))).toBe('09:00 – 10:30');
  });
});

describe('dates', () => {
  it('titles a month', () => {
    expect(formatMonthYear('2026-09-04', us)).toBe('September 2026');
    expect(formatMonthYear('2026-09-04', { locale: 'de-DE', hour12: false })).toBe(
      'September 2026',
    );
  });

  it('titles a day in the order the locale writes it', () => {
    expect(formatFullDate('2026-09-04', us)).toBe('Friday, September 4, 2026');
    expect(formatFullDate('2026-09-04', gb)).toBe('Friday, 4 September 2026');
  });

  it('prints the civil date, whatever zone the machine keeps', () => {
    // A date read as an instant would slide a day either way of UTC.
    expect(formatDayNumber('2026-09-01', us)).toBe('1');
    expect(formatMediumDate('2026-01-01', us)).toContain('2026');
    expect(formatDayHeading('2026-09-04', us)).toMatch(/^Fri/);
  });

  it('joins the ends of a range', () => {
    const range = formatDateRange('2026-08-31', '2026-09-06', gb);
    expect(range).toContain('31');
    expect(range).toContain('2026');
    expect(range).toMatch(/–|-/);
  });
});

describe('weekday headers', () => {
  it('starts on the day the region does', () => {
    expect(weekdayHeaders(1, us)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(weekdayHeaders(0, us)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('has a narrow form for a tight grid', () => {
    expect(weekdayHeaders(1, us, 'narrow')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('names the days in the locale', () => {
    expect(weekdayHeaders(1, { locale: 'de-DE', hour12: false })[0]).toBe('Mo');
  });
});

describe('week numbers', () => {
  it('prints the number of the scheme in use', () => {
    expect(formatWeekNumber('2026-09-04', 1)).toBe('W36');
    expect(formatWeekNumber('2026-12-31', 0)).toBe('W1');
  });
});
