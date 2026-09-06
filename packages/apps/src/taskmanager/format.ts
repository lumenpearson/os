/**
 * Number and duration formatting for the monitor. Bytes are formatted with
 * `formatBytes` from @lumen/vfs; nothing here re-implements it.
 */

/** Shown wherever the platform cannot measure a value. Never a placeholder number. */
export const EM_DASH = '—';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Elapsed time as `m:ss`, `h:mm:ss` past an hour, `Nd h:mm:ss` past a day.
 * Negative or non-finite input has no honest reading, so it prints an em-dash.
 */
export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return EM_DASH;
  const total = Math.floor(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600) % 24;
  const days = Math.floor(total / 86_400);
  if (days > 0) return `${days}d ${hours}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return `${value.toFixed(digits)}%`;
}

/** Frames per second keeps one decimal: it is a measured ratio, not a count. */
export function formatFrameRate(value: number): string {
  if (!Number.isFinite(value) || value < 0) return EM_DASH;
  return value.toFixed(1);
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return String(Math.round(value));
}

/** A sampling interval in seconds: 1000 → "1 s", 500 → "0.5 s". */
export function formatInterval(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return EM_DASH;
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
}

/** How far back a full buffer reaches: "last 60 s", "last 5 min". */
export function formatSpan(capacity: number, intervalMs: number): string {
  const seconds = Math.round((capacity * intervalMs) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return EM_DASH;
  if (seconds < 120) return `last ${seconds} s`;
  return `last ${Math.round(seconds / 60)} min`;
}
