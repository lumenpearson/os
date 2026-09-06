/**
 * What the map keeps in ~/.config/charmap.json: the block it was left on, the
 * characters copied recently, and the ones pinned deliberately. The file is
 * text a person can edit, so nothing read back is trusted — a code point that
 * is out of range, or one the engine has nothing to draw for, is dropped
 * rather than shown as an empty cell.
 */

import { DEFAULT_BLOCK, isBlockId } from './blocks';
import { isDisplayable } from './chars';

/** Copying pushes onto this list; it is a trail, not a collection. */
export const RECENT_LIMIT = 48;
/** Pins are chosen one at a time, so the cap only guards against a bad file. */
export const PIN_LIMIT = 200;

/** The two lists the person builds, alongside the blocks. */
export const PINNED_SOURCE = 'pinned';
export const RECENT_SOURCE = 'recent';

/** A block id, or one of the two lists. */
export type SourceId = string;

export interface CharmapData {
  /** The block or list the grid is showing. */
  source: SourceId;
  /** Most recently copied first. */
  recents: number[];
  /** In the order they were pinned. */
  pinned: number[];
  /** View preference: whether the block list is asked for at all. */
  showSidebar: boolean;
}

export const DEFAULT_DATA: CharmapData = {
  source: DEFAULT_BLOCK,
  recents: [],
  pinned: [],
  showSidebar: true,
};

export function isSourceId(value: unknown): value is SourceId {
  return value === PINNED_SOURCE || value === RECENT_SOURCE || isBlockId(value);
}

function readCodePoints(value: unknown, limit: number): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number') continue;
    if (!isDisplayable(entry)) continue;
    if (out.includes(entry)) continue;
    out.push(entry);
    if (out.length === limit) break;
  }
  return out;
}

export function normalizeData(raw: unknown): CharmapData {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_DATA };
  const record = raw as Record<string, unknown>;
  return {
    source: isSourceId(record.source) ? record.source : DEFAULT_DATA.source,
    recents: readCodePoints(record.recents, RECENT_LIMIT),
    pinned: readCodePoints(record.pinned, PIN_LIMIT),
    showSidebar: typeof record.showSidebar === 'boolean' ? record.showSidebar : true,
  };
}

/** Copying a character again moves it back to the front rather than repeating it. */
export function recordRecent(data: CharmapData, codePoint: number): CharmapData {
  if (!isDisplayable(codePoint)) return data;
  const rest = data.recents.filter((cp) => cp !== codePoint);
  return { ...data, recents: [codePoint, ...rest].slice(0, RECENT_LIMIT) };
}

export function isPinned(data: CharmapData, codePoint: number): boolean {
  return data.pinned.includes(codePoint);
}

/** Pin or unpin. A new pin goes to the end, where the person last looked. */
export function togglePin(data: CharmapData, codePoint: number): CharmapData {
  if (!isDisplayable(codePoint)) return data;
  if (isPinned(data, codePoint)) {
    return { ...data, pinned: data.pinned.filter((cp) => cp !== codePoint) };
  }
  if (data.pinned.length >= PIN_LIMIT) return data;
  return { ...data, pinned: [...data.pinned, codePoint] };
}

export function clearRecents(data: CharmapData): CharmapData {
  return data.recents.length === 0 ? data : { ...data, recents: [] };
}
