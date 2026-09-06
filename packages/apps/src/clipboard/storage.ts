/**
 * What Clipboard keeps for the account, in ~/.config/clipboard.json.
 *
 * Three things the kernel's store cannot hold. The pins, which are this app's
 * own copies of items so that they outlive the ring. The removals, recorded as
 * "hide this content up to this moment" — the kernel's store has no remove, so
 * a row cannot be taken out of the ring, and hiding by time means the same
 * text copied again tomorrow is a new event that comes back rather than one
 * suppressed for ever. And the moment Clear All was last used, which is the
 * same rule with one timestamp for the lot.
 *
 * The file is text a user can edit, so nothing read back from it is trusted.
 * Keys are recomputed from the content rather than believed.
 */

import { type ClipContent, type ClipEntry, type ClipKind, clipKey, type FileClip } from './entry';

/** How many pins the file keeps. Older pins fall off the end. */
export const PIN_LIMIT = 50;
/** How many removals are remembered; beyond this the oldest are forgotten. */
export const DISMISSED_LIMIT = 200;

export interface PinnedClip extends ClipContent {
  key: string;
  /** When the item was copied, carried over from the entry that was pinned. */
  copiedAt: number;
  pinnedAt: number;
}

/** One removed content, and the copy time at or before which it stays hidden. */
export interface Dismissal {
  key: string;
  at: number;
}

export interface ClipboardData {
  pins: PinnedClip[];
  dismissed: Dismissal[];
  /** Everything copied at or before this instant is hidden. */
  clearedBefore: number;
}

export const DEFAULT_DATA: ClipboardData = { pins: [], dismissed: [], clearedBefore: 0 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const finite = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function readFiles(value: unknown): FileClip | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.paths)) return null;
  const paths = value.paths.filter(
    (path): path is string => typeof path === 'string' && path !== '',
  );
  if (paths.length === 0) return null;
  return { paths, operation: value.operation === 'cut' ? 'cut' : 'copy' };
}

function readPin(value: unknown): PinnedClip | null {
  if (!isRecord(value)) return null;
  const kind: ClipKind = value.kind === 'files' ? 'files' : 'text';
  const content: ClipContent =
    kind === 'files'
      ? { kind, text: '', files: readFiles(value.files) }
      : { kind, text: typeof value.text === 'string' ? value.text : '', files: null };
  if (kind === 'files' && content.files === null) return null;
  if (kind === 'text' && content.text === '') return null;
  return {
    ...content,
    key: clipKey(content),
    copiedAt: finite(value.copiedAt),
    pinnedAt: finite(value.pinnedAt),
  };
}

function readDismissal(value: unknown): Dismissal | null {
  if (!isRecord(value)) return null;
  if (typeof value.key !== 'string' || value.key === '') return null;
  return { key: value.key, at: finite(value.at) };
}

export function normalizeData(raw: unknown): ClipboardData {
  if (!isRecord(raw)) return { ...DEFAULT_DATA };
  const clearedBefore = Math.max(0, finite(raw.clearedBefore));

  const pins: PinnedClip[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.pins)) {
    for (const value of raw.pins) {
      const pin = readPin(value);
      if (!pin || seen.has(pin.key)) continue;
      seen.add(pin.key);
      pins.push(pin);
    }
  }

  // A removal older than the last Clear All says nothing the timestamp does
  // not already say, so it is dropped rather than kept for ever.
  const byKey = new Map<string, number>();
  if (Array.isArray(raw.dismissed)) {
    for (const value of raw.dismissed) {
      const entry = readDismissal(value);
      if (!entry || entry.at <= clearedBefore) continue;
      byKey.set(entry.key, Math.max(byKey.get(entry.key) ?? 0, entry.at));
    }
  }
  const dismissed = [...byKey]
    .map(([key, at]) => ({ key, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, DISMISSED_LIMIT);

  return {
    pins: pins.sort((a, b) => b.pinnedAt - a.pinnedAt).slice(0, PIN_LIMIT),
    dismissed,
    clearedBefore,
  };
}

/** Take this app's own copy of an entry. Pinning something twice changes nothing. */
export function pinEntry(data: ClipboardData, entry: ClipEntry, now: number): ClipboardData {
  if (data.pins.some((pin) => pin.key === entry.key)) return data;
  const pin: PinnedClip = {
    kind: entry.kind,
    text: entry.text,
    files: entry.files ? { paths: [...entry.files.paths], operation: entry.files.operation } : null,
    key: entry.key,
    copiedAt: entry.copiedAt,
    pinnedAt: now,
  };
  return {
    ...data,
    pins: [pin, ...data.pins].slice(0, PIN_LIMIT),
    // Pinning is the opposite of removing, so an earlier removal of the same
    // content stops applying; otherwise unpinning later would vanish the row.
    dismissed: data.dismissed.filter((d) => d.key !== entry.key),
  };
}

export function unpinEntry(data: ClipboardData, key: string): ClipboardData {
  if (!data.pins.some((pin) => pin.key === key)) return data;
  return { ...data, pins: data.pins.filter((pin) => pin.key !== key) };
}

/** Take one item out of the list: drop the pin, and hide the ring's copy. */
export function removeEntry(data: ClipboardData, entry: ClipEntry): ClipboardData {
  const pins = data.pins.filter((pin) => pin.key !== entry.key);
  if (entry.copiedAt <= data.clearedBefore) return { ...data, pins };
  const at = Math.max(
    entry.copiedAt,
    ...data.dismissed.filter((d) => d.key === entry.key).map((d) => d.at),
  );
  const dismissed = [{ key: entry.key, at }, ...data.dismissed.filter((d) => d.key !== entry.key)]
    .sort((a, b) => b.at - a.at)
    .slice(0, DISMISSED_LIMIT);
  return { ...data, pins, dismissed };
}

/**
 * Clear All hides everything copied up to now and keeps the pins, which is
 * what pinning is for. Individual removals older than that are then redundant.
 */
export function clearHistory(data: ClipboardData, now: number): ClipboardData {
  return {
    ...data,
    dismissed: data.dismissed.filter((d) => d.at > now),
    clearedBefore: Math.max(data.clearedBefore, now),
  };
}
