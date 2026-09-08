/**
 * Epoch timestamps to and from ISO 8601 and a readable form, in UTC or in a
 * named IANA zone.
 *
 * A zone offset is not a constant, so it is asked for at an instant: format
 * the instant in the zone, read the wall clock back, and the difference is the
 * offset then. Turning a wall clock into an instant is that in reverse, and
 * needs a second pass because the first guess uses the offset of the wrong
 * side of a daylight-saving change.
 */

export const UTC = 'UTC';

export type EpochUnit = 'auto' | 'seconds' | 'milliseconds';

export const EPOCH_UNITS: readonly EpochUnit[] = ['auto', 'seconds', 'milliseconds'];

export const EPOCH_UNIT_LABEL: Record<EpochUnit, string> = {
  auto: 'Detect',
  seconds: 'Seconds',
  milliseconds: 'Milliseconds',
};

/**
 * Above this a bare number is read as milliseconds. It is 1973 in
 * milliseconds and the year 5138 in seconds: any timestamp a developer is
 * likely to paste falls on the right side of it.
 */
export const MS_THRESHOLD = 1e11;

/** Instants outside this range are not times anyone means. */
const MAX_MS = 8.64e15;

export function isValidZone(zone: string): boolean {
  if (zone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the platform knows, for the picker. Falls back to UTC alone. */
export function listZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supported !== 'function') return [UTC];
  try {
    const zones = supported('timeZone');
    return zones.includes(UTC) ? zones : [UTC, ...zones];
  } catch {
    return [UTC];
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = (zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * A UTC instant from wall-clock parts. `Date.UTC` reads a two-digit year as
 * 19xx; this does not, so a year like 0099 stays where it was written.
 */
function utcFromParts(wall: WallClock & { millisecond?: number }): number {
  const date = new Date(0);
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond ?? 0);
  return date.getTime();
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Whether a year-month-day names a day that exists. */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = month === 2 && isLeapYear(year) ? 29 : (MONTH_DAYS[month - 1] as number);
  return day <= days;
}

/** The wall clock in `zone` at `ms`. */
export function wallClockAt(ms: number, zone: string): WallClock {
  const parts = partsFormatter(zone).formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** The zone's offset from UTC at `ms`, in minutes east. */
export function zoneOffsetMinutes(ms: number, zone: string): number {
  const asUtc = utcFromParts(wallClockAt(ms, zone));
  // The formatter drops sub-second precision; compare on whole seconds.
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** `+01:00`, or `Z` for UTC itself. */
export function formatOffset(minutes: number, zone: string): string {
  if (zone === UTC) return 'Z';
  const sign = minutes < 0 ? '-' : '+';
  const total = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** The instant a wall clock in `zone` names. */
export function instantFromWallClock(
  wall: WallClock & { millisecond?: number },
  zone: string,
): number {
  const naive = utcFromParts(wall);
  const guess = naive - zoneOffsetMinutes(naive, zone) * 60000;
  return naive - zoneOffsetMinutes(guess, zone) * 60000;
}

// ── formatting ────────────────────────────────────────────────────────────

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

/** ISO 8601 with the zone's offset, milliseconds only when there are any. */
export function formatIso(ms: number, zone: string): string {
  const wall = wallClockAt(ms, zone);
  const fraction = ((ms % 1000) + 1000) % 1000;
  const time = `${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
  const millis = fraction === 0 ? '' : `.${pad(fraction, 3)}`;
  const date = `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`;
  return `${date}T${time}${millis}${formatOffset(zoneOffsetMinutes(ms, zone), zone)}`;
}

/** A readable form: the date, the time and the zone's short name. */
export function formatHuman(ms: number, zone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date(ms));
}

/** How long ago, in the largest unit that reads as a whole number. */
export function formatSince(ms: number, now: number, locale = 'en-US'): string {
  const seconds = Math.round((ms - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return relative.format(0, 'second');
}

// ── parsing ───────────────────────────────────────────────────────────────

export type TimeSource = 'seconds' | 'milliseconds' | 'iso';

export type TimeParse = { ok: true; ms: number; source: TimeSource } | { ok: false; error: string };

const NOT_A_TIME =
  'Not a time. Enter epoch seconds or milliseconds, or a date like 2024-03-01T12:30:00.';

/**
 * `2024-03-01`, `2024-03-01T12:30`, `2024-03-01 12:30:45.500`, with an
 * optional `Z` or `±HH:MM`. Without an offset the text is read in `zone`.
 */
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

function parseIso(text: string, zone: string): TimeParse {
  const match = ISO.exec(text);
  if (!match) return { ok: false, error: NOT_A_TIME };
  const [, y, mo, d, h, mi, s, frac, offset] = match;
  const wall = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h ?? '0'),
    minute: Number(mi ?? '0'),
    second: Number(s ?? '0'),
    millisecond: Number((frac ?? '').padEnd(3, '0') || '0'),
  };
  if (!isRealDate(wall.year, wall.month, wall.day))
    return { ok: false, error: `${y}-${mo}-${d} is not a date` };
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59)
    return { ok: false, error: 'That clock time does not exist' };

  let ms: number;
  if (offset === undefined) {
    ms = instantFromWallClock(wall, zone);
  } else if (offset.toUpperCase() === 'Z') {
    ms = utcFromParts(wall);
  } else {
    const sign = offset.startsWith('-') ? -1 : 1;
    const digits = offset.slice(1).replace(':', '');
    const minutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
    ms = utcFromParts(wall) - minutes * 60000;
  }
  if (!Number.isFinite(ms)) return { ok: false, error: NOT_A_TIME };
  return { ok: true, ms, source: 'iso' };
}

/** Read whatever was typed: an epoch number in the chosen unit, or a date. */
export function parseTimeInput(text: string, unit: EpochUnit, zone: string): TimeParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Nothing to convert' };
  if (!isValidZone(zone)) return { ok: false, error: `'${zone}' is not a time zone this knows` };

  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { ok: false, error: NOT_A_TIME };
    const inMilliseconds =
      unit === 'milliseconds' || (unit === 'auto' && Math.abs(n) >= MS_THRESHOLD);
    const asMs = inMilliseconds ? n : n * 1000;
    if (Math.abs(asMs) > MAX_MS)
      return { ok: false, error: 'That is further from 1970 than a date can reach' };
    return {
      ok: true,
      ms: Math.round(asMs),
      source: inMilliseconds ? 'milliseconds' : 'seconds',
    };
  }

  const iso = parseIso(trimmed, zone);
  if (!iso.ok) return iso;
  if (Math.abs(iso.ms) > MAX_MS)
    return { ok: false, error: 'That is further from 1970 than a date can reach' };
  return iso;
}

export interface TimeView {
  epochSeconds: string;
  epochMilliseconds: string;
  iso: string;
  isoUtc: string;
  human: string;
  offset: string;
}

/** Everything the panel shows for one instant. */
export function describeInstant(ms: number, zone: string, locale = 'en-US'): TimeView {
  return {
    epochSeconds: String(Math.floor(ms / 1000)),
    epochMilliseconds: String(ms),
    iso: formatIso(ms, zone),
    isoUtc: formatIso(ms, UTC),
    human: formatHuman(ms, zone, locale),
    offset: formatOffset(zoneOffsetMinutes(ms, zone), zone),
  };
}
