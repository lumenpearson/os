import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  civilNow,
  clampMinutes,
  compareKeys,
  daysInMonth,
  diffDays,
  epochDayOf,
  type FormatOptions,
  formatDay,
  formatDayHeading,
  formatDue,
  formatDueDate,
  formatTimeOfDay,
  fromEpochDay,
  fromTimeValue,
  isDateKey,
  isLeapYear,
  isOverdue,
  keyFromEpochDay,
  nextWeekday,
  parseKey,
  relativeDayLabel,
  toEpochDay,
  toKey,
  toTimeValue,
  weekdayOf,
} from './date';

const us: FormatOptions = { locale: 'en-US', hour12: true };
const gb: FormatOptions = { locale: 'en-GB', hour12: false };

/** Intl separates a clock from AM/PM with a narrow space; compare plainly. */
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('keys', () => {
  it('reads and writes YYYY-MM-DD', () => {
    expect(toKey({ year: 2026, month: 9, day: 5 })).toBe('2026-09-05');
    expect(parseKey('2026-09-05')).toEqual({ year: 2026, month: 9, day: 5 });
  });

  it('rejects a date the calendar does not have', () => {
    expect(parseKey('2026-02-30')).toBeNull();
    expect(parseKey('2026-13-01')).toBeNull();
    expect(parseKey('2026-00-10')).toBeNull();
    expect(parseKey('2026-9-5')).toBeNull();
    expect(parseKey('not a date')).toBeNull();
    expect(isDateKey(20_260_905)).toBe(false);
    expect(isDateKey('2024-02-29')).toBe(true);
  });

  it('knows the length of February', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('epoch days', () => {
  it('anchors on the epoch itself', () => {
    expect(toEpochDay({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(fromEpochDay(0)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(epochDayOf('nonsense')).toBe(0);
  });

  it('round-trips every day of four years, leap day included', () => {
    let key = '2024-01-01';
    for (let i = 0; i < 1461; i += 1) {
      expect(keyFromEpochDay(epochDayOf(key))).toBe(key);
      key = addDays(key, 1);
    }
    expect(key).toBe('2028-01-01');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(diffDays('2026-09-05', '2026-09-12')).toBe(7);
    expect(diffDays('2026-09-12', '2026-09-05')).toBe(-7);
    expect(compareKeys('2026-09-05', '2026-09-05')).toBe(0);
  });

  it('clamps a month step onto a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-09-05', 12)).toBe('2027-09-05');
    expect(addMonths('nonsense', 1)).toBe('nonsense');
  });
});

describe('weekdays', () => {
  it('numbers Sunday zero', () => {
    expect(weekdayOf('1970-01-01')).toBe(4);
    expect(weekdayOf('2026-09-06')).toBe(0);
    expect(weekdayOf('2026-09-07')).toBe(1);
    expect(weekdayOf('2026-09-05')).toBe(6);
  });

  it('takes today when today is the day asked for', () => {
    // 2026-09-04 is a Friday.
    expect(nextWeekday('2026-09-04', 5)).toBe('2026-09-04');
    expect(nextWeekday('2026-09-04', 5, false)).toBe('2026-09-11');
    expect(nextWeekday('2026-09-04', 1)).toBe('2026-09-07');
    expect(nextWeekday('2026-09-04', 1, false)).toBe('2026-09-07');
    expect(nextWeekday('2026-09-04', 4)).toBe('2026-09-10');
  });
});

describe('times', () => {
  it('holds a time inside one day', () => {
    expect(clampMinutes(-30)).toBe(0);
    expect(clampMinutes(5000)).toBe(1439);
    expect(clampMinutes(Number.NaN)).toBe(0);
    expect(clampMinutes(90.4)).toBe(90);
  });

  it('reads and writes the value of a time input', () => {
    expect(toTimeValue(540)).toBe('09:00');
    expect(toTimeValue(0)).toBe('00:00');
    expect(toTimeValue(1439)).toBe('23:59');
    expect(fromTimeValue('09:30')).toBe(570);
    expect(fromTimeValue('9:05')).toBe(545);
    expect(fromTimeValue('23:59:00')).toBe(1439);
    expect(fromTimeValue('24:00')).toBeNull();
    expect(fromTimeValue('09:60')).toBeNull();
    expect(fromTimeValue('half nine')).toBeNull();
    expect(fromTimeValue('')).toBeNull();
  });

  it('follows the clock setting', () => {
    expect(plain(formatTimeOfDay(570, us))).toBe('9:30 AM');
    expect(plain(formatTimeOfDay(570, gb))).toBe('09:30');
    expect(plain(formatTimeOfDay(0, gb))).toBe('00:00');
  });
});

describe('civilNow', () => {
  // 2026-09-05T02:30:00Z: still 4 September in New York, already the 5th in UTC.
  const instant = Date.UTC(2026, 8, 5, 2, 30);

  it('reads the wall clock of the zone it is given', () => {
    expect(civilNow(instant, 'UTC')).toEqual({ date: '2026-09-05', minutes: 150 });
    expect(civilNow(instant, 'America/New_York')).toEqual({
      date: '2026-09-04',
      minutes: 22 * 60 + 30,
    });
    expect(civilNow(new Date(instant), 'Asia/Tokyo').date).toBe('2026-09-05');
  });

  it('falls back to the host clock for a zone it cannot use', () => {
    const host = civilNow(instant);
    expect(civilNow(instant, 'Mars/Olympus')).toEqual(host);
    expect(isDateKey(host.date)).toBe(true);
  });
});

describe('printing', () => {
  const today = '2026-09-05';

  it('names the days around today', () => {
    expect(relativeDayLabel(today, today)).toBe('Today');
    expect(relativeDayLabel('2026-09-06', today)).toBe('Tomorrow');
    expect(relativeDayLabel('2026-09-04', today)).toBe('Yesterday');
    expect(relativeDayLabel('2026-09-07', today)).toBeNull();
  });

  it('prints a plain day, with the year only when it differs', () => {
    expect(formatDay('2026-09-07', today, gb)).toMatch(/^7 Sep/);
    expect(formatDay('2027-01-02', today, gb)).toBe('2 Jan 2027');
    expect(formatDay('2026-09-07', today, us)).toBe('Sep 7');
    expect(formatDayHeading('2026-09-07', today, gb)).toMatch(/^Mon 7 Sep/);
    expect(formatDayHeading('2026-09-07', today, us)).toBe('Mon, Sep 7');
  });

  it('prefers the relative word in a row', () => {
    expect(formatDueDate('2026-09-05', today, gb)).toBe('Today');
    expect(formatDueDate('2026-09-09', today, us)).toBe('Sep 9');
    expect(plain(formatDue('2026-09-06', 540, today, gb))).toBe('Tomorrow 09:00');
    expect(formatDue('2026-09-06', null, today, gb)).toBe('Tomorrow');
  });

  it('calls a date behind today overdue', () => {
    expect(isOverdue('2026-09-04', today)).toBe(true);
    expect(isOverdue('2026-09-05', today)).toBe(false);
    expect(isOverdue('2026-09-06', today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });
});
