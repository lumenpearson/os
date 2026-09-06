import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  civilNow,
  clampMinutes,
  compareKeys,
  daysInMonth,
  diffDays,
  endOfMonth,
  endOfWeek,
  epochDayOf,
  fromEpochDay,
  fromTimeValue,
  isDateKey,
  isLeapYear,
  isWithin,
  keyFromEpochDay,
  MONTH_GRID_DAYS,
  monthGrid,
  parseKey,
  sameMonth,
  startOfMonth,
  startOfWeek,
  toEpochDay,
  toKey,
  toTimeValue,
  weekDays,
  weekdayOf,
  weekdayOrder,
  weekNumber,
} from './dates';

describe('keys', () => {
  it('round-trips a civil date', () => {
    expect(toKey({ year: 2026, month: 9, day: 4 })).toBe('2026-09-04');
    expect(parseKey('2026-09-04')).toEqual({ year: 2026, month: 9, day: 4 });
  });

  it('rejects dates that do not exist', () => {
    expect(parseKey('2026-02-30')).toBeNull();
    expect(parseKey('2026-13-01')).toBeNull();
    expect(parseKey('2026-00-10')).toBeNull();
    expect(parseKey('2026-9-4')).toBeNull();
    expect(parseKey('not a date')).toBeNull();
    expect(isDateKey('2025-02-29')).toBe(false);
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey(20260904)).toBe(false);
  });

  it('knows the length of a month', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(isLeapYear(2100)).toBe(false);
  });
});

