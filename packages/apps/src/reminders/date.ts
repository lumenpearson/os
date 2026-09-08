/**
 * Civil dates and the strings they turn into.
 *
 * A due date here is the triple (year, month, day) written `YYYY-MM-DD`, and a
 * due time is minutes since midnight. Nothing in this file does arithmetic
 * through the `Date` object, so a day is always a day: "in 3 days" from the
 * date a clock jumps forward is still three dates later, and a reminder due at
 * 09:00 keeps its 09:00. The one bridge from an instant to a date is
 * `civilNow`, which asks Intl for the wall clock in the user's time zone.
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

/** Sunday = 0 … Saturday = 6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MINUTES_PER_DAY = 1440;

const KEY_PATTERN = /^(-?\d{4,6})-(\d{2})-(\d{2})$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

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
 * Days since 1970-01-01, by Howard Hinnant's civil-calendar algorithm.
 * Integer arithmetic only: no time zone, nothing to shift under it.
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

/**
 * Move whole months, clamping the day to the shorter month: 31 January plus
 * one month is 28 February.
 */
export function addMonths(key: DateKey, months: number): DateKey {
  const civil = parseKey(key);
  if (!civil) return key;
  const index = civil.year * 12 + (civil.month - 1) + Math.trunc(months);
  const year = Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  return toKey({ year, month, day: Math.min(civil.day, daysInMonth(year, month)) });
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function diffDays(from: DateKey, to: DateKey): number {
  return epochDayOf(to) - epochDayOf(from);
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return epochDayOf(a) - epochDayOf(b);
}

/** Sunday = 0. 1970-01-01 was a Thursday, so the epoch day offsets by 4. */
export function weekdayOf(key: DateKey): Weekday {
  return ((((epochDayOf(key) + 4) % 7) + 7) % 7) as Weekday;
}

/**
 * The next date falling on `weekday`. Inclusive by default, so asking for
 * Friday on a Friday returns that same Friday; `inclusive: false` always
 * moves at least one day forward.
 */
export function nextWeekday(from: DateKey, weekday: Weekday, inclusive = true): DateKey {
  const ahead = (((weekday - weekdayOf(from)) % 7) + 7) % 7;
  if (ahead === 0) return inclusive ? from : addDays(from, 7);
  return addDays(from, ahead);
}

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(value)));
}

/** `540` → `"09:00"`, the value an `<input type="time">` carries. */
export function toTimeValue(minutes: number): string {
  const total = clampMinutes(minutes);
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
 * The wall clock in `timeZone` at `instant`. An unknown zone falls back to the
 * host's own clock rather than guessing.
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
        return { date: toKey({ year, month, day }), minutes: (hour % 24) * 60 + minute };
      }
    } catch {
      // A broken zone in settings should not take the window down.
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

// ── printing ──────────────────────────────────────────────────────────────

export interface FormatOptions {
  locale: string;
  /** From `settings.menubar.clock24h`, inverted. */
  hour12: boolean;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const found = cache.get(key);
  if (found) return found;
  const made = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  cache.set(key, made);
  return made;
}

/** Midday UTC on that civil date: far from any boundary Intl could round. */
function instantOf(key: DateKey): Date {
  const civil = parseKey(key) ?? { year: 1970, month: 1, day: 1 };
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 12));
}

function clockInstant(minutes: number): Date {
  const total = clampMinutes(minutes);
  return new Date(Date.UTC(1970, 0, 1, Math.floor(total / 60), total % 60));
}

/** "9:00 AM" or "09:00", by the user's clock setting. */
export function formatTimeOfDay(minutes: number, o: FormatOptions): string {
  const options: Intl.DateTimeFormatOptions = o.hour12
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return formatter(o.locale, options).format(clockInstant(minutes));
}

/** "5 Sep", or "5 Sep 2027" when the year is not the one `today` is in. */
export function formatDay(key: DateKey, today: DateKey, o: FormatOptions): string {
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatter(
    o.locale,
    sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(instantOf(key));
}

/** "Sat 5 Sep" — the long form a section header takes. */
export function formatDayHeading(key: DateKey, today: DateKey, o: FormatOptions): string {
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatter(o.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(instantOf(key));
}

/** "Today", "Tomorrow", "Yesterday" — or null for any other day. */
export function relativeDayLabel(key: DateKey, today: DateKey): string | null {
  switch (diffDays(today, key)) {
    case 0:
      return 'Today';
    case 1:
      return 'Tomorrow';
    case -1:
      return 'Yesterday';
    default:
      return null;
  }
}

/** What a row prints for a due date: the relative word when there is one. */
export function formatDueDate(key: DateKey, today: DateKey, o: FormatOptions): string {
  return relativeDayLabel(key, today) ?? formatDay(key, today, o);
}

/** A due date with its time, when it has one: "Tomorrow 09:00". */
export function formatDue(
  key: DateKey,
  minutes: number | null,
  today: DateKey,
  o: FormatOptions,
): string {
  const day = formatDueDate(key, today, o);
  return minutes === null ? day : `${day} ${formatTimeOfDay(minutes, o)}`;
}

/** A due date is overdue once its day is behind today. */
export function isOverdue(key: DateKey | null, today: DateKey): boolean {
  return key !== null && compareKeys(key, today) < 0;
}
