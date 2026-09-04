/**
 * What the clock keeps between sessions: the tab it was left on, the face the
 * local clock is drawn with, the world zones in the order they were arranged,
 * the timer presets and the duration the timer was last set to.
 *
 * It lives in ~/.config/clock.json, a text file a user can edit, so every
 * field is checked on the way in — including the zone names, which are handed
 * to `Intl` and would otherwise throw at render time.
 */

import { clampDuration, MINUTE } from './duration';
import { isValidTimeZone } from './zones';

export const TABS = ['clock', 'world', 'stopwatch', 'timer'] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABEL: Record<TabId, string> = {
  clock: 'Clock',
  world: 'World',
  stopwatch: 'Stopwatch',
  timer: 'Timer',
};

export const FACES = ['digital', 'analogue'] as const;
export type Face = (typeof FACES)[number];

/** As many zones as the list can hold before it stops being a glance. */
export const ZONE_LIMIT = 24;
export const PRESET_LIMIT = 8;

export interface ClockData {
  tab: TabId;
  face: Face;
  zones: string[];
  /** Timer presets in milliseconds, shortest first. */
  presets: number[];
  /** The countdown the timer fields were left at. */
  timer: number;
}

export const DEFAULT_PRESETS: readonly number[] = [MINUTE, 5 * MINUTE, 10 * MINUTE, 25 * MINUTE];

export const DEFAULT_DATA: ClockData = {
  tab: 'clock',
  face: 'digital',
  zones: [],
  presets: [...DEFAULT_PRESETS],
  timer: 5 * MINUTE,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A preset is a positive duration inside the range the fields can show. */
function readPreset(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const ms = clampDuration(value);
  return ms > 0 ? ms : null;
}

/** Shortest first, no duplicates, capped. */
function sortPresets(presets: readonly number[]): number[] {
  return [...new Set(presets)].sort((a, b) => a - b).slice(0, PRESET_LIMIT);
}

export function normalizeData(raw: unknown): ClockData {
  if (!isRecord(raw)) return { ...DEFAULT_DATA, zones: [], presets: [...DEFAULT_PRESETS] };
  const zones = Array.isArray(raw.zones)
    ? raw.zones
        .filter((zone): zone is string => typeof zone === 'string' && isValidTimeZone(zone))
        .filter((zone, index, list) => list.indexOf(zone) === index)
        .slice(0, ZONE_LIMIT)
    : [];
  const presets = Array.isArray(raw.presets)
    ? sortPresets(
        raw.presets
          .map(readPreset)
          .filter((ms): ms is number => ms !== null)
          .slice(0, PRESET_LIMIT),
      )
    : [...DEFAULT_PRESETS];
  return {
    tab: oneOf(raw.tab, TABS, DEFAULT_DATA.tab),
    face: oneOf(raw.face, FACES, DEFAULT_DATA.face),
    zones,
    presets,
    timer: typeof raw.timer === 'number' ? clampDuration(raw.timer) : DEFAULT_DATA.timer,
  };
}

/** Append a zone; already-present zones stay where the user put them. */
export function addZone(zones: readonly string[], zone: string): string[] {
  if (zones.includes(zone) || zones.length >= ZONE_LIMIT) return [...zones];
  return [...zones, zone];
}

export function removeZone(zones: readonly string[], zone: string): string[] {
  return zones.filter((entry) => entry !== zone);
}

/** Move the zone at `from` to `to`, clamped to the ends of the list. */
export function moveZone(zones: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= zones.length) return [...zones];
  const target = Math.min(zones.length - 1, Math.max(0, to));
  if (target === from) return [...zones];
  const next = [...zones];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...zones];
  next.splice(target, 0, moved);
  return next;
}

export function addPreset(presets: readonly number[], ms: number): number[] {
  const value = clampDuration(ms);
  if (value <= 0 || presets.includes(value)) return [...presets];
  return sortPresets([...presets, value]);
}

export function removePreset(presets: readonly number[], ms: number): number[] {
  return presets.filter((preset) => preset !== ms);
}
