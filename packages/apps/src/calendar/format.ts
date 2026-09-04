/**
 * Every string a date or a time turns into, through `Intl` with the user's
 * locale and clock preference.
 *
 * Civil values are handed to `Intl` as UTC instants at midday and formatted in
 * UTC, so the names and numbers printed are the ones in the date itself — no
 * host time zone can shift 1 September into 31 August on the way out.
 */
import {
  type DateKey,
  type FirstDay,
  MINUTES_PER_DAY,
  parseKey,
  weekdayOrder,
  weekNumber,
} from './dates';

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
function instant(key: DateKey): Date {
  const civil = parseKey(key) ?? { year: 1970, month: 1, day: 1 };
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 12));
}

function clockInstant(minutes: number): Date {
  const total = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return new Date(Date.UTC(1970, 0, 1, Math.floor(total / 60), total % 60));
}

/** "9:00 AM" or "09:00", by the user's clock setting. */
export function formatTimeOfDay(minutes: number, o: FormatOptions): string {
  const options: Intl.DateTimeFormatOptions = o.hour12
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return formatter(o.locale, options).format(clockInstant(minutes));
}

/** The gutter label for an hour line: "9 AM" or "09". */
export function formatHourLabel(hour: number, o: FormatOptions): string {
  if (!o.hour12) return String(hour).padStart(2, '0');
  return formatter(o.locale, { hour: 'numeric', hour12: true }).format(clockInstant(hour * 60));
}

/** "9:00 – 10:30", or the single start when the event has no length to show. */
export function formatTimeRange(start: number, end: number, o: FormatOptions): string {
  return `${formatTimeOfDay(start, o)} – ${formatTimeOfDay(end, o)}`;
}

export function formatMonthYear(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { month: 'long', year: 'numeric' }).format(instant(key));
}

export function formatMonthShort(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { month: 'short' }).format(instant(key));
}

/** "Friday, 4 September 2026" — the day view's title. */
export function formatFullDate(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant(key));
}

/** "4 Sep 2026" — agenda headers and rule summaries. */
export function formatMediumDate(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    instant(key),
  );
}

/** "Fri 4 Sep" — column headers and search results. */
export function formatDayHeading(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    instant(key),
  );
}

export function formatWeekdayLong(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { weekday: 'long' }).format(instant(key));
}

export function formatDayNumber(key: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { day: 'numeric' }).format(instant(key));
}

/** A span of days: "1 – 7 Sep 2026", "28 Sep – 4 Oct 2026". */
export function formatDateRange(from: DateKey, to: DateKey, o: FormatOptions): string {
  return formatter(o.locale, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
    instant(from),
    instant(to),
  );
}

/** Weekday names in the user's own week order, for the grid headers. */
export function weekdayHeaders(
  firstDay: FirstDay,
  o: FormatOptions,
  width: 'short' | 'narrow' = 'short',
): string[] {
  const format = formatter(o.locale, { weekday: width });
  // 1970-01-04 was a Sunday, so weekday n is that date plus n.
  return weekdayOrder(firstDay).map((day) =>
    format.format(new Date(Date.UTC(1970, 0, 4 + day, 12))),
  );
}

/** "W36" — the week number as the sidebar and the week view print it. */
export function formatWeekNumber(key: DateKey, firstDay: FirstDay): string {
  return `W${weekNumber(key, firstDay)}`;
}
