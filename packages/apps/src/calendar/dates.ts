/**
 * Calendar arithmetic on civil dates.
 *
 * A day here is the triple (year, month, day) written `YYYY-MM-DD`; a time of
 * day is minutes since midnight. No arithmetic in this file goes through the
 * `Date` object, so a day is always a day: adding one to the date a clock
 * jumps forward returns the next date, and an event at 09:00 keeps its 09:00.
 * The single place an instant turns into a date is `civilNow`, which asks Intl
 * for the wall clock in the user's time zone.
 */

/** A civil date written `YYYY-MM-DD`. */
export type DateKey = string;

export interface CivilDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

/** Sunday = 0 … Saturday = 6, matching `settings.region.firstDayOfWeek`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type FirstDay = 0 | 1;

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;
/** A month grid is always six rows, so the view does not change height. */
export const MONTH_GRID_WEEKS = 6;
export const MONTH_GRID_DAYS = MONTH_GRID_WEEKS * DAYS_PER_WEEK;

const KEY_PATTERN = /^(-?\d{4,6})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days in a month, 1-indexed; February follows the leap rule. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] ?? 30;
}

function pad(value: number, width: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(value)).padStart(width, '0');
}

export function toKey(date: CivilDate): DateKey {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Parse `YYYY-MM-DD`, rejecting impossible dates such as 2026-02-30. */
export function parseKey(key: string): CivilDate | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === 'string' && parseKey(value) !== null;
}

/**
 * Days since 1970-01-01, by Howard Hinnant's civil-calendar algorithm. Integer
 * arithmetic only: no time zone, no clock, nothing to shift under it.
 */
