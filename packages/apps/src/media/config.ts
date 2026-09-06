/**
 * What the player remembers between sessions, and how it reads a file that
 * may have been edited by hand. Anything unreadable falls back to the default
 * rather than throwing the playlist away.
 */

import { EMPTY_QUEUE, type LoopMode, type MediaKind, type QueueState, type Track } from './queue';
import { clamp } from './time';

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export interface MediaConfig {
  queue: QueueState;
  /** 0–1, independent of mute. */
  volume: number;
  muted: boolean;
  rate: number;
  showPlaylist: boolean;
  showVisualiser: boolean;
}

export const DEFAULT_CONFIG: MediaConfig = {
  queue: EMPTY_QUEUE,
  volume: 0.8,
  muted: false,
  rate: 1,
  showPlaylist: true,
  showVisualiser: true,
};

const LOOP_MODES: LoopMode[] = ['off', 'one', 'all'];
const KINDS: MediaKind[] = ['audio', 'video'];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function track(value: unknown): Track | null {
  const raw = record(value);
  const path = raw.path;
  const kind = raw.kind;
  if (typeof path !== 'string' || !path) return null;
  if (typeof kind !== 'string' || !KINDS.includes(kind as MediaKind)) return null;
  const name =
    typeof raw.name === 'string' && raw.name ? raw.name : path.slice(path.lastIndexOf('/') + 1);
  return { path, name, kind: kind as MediaKind };
}

function queue(value: unknown): QueueState {
  const raw = record(value);
  const list = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const t = track(entry);
    if (!t || seen.has(t.path)) continue;
    seen.add(t.path);
    tracks.push(t);
  }
  const loop = LOOP_MODES.includes(raw.loop as LoopMode) ? (raw.loop as LoopMode) : 'off';
  const index =
    typeof raw.index === 'number' &&
    Number.isInteger(raw.index) &&
    raw.index >= 0 &&
    raw.index < tracks.length
      ? raw.index
      : tracks.length > 0
        ? 0
        : -1;
  const seed = Math.floor(number(raw.seed, 1, 1, 0xffffffff));
  return { tracks, index, loop, shuffle: boolean(raw.shuffle, false), seed };
}

/** Read a stored configuration, replacing anything malformed with the default. */
export function sanitizeConfig(raw: unknown): MediaConfig {
  const value = record(raw);
  return {
    queue: queue(value.queue),
    volume: number(value.volume, DEFAULT_CONFIG.volume, 0, 1),
    muted: boolean(value.muted, DEFAULT_CONFIG.muted),
    rate: number(value.rate, DEFAULT_CONFIG.rate, MIN_RATE, MAX_RATE),
    showPlaylist: boolean(value.showPlaylist, DEFAULT_CONFIG.showPlaylist),
    showVisualiser: boolean(value.showVisualiser, DEFAULT_CONFIG.showVisualiser),
  };
}

/** The next rate on the ladder, in the given direction. */
export function stepRate(rate: number, direction: 1 | -1): number {
  const nearest = RATES.reduce((best, r) =>
    Math.abs(r - rate) < Math.abs(best - rate) ? r : best,
  );
  const at = RATES.indexOf(nearest);
  return RATES[clamp(at + direction, 0, RATES.length - 1)] ?? nearest;
}
