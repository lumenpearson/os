/**
 * Time zones, answered by `Intl` rather than by arithmetic on hours.
 *
 * Every offset here is computed by asking `Intl` what the wall clock reads in
 * a zone at an instant and subtracting the instant — which is the only way to
 * be right about India (+05:30), Eucla (+08:45), Chatham (+12:45/+13:45) and
 * every DST edge. Subtracting hours would be wrong for a twentieth of the
 * world, and wrong twice a year for most of the rest.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * Enough of the world to stay useful where `Intl.supportedValuesOf` is
 * missing: one zone per major offset, including the fractional ones.
 */
export const FALLBACK_ZONES: readonly string[] = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Tehran',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Eucla',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'UTC',
];

/** Every zone the runtime knows, or the built-in list where it cannot say. */
export function listTimeZones(): string[] {
  const source = Intl as { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    const zones = source.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return [...zones];
  } catch {
    // An older engine, or one built without the full zone database.
  }
  return [...FALLBACK_ZONES];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone === '') return false;
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone's wall clock at `at`, projected onto UTC. Not a real instant — a
 * number whose UTC fields are the digits a clock in that zone shows, which
 * makes offsets and calendar days plain subtractions.
 */
function wallClock(timeZone: string, at: number): number {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
}

/** Minutes east of UTC in `timeZone` at `at`; −480 for Los Angeles in winter. */
export function offsetMinutes(timeZone: string, at: number): number {
  return Math.round((wallClock(timeZone, at) - Math.floor(at / 1000) * 1000) / MINUTE);
}

/** How far ahead of `reference` the zone is, in minutes, at that instant. */
export function offsetDifference(timeZone: string, reference: string, at: number): number {
  return offsetMinutes(timeZone, at) - offsetMinutes(reference, at);
}

/** "3 h ahead", "5 h 30 min ahead", "45 min behind", "Same time". */
export function formatOffsetDifference(minutes: number): string {
  if (minutes === 0) return 'Same time';
  const direction = minutes > 0 ? 'ahead' : 'behind';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (rest > 0) parts.push(`${rest} min`);
  return `${parts.join(' ')} ${direction}`;
}

/** The zone's calendar day as a day count, for comparing two zones or spotting midnight. */
export function dayNumber(timeZone: string, at: number): number {
  return Math.floor(wallClock(timeZone, at) / DAY);
}

/** −1, 0 or 1 (rarely 2): the zone's calendar day against the reference's. */
export function dayDifference(timeZone: string, reference: string, at: number): number {
  return dayNumber(timeZone, at) - dayNumber(reference, at);
}

/** "Today", "Tomorrow", "Yesterday" — and the two-day cases the date line can reach. */
export function dayLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `${days} days ahead` : `${-days} days behind`;
}

/** "Asia/Kolkata" → "Kolkata"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneLabel(timeZone: string): string {
  const last = timeZone.split('/').at(-1) ?? timeZone;
  return last.replace(/_/g, ' ');
}

/** What comes before the city: "Asia", "America / Argentina", or nothing. */
export function zoneRegion(timeZone: string): string {
  const parts = timeZone.split('/');
  if (parts.length < 2) return '';
  return parts.slice(0, -1).join(' / ').replace(/_/g, ' ');
}

/** "+05:30", "−08:00", "+00:00" — the offset as a signed clock reading. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const total = Math.abs(minutes);
  const hours = String(Math.floor(total / 60)).padStart(2, '0');
  const rest = String(total % 60).padStart(2, '0');
  return `${sign}${hours}:${rest}`;
}

export interface ClockFormat {
  locale: string;
  hour12: boolean;
  seconds?: boolean;
}

export interface ClockParts {
  /** The digits: "14:35:09" or "2:35:09". */
  time: string;
  /** The day period on a 12-hour clock, "" on a 24-hour one. */
  suffix: string;
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** Formatters are cached: the readout asks for one on every animation frame. */
function clockFormatter(timeZone: string, format: ClockFormat): Intl.DateTimeFormat {
  const key = `${timeZone}|${format.locale}|${format.hour12}|${format.seconds ?? false}`;
  let formatter = clocks.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(format.locale, {
      timeZone,
      // Naming hour12 at all makes the engine ignore hourCycle, and its own
      // 12-hour cycle reads midnight as "0:30" in some locales.
      hour12: format.hour12 ? undefined : false,
      hourCycle: format.hour12 ? 'h12' : 'h23',
      // A 24-hour clock keeps both digits; a 12-hour one never shows "02:35 PM".
      hour: format.hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      second: format.seconds ? '2-digit' : undefined,
    });
    clocks.set(key, formatter);
  }
  return formatter;
}

/**
 * A clock reading split from its day period, so the readout can set the digits
 * large and keep "PM" out of their way.
 */
export function clockParts(timeZone: string, at: number, format: ClockFormat): ClockParts {
  const parts = clockFormatter(timeZone, format).formatToParts(at);
  let time = '';
  let suffix = '';
  for (const part of parts) {
    if (part.type === 'dayPeriod') suffix = part.value;
    else if (part.type !== 'literal' || time !== '') time += part.value;
  }
  return { time: time.trim(), suffix: suffix.trim() };
}

/** The whole reading on one line, for a row that has no room to split it. */
export function formatZoneTime(timeZone: string, at: number, format: ClockFormat): string {
  const { time, suffix } = clockParts(timeZone, at, format);
  return suffix ? `${time} ${suffix}` : time;
}

/** The hands of an analogue face, in degrees clockwise from twelve. */
export interface HandAngles {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Hand angles from the instant itself, sub-second included, so the second hand
 * is a reading of the clock on every frame rather than an animation that has
 * to be kept in step with one.
 */
export function handAngles(timeZone: string, at: number): HandAngles {
  const wall = wallClock(timeZone, at);
  const subSecond = ((at % 1000) + 1000) % 1000;
  const msIntoDay = (((wall % DAY) + DAY) % DAY) + subSecond;
  const seconds = (msIntoDay % 60_000) / 1000;
  const minutes = (msIntoDay % 3_600_000) / 60_000;
  const hours = (msIntoDay % 43_200_000) / 3_600_000;
  return { hours: hours * 30, minutes: minutes * 6, seconds: seconds * 6 };
}

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const searchable = (timeZone: string) => fold(timeZone.replace(/[/_]/g, ' '));

/**
 * Zones matching a query, city first: a zone whose city starts with what was
 * typed comes before one that merely contains it, and both come before a match
 * on the region alone.
 */
export function searchZones(zones: readonly string[], query: string, limit = 50): string[] {
  const needle = fold(query.trim().replace(/[/_]/g, ' '));
  if (needle === '') return zones.slice(0, limit);
  const ranked: Array<{ zone: string; rank: number }> = [];
  for (const zone of zones) {
    const city = fold(zoneLabel(zone));
    const whole = searchable(zone);
    const rank = city === needle ? 0 : city.startsWith(needle) ? 1 : city.includes(needle) ? 2 : 3;
    if (rank < 3 || whole.includes(needle)) ranked.push({ zone, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.zone.localeCompare(b.zone))
    .slice(0, limit)
    .map((entry) => entry.zone);
}
