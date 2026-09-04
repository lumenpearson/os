/**
 * Durations as digits and back.
 *
 * Two readings, two precisions: the stopwatch counts up and is truncated to
 * its 10 ms display step (it must never show a time it has not reached), the
 * countdown is rounded up to the second (5:00 shows the instant it starts, and
 * 0:00 only when it is actually over). Everything here is a pure function of a
 * number of milliseconds — nothing in this file reads a clock.
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

/** The step the stopwatch reading is quantised to. */
export const TICK = 10;

/** The longest countdown the fields accept: 99:59:59. */
export const MAX_DURATION = 99 * HOUR + 59 * MINUTE + 59 * SECOND;

export interface DurationFields {
  hours: number;
  minutes: number;
  seconds: number;
}

export type FieldName = keyof DurationFields;

/** Upper bound of each typed field. Hours carry the whole range. */
export const FIELD_MAX: Record<FieldName, number> = { hours: 99, minutes: 59, seconds: 59 };

export const FIELD_ORDER: readonly FieldName[] = ['hours', 'minutes', 'seconds'];

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** Whole milliseconds inside `0 … max`; anything unusable becomes 0. */
export function clampDuration(ms: number, max = MAX_DURATION): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(max, Math.max(0, Math.round(ms)));
}

/** Quantise to a display step, e.g. `roundTo(1234, 10) === 1230`. */
export function roundTo(ms: number, step: number, mode: 'down' | 'up' = 'down'): number {
  if (!Number.isFinite(ms) || step <= 0) return 0;
  const fn = mode === 'up' ? Math.ceil : Math.floor;
  return fn(ms / step) * step;
}

/** `h:mm:ss.cc` — the stopwatch reading. Hours appear only once they exist. */
export function formatStopwatch(ms: number): string {
  const total = roundTo(Math.max(0, ms), TICK);
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);
  const hundredths = Math.floor((total % SECOND) / TICK);
  const base = `${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

/** `h:mm:ss` — the countdown reading, rounded up so a running second is shown. */
export function formatCountdown(ms: number): string {
  const total = roundTo(Math.max(0, ms), SECOND, 'up');
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);
  const base = `${pad(minutes)}:${pad(seconds)}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

/** `+00:12.34` — a lap's own time, next to the total. */
export function formatDelta(ms: number): string {
  return `+${formatStopwatch(ms)}`;
}

/** Split into the three typed fields, rounded the way the countdown reads them. */
export function toFields(ms: number): DurationFields {
  const total = Math.min(MAX_DURATION, roundTo(clampDuration(ms), SECOND, 'up'));
  return {
    hours: Math.floor(total / HOUR),
    minutes: Math.floor((total % HOUR) / MINUTE),
    seconds: Math.floor((total % MINUTE) / SECOND),
  };
}

export function fromFields(fields: DurationFields): number {
  const { hours, minutes, seconds } = fields;
  return clampDuration(hours * HOUR + minutes * MINUTE + seconds * SECOND);
}

/**
 * What a keystroke in one of the three fields means. Digits only: `"07"` is 7,
 * an empty field is 0, and anything over the field's maximum is clamped rather
 * than rejected, so holding a key never wedges the input.
 */
export function parseField(text: string, field: FieldName): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return Math.min(FIELD_MAX[field], Number(trimmed));
}

/** Step a field by ±1, wrapping at both ends the way a spinner should. */
export function stepField(value: number, field: FieldName, by: number): number {
  const span = FIELD_MAX[field] + 1;
  return (((value + by) % span) + span) % span;
}

/** "45 s", "10 min", "1 h", "1 h 30 min" — preset labels and notification copy. */
export function describeDuration(ms: number): string {
  const total = clampDuration(ms);
  if (total === 0) return '0 s';
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0) parts.push(`${seconds} s`);
  return parts.join(' ');
}
