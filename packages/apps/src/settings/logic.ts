/**
 * Small pure helpers used by the pages: option lists, list reordering,
 * status strings, storage arithmetic, region formatting.
 */
import type { Settings } from '@lumen/kernel';
import type { SelectOption } from '@lumen/ui';

// ── option lists ────────────────────────────────────────────────────────

export const MINUTES = [0, 1, 2, 5, 10, 15, 30, 60] as const;

export function minuteLabel(minutes: number): string {
  if (minutes === 0) return 'Never';
  if (minutes === 1) return '1 minute';
  if (minutes >= 60) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

export const MINUTE_OPTIONS: SelectOption[] = MINUTES.map((m) => ({
  value: String(m),
  label: minuteLabel(m),
}));

/** Coerce a `<select>` value back to a minute count, ignoring garbage. */
export function parseMinutes(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const LOCALES = [
  'en-US',
  'en-GB',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'ru-RU',
  'uk-UA',
  'pl-PL',
  'tr-TR',
  'ja-JP',
  'zh-CN',
  'ko-KR',
] as const;

// ── pinned apps ─────────────────────────────────────────────────────────

export function movePinned(list: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

export function addPinned(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export function removePinned(list: string[], id: string): string[] {
  return list.filter((x) => x !== id);
}

/** Add or remove an app from the muted list. `allowed` is the switch state. */
export function setMuted(muted: string[], appId: string, allowed: boolean): string[] {
  if (allowed) return muted.filter((id) => id !== appId);
  return muted.includes(appId) ? muted : [...muted, appId];
}

// ── status strings ──────────────────────────────────────────────────────

export function networkStatus(network: Settings['network']): string {
  if (network.airplane) return 'Airplane mode';
  if (!network.wifi) return 'Wi-Fi off';
  return `Connected to ${network.ssid || 'network'}`;
}

export function updateStatus(
  lastChecked: number | null,
  version: string,
  relative: (t: number) => string,
): string {
  if (lastChecked === null) return `Lumen OS ${version} · not checked yet`;
  return `Lumen OS ${version} is up to date · checked ${relative(lastChecked)}`;
}

export function viewportLabel(width: number, height: number, dpr: number): string {
  const scale = Number.isInteger(dpr) ? String(dpr) : dpr.toFixed(2).replace(/0+$/, '');
  return `${width} × ${height} · ${scale}×`;
}

/** "45 s", "12 min", "3 h 05 min", "2 d 4 h". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ── storage ─────────────────────────────────────────────────────────────

export interface FolderSize {
  name: string;
  path: string;
  size: number;
}

export interface BreakdownRow extends FolderSize {
  /** Share of the sum of all rows, 0–1. */
  fraction: number;
}

/** Largest first; fractions are relative to the total of the given rows. */
export function storageBreakdown(rows: FolderSize[]): BreakdownRow[] {
  const total = rows.reduce((sum, r) => sum + r.size, 0);
  return [...rows]
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, fraction: total > 0 ? r.size / total : 0 }));
}

// ── credentials ─────────────────────────────────────────────────────────

export interface CredentialKernel {
  changePassword(current: string, next: string, hint?: string): Promise<boolean>;
  resetPassword(next: string, hint?: string): Promise<string>;
}

/**
 * Verify the current password, set the next one, and return the fresh
 * recovery key. `changePassword` only reports success, so the key comes
 * from a second `resetPassword` with the same credentials.
 */
export async function rotateCredentials(
  kernel: CredentialKernel,
  current: string,
  next: string,
  hint?: string,
): Promise<string | null> {
  const ok = await kernel.changePassword(current, next, hint);
  if (!ok) return null;
  return kernel.resetPassword(next, hint);
}

// ── region ──────────────────────────────────────────────────────────────

export function localeLabel(tag: string): string {
  try {
    const [lang, region] = tag.split('-');
    const languages = new Intl.DisplayNames([tag], { type: 'language' });
    const regions = new Intl.DisplayNames([tag], { type: 'region' });
    const language = lang ? languages.of(lang) : undefined;
    const place = region ? regions.of(region) : undefined;
    if (language && place) return `${language} (${place})`;
    if (language) return language;
  } catch {
    /* Intl.DisplayNames unavailable */
  }
  return tag;
}

/** Every IANA zone the runtime knows, always including `current`. */
export function listTimeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') zones = intl.supportedValuesOf('timeZone');
  } catch {
    /* unsupported */
  }
  if (zones.length === 0) zones = ['UTC'];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export function dateExample(
  format: Settings['region']['dateFormat'],
  locale: string,
  date: Date,
): string {
  if (format === 'iso') return date.toISOString().slice(0, 10);
  const loc = format === 'us' ? 'en-US' : format === 'eu' ? 'en-GB' : locale || 'en-US';
  try {
    return new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