describe('epoch days', () => {
  it('anchors on the Unix epoch', () => {
    expect(toEpochDay({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(fromEpochDay(0)).toEqual({ year: 1970, month: 1, day: 1 });
  });

  it('round-trips over four centuries', () => {
    for (let day = -20_000; day < 30_000; day += 137) {
      expect(toEpochDay(fromEpochDay(day))).toBe(day);
    }
  });

  it('handles dates before the epoch', () => {
    expect(keyFromEpochDay(-1)).toBe('1969-12-31');
    expect(epochDayOf('1900-01-01')).toBe(-25_567);
  });

  it('reads a malformed key as the epoch rather than NaN', () => {
    expect(epochDayOf('nonsense')).toBe(0);
  });
});

describe('day arithmetic across a daylight-saving boundary', () => {
  // New York moves the clock forward on 8 March 2026 and back on 1 November.
  // None of this arithmetic involves a clock, so both days are ordinary days.
  it('steps one day at a time through the spring change', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('steps one day at a time through the autumn change', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('keeps a week seven days long over both changes', () => {
    expect(addDays('2026-03-05', 7)).toBe('2026-03-12');
    expect(addDays('2026-10-29', 7)).toBe('2026-11-05');
    expect(diffDays('2026-03-01', '2026-11-30')).toBe(274);
  });

  it('adds months and years without drifting', () => {
    expect(addMonths('2026-03-08', 1)).toBe('2026-04-08');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 13)).toBe('2027-02-28');
    expect(addMonths('2026-03-08', -3)).toBe('2025-12-08');
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
  });
});

describe('weeks', () => {
  it('numbers weekdays from Sunday', () => {
    expect(weekdayOf('2026-03-08')).toBe(0);
    expect(weekdayOf('2026-09-04')).toBe(5);
  });

  it('starts the week where the region says', () => {
    expect(startOfWeek('2026-09-04', 1)).toBe('2026-08-31');
    expect(startOfWeek('2026-09-04', 0)).toBe('2026-08-30');
    expect(endOfWeek('2026-09-04', 1)).toBe('2026-09-06');
    expect(endOfWeek('2026-09-04', 0)).toBe('2026-09-05');
    expect(startOfWeek('2026-08-30', 0)).toBe('2026-08-30');
  });

  it('lists a week in display order', () => {
    expect(weekDays('2026-09-04', 1)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('numbers weeks the ISO way for a Monday-first region', () => {
    expect(weekNumber('2026-01-01', 1)).toBe(1);
    expect(weekNumber('2026-09-04', 1)).toBe(36);
    expect(weekNumber('2026-12-31', 1)).toBe(53);
    expect(weekNumber('2025-12-29', 1)).toBe(1);
    expect(weekNumber('2016-01-01', 1)).toBe(53);
  });

  it('numbers weeks the US way for a Sunday-first region', () => {
    expect(weekNumber('2026-01-01', 0)).toBe(1);
    expect(weekNumber('2026-09-04', 0)).toBe(36);
    // The week of 27 December 2026 reaches into 2027, so it is that year's first.
    expect(weekNumber('2026-12-31', 0)).toBe(1);
    expect(weekNumber('2027-01-01', 0)).toBe(1);
  });
});

describe('months', () => {
  it('finds the ends of a month', () => {
    expect(startOfMonth('2026-09-04')).toBe('2026-09-01');
    expect(endOfMonth('2026-09-04')).toBe('2026-09-30');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(sameMonth('2026-09-01', '2026-09-30')).toBe(true);
    expect(sameMonth('2026-09-30', '2026-10-01')).toBe(false);
  });

  it('builds six rows starting on the first weekday of the region', () => {
    const monday = monthGrid('2026-09-15', 1);
    expect(monday).toHaveLength(MONTH_GRID_DAYS);
    expect(monday[0]).toBe('2026-08-31');
    expect(monday[MONTH_GRID_DAYS - 1]).toBe('2026-10-11');

    const sunday = monthGrid('2026-09-15', 0);
    expect(sunday[0]).toBe('2026-08-30');
    expect(sunday[MONTH_GRID_DAYS - 1]).toBe('2026-10-10');
  });

  it('covers the whole month even when it starts on the first weekday', () => {
    const grid = monthGrid('2026-02-10', 0);
    expect(grid[0]).toBe('2026-02-01');
    expect(grid).toContain('2026-02-28');
  });
});

describe('comparison', () => {
  it('orders and bounds keys', () => {
    expect(compareKeys('2026-09-04', '2026-09-05')).toBeLessThan(0);
    expect(compareKeys('2026-09-04', '2026-09-04')).toBe(0);
    expect(isWithin('2026-09-04', '2026-09-01', '2026-09-30')).toBe(true);
    expect(isWithin('2026-08-31', '2026-09-01', '2026-09-30')).toBe(false);
  });
});

describe('civilNow', () => {
  it('reads the wall clock of the given zone', () => {
    const instant = Date.UTC(2026, 8, 4, 16, 0);
    expect(civilNow(instant, 'UTC')).toEqual({ date: '2026-09-04', minutes: 16 * 60 });
    expect(civilNow(instant, 'Asia/Tokyo')).toEqual({ date: '2026-09-05', minutes: 60 });
  });

  it('follows the clock through a daylight-saving change', () => {
    const before = civilNow(Date.UTC(2026, 2, 8, 6, 30), 'America/New_York');
    const after = civilNow(Date.UTC(2026, 2, 8, 7, 30), 'America/New_York');
    expect(before).toEqual({ date: '2026-03-08', minutes: 90 });
    // The clock jumped from 02:00 to 03:00, so an hour of UTC moved two hours.
    expect(after).toEqual({ date: '2026-03-08', minutes: 210 });
  });

  it('reads midnight as zero minutes, not 24 hours', () => {
    expect(civilNow(Date.UTC(2026, 8, 4, 0, 0), 'UTC').minutes).toBe(0);
  });

  it('falls back to the host clock when the zone is unknown', () => {
    const date = new Date(2026, 8, 4, 8, 15);
    expect(civilNow(date, 'Mars/Olympus')).toEqual({ date: '2026-09-04', minutes: 495 });
  });
});

describe('times of day', () => {
  it('round-trips the value of a time input', () => {
    expect(toTimeValue(0)).toBe('00:00');
    expect(toTimeValue(570)).toBe('09:30');
    expect(toTimeValue(1439)).toBe('23:59');
    expect(fromTimeValue('09:30')).toBe(570);
    expect(fromTimeValue('9:05')).toBe(545);
    expect(fromTimeValue('23:59:00')).toBe(1439);
  });

  it('rejects a time that is not one', () => {
    expect(fromTimeValue('')).toBeNull();
    expect(fromTimeValue('24:00')).toBeNull();
    expect(fromTimeValue('10:60')).toBeNull();
  });

  it('clamps minutes into the day', () => {
    expect(clampMinutes(-30)).toBe(0);
    expect(clampMinutes(2000)).toBe(1440);
    expect(clampMinutes(Number.NaN)).toBe(0);
    expect(clampMinutes(2000, 2880)).toBe(2000);
  });
});
