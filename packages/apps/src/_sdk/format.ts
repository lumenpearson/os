import { getSettings } from '@lumen/kernel';

function locale(): string {
  return getSettings().region.locale || undefined || 'en-US';
}

function timeZone(): string | undefined {
  const tz = getSettings().region.timeZone;
  return tz || undefined;
}

export function formatTime(date: Date | number, options: { seconds?: boolean } = {}): string {
  const s = getSettings();
  return new Intl.DateTimeFormat(locale(), {
    hour: 'numeric',
    minute: '2-digit',
    second: options.seconds ? '2-digit' : undefined,
    hour12: !s.menubar.clock24h,
    timeZone: timeZone(),
  }).format(date);
}

export function formatDate(
  date: Date | number,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  const s = getSettings();
  const d = typeof date === 'number' ? new Date(date) : date;
  const fmt = s.region.dateFormat;
  if (fmt === 'iso') return d.toISOString().slice(0, 10);
  const loc = fmt === 'us' ? 'en-US' : fmt === 'eu' ? 'en-GB' : locale();
  return new Intl.DateTimeFormat(loc, {
    dateStyle: style,
    timeZone: timeZone(),
  }).format(d);
}

export function formatDateTime(date: Date | number): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** "just now", "5 min ago", "yesterday", or a date for older values. */
export function formatRelative(date: Date | number, now = Date.now()): string {
  const t = typeof date === 'number' ? date : date.getTime();
  const diff = now - t;
  const min = 60_000;
  if (diff < min) return 'just now';
  if (diff < 60 * min) return `${Math.round(diff / min)} min ago`;
  if (diff < 24 * 60 * min) return `${Math.round(diff / (60 * min))} h ago`;
  if (diff < 48 * 60 * min) return 'yesterday';
  if (diff < 7 * 24 * 60 * min) return `${Math.round(diff / (24 * 60 * min))} days ago`;
  return formatDate(t);
}
