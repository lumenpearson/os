/**
 * Playback time arithmetic and formatting. Media elements report `NaN` before
 * metadata arrives and `Infinity` for streams, so every function here takes an
 * unknown duration seriously instead of printing a made-up number.
 */

/** Shown wherever a time is not known yet. */
export const UNKNOWN_TIME = '--:--';

/** Seconds past which Previous restarts the track instead of stepping back. */
export const RESTART_WINDOW = 3;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return value < min ? min : value > max ? max : value;
}

/** True when a media element's duration is usable for seeking and display. */
export function isKnownDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

/** `m:ss` under an hour, `h:mm:ss` above it. Unknown input reads as `--:--`. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds)) return UNKNOWN_TIME;
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  if (h === 0) return `${m}:${ss}`;
  return `${h}:${String(m).padStart(2, '0')}:${ss}`;
}

/** Time left, as `-m:ss`. Unknown duration reads as `--:--`. */
export function formatRemaining(current: number, duration: number): string {
  const left = remainingTime(current, duration);
  if (left === null) return UNKNOWN_TIME;
  return `-${formatTimecode(left)}`;
}

/** Seconds left, or null when the duration is not known. */
export function remainingTime(current: number, duration: number): number | null {
  if (!isKnownDuration(duration)) return null;
  return clamp(duration - (Number.isFinite(current) ? current : 0), 0, duration);
}

/** `1:23`, `1:02:03` or plain seconds → seconds. Returns null when unparsable. */
export function parseTimecode(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-');
  const parts = (negative ? trimmed.slice(1) : trimmed).split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  if (!Number.isFinite(total)) return null;
  return negative ? -total : total;
}

/** Keep a time inside the media. An unknown duration clamps at zero. */
export function clampTime(time: number, duration: number): number {
  if (!isKnownDuration(duration)) return 0;
  return clamp(time, 0, duration);
}

/** Fraction played, 0–1. Zero while the duration is unknown. */
export function progress(current: number, duration: number): number {
  if (!isKnownDuration(duration)) return 0;
  return clamp(current / duration, 0, 1);
}

/** Skip `delta` seconds from `current`, clamped to the media. */
export function seekBy(current: number, delta: number, duration: number): number {
  const from = Number.isFinite(current) ? current : 0;
  return clampTime(from + delta, duration);
}

/** The 0–9 keys: `fraction` 0–1 of the duration. */
export function timeAtFraction(fraction: number, duration: number): number {
  if (!isKnownDuration(duration)) return 0;
  return clampTime(clamp(fraction, 0, 1) * duration, duration);
}

/** `1×`, `1.5×`, `0.75×`. */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '1×';
  return `${Number(rate.toFixed(2))}×`;
}

/** `72%` for the volume readout. */
export function formatPercent(fraction: number): string {
  return `${Math.round(clamp(fraction, 0, 1) * 100)}%`;
}