export function toEpochDay(date: CivilDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (date.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

export function fromEpochDay(days: number): CivilDate {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** The epoch day of a key. A malformed key reads as the epoch itself. */
export function epochDayOf(key: DateKey): number {
  const civil = parseKey(key);
  return civil ? toEpochDay(civil) : 0;
}

export function keyFromEpochDay(days: number): DateKey {
  return toKey(fromEpochDay(days));
}

export function addDays(key: DateKey, days: number): DateKey {
  return keyFromEpochDay(epochDayOf(key) + Math.trunc(days));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function diffDays(from: DateKey, to: DateKey): number {
  return epochDayOf(to) - epochDayOf(from);
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return epochDayOf(a) - epochDayOf(b);
}

/** True when `key` lies in [from, to], both inclusive. */
export function isWithin(key: DateKey, from: DateKey, to: DateKey): boolean {
  const day = epochDayOf(key);
  return day >= epochDayOf(from) && day <= epochDayOf(to);
}

/** Sunday = 0. 1970-01-01 was a Thursday, so the epoch day offsets by 4. */
export function weekdayOf(key: DateKey): Weekday {
  const index = (((epochDayOf(key) + 4) % 7) + 7) % 7;
  return index as Weekday;
}

export function startOfWeek(key: DateKey, firstDay: FirstDay): DateKey {
  const back = (((weekdayOf(key) - firstDay) % 7) + 7) % 7;
  return addDays(key, -back);
}

export function endOfWeek(key: DateKey, firstDay: FirstDay): DateKey {
  return addDays(startOfWeek(key, firstDay), 6);
}

/** The seven days of `key`'s week, in display order. */
export function weekDays(key: DateKey, firstDay: FirstDay): DateKey[] {
  const start = startOfWeek(key, firstDay);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(start, i));
}

/** The weekday numbers of a week in display order, e.g. [1,2,3,4,5,6,0]. */
export function weekdayOrder(firstDay: FirstDay): Weekday[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => ((firstDay + i) % 7) as Weekday);
}

export function startOfMonth(key: DateKey): DateKey {
  const civil = parseKey(key);
  if (!civil) return key;
  return toKey({ ...civil, day: 1 });
}

export function endOfMonth(key: DateKey): DateKey {
  const civil = parseKey(key);
  if (!civil) return key;
  return toKey({ ...civil, day: daysInMonth(civil.year, civil.month) });
}

/**
 * Move whole months, clamping the day to the shorter month: 31 January plus
 * one month is 28 February. Used for stepping the view, never for recurrence,
 * which skips short months instead.
 */
export function addMonths(key: DateKey, months: number): DateKey {
  const civil = parseKey(key);
  if (!civil) return key;
  const index = civil.year * 12 + (civil.month - 1) + Math.trunc(months);
  const year = Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  return toKey({ year, month, day: Math.min(civil.day, daysInMonth(year, month)) });
}

export function addYears(key: DateKey, years: number): DateKey {
  return addMonths(key, Math.trunc(years) * 12);
}

export function sameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** The 42 days of a month view: six rows starting on the user's first weekday. */
export function monthGrid(key: DateKey, firstDay: FirstDay): DateKey[] {
  const start = startOfWeek(startOfMonth(key), firstDay);
  return Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDays(start, i));
}

/**
 * The week number for the user's numbering scheme, which follows their first
 * day of the week: Monday-first weeks are numbered ISO 8601 (the week holding
 * the first Thursday is week 1); Sunday-first weeks use the US scheme (the
 * week holding 1 January is week 1), where a week can be split between years.
 */
export function weekNumber(key: DateKey, firstDay: FirstDay): number {
  const day = epochDayOf(key);
  if (firstDay === 1) {
    const mondayIndex = (((weekdayOf(key) + 6) % 7) + 7) % 7;
    const thursday = day - mondayIndex + 3;
    const year = fromEpochDay(thursday).year;
    const jan1 = toEpochDay({ year, month: 1, day: 1 });
    return Math.floor((thursday - jan1) / 7) + 1;
  }
  const civil = fromEpochDay(day);
  const weekStart = day - weekdayOf(key);
  // A week that reaches into January belongs to the new year.
  const nextJan1 = toEpochDay({ year: civil.year + 1, month: 1, day: 1 });
  if (weekStart + 6 >= nextJan1) return 1;
  const jan1 = toEpochDay({ year: civil.year, month: 1, day: 1 });
  const firstWeekStart = jan1 - ((((jan1 + 4) % 7) + 7) % 7);
  return Math.floor((weekStart - firstWeekStart) / 7) + 1;
}

export interface CivilNow {
  date: DateKey;
  /** Minutes since midnight in that time zone. */
  minutes: number;
}

const NOW_PARTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

/**
 * The wall clock in `timeZone` at `instant`. This is the only bridge from an
 * instant to a civil date; everything else stays in civil arithmetic. An
 * unknown zone falls back to the host's own clock rather than guessing.
 */
export function civilNow(instant: Date | number, timeZone?: string): CivilNow {
  const date = typeof instant === 'number' ? new Date(instant) : instant;
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { ...NOW_PARTS, timeZone }).formatToParts(
        date,
      );
      const read = (type: Intl.DateTimeFormatPartTypes): number => {
        const part = parts.find((p) => p.type === type);
        return part ? Number(part.value) : Number.NaN;
      };
      const year = read('year');
      const month = read('month');
      const day = read('day');
      const hour = read('hour');
      const minute = read('minute');
      if ([year, month, day, hour, minute].every((n) => Number.isFinite(n))) {
        return {
          date: toKey({ year, month, day }),
          minutes: (hour % 24) * 60 + minute,
        };
      }
    } catch {
      // An invalid zone in settings should not take the calendar down.
    }
  }
  return {
    date: toKey({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    }),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

export function clampMinutes(value: number, max = MINUTES_PER_DAY): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/** `540` → `"09:00"`, the value an `<input type="time">` carries. */
export function toTimeValue(minutes: number): string {
  const total = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(total / 60), 2)}:${pad(total % 60, 2)}`;
}

/** `"09:30"` → `570`; anything else → null. */
export function fromTimeValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
