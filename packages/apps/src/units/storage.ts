/**
 * What the converter keeps in ~/.config/units.json: the category it was left
 * on, the pair of units last used in each category, and the recent
 * conversions. The file is text a user can edit, so nothing read back from it
 * is trusted — a unit id that no longer exists is dropped rather than
 * rendered as a blank field.
 */

import {
  CATEGORY_IDS,
  type CategoryId,
  categoryOf,
  DEFAULT_PAIR,
  isCategoryId,
  type UnitId,
  unitById,
} from './catalogue';

/** How many conversions the recents list keeps. */
export const RECENT_LIMIT = 12;

export interface UnitPair {
  from: UnitId;
  to: UnitId;
}

export interface RecentConversion extends UnitPair {
  /** The value that was entered, in `from`. */
  value: number;
  /** When it was kept, for ordering. */
  at: number;
}

export interface UnitsData {
  category: CategoryId;
  /** The pair last used in each category, so switching back returns to it. */
  pairs: Partial<Record<CategoryId, UnitPair>>;
  recents: RecentConversion[];
  /** View preference: whether the recents list is asked for at all. */
  showRecents: boolean;
}

export const DEFAULT_DATA: UnitsData = {
  category: 'length',
  pairs: {},
  recents: [],
  showRecents: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A pair both of whose units exist and share `category`, or null. */
function readPair(value: unknown, category: CategoryId): UnitPair | null {
  if (!isRecord(value)) return null;
  const { from, to } = value;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (categoryOf(from) !== category || categoryOf(to) !== category) return null;
  return { from, to };
}

function readRecent(value: unknown): RecentConversion | null {
  if (!isRecord(value)) return null;
  const { from, to, value: amount, at } = value;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const category = categoryOf(from);
  if (category === null || categoryOf(to) !== category) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return { from, to, value: amount, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 };
}

export function normalizeData(raw: unknown): UnitsData {
  if (!isRecord(raw)) return { ...DEFAULT_DATA, pairs: {}, recents: [] };
  const showRecents = typeof raw.showRecents === 'boolean' ? raw.showRecents : true;
  const pairs: Partial<Record<CategoryId, UnitPair>> = {};
  if (isRecord(raw.pairs)) {
    for (const id of CATEGORY_IDS) {
      const pair = readPair(raw.pairs[id], id);
      if (pair) pairs[id] = pair;
    }
  }
  const recents: RecentConversion[] = [];
  if (Array.isArray(raw.recents)) {
    for (const entry of raw.recents) {
      const recent = readRecent(entry);
      if (recent) recents.push(recent);
    }
  }
  return {
    category: isCategoryId(raw.category) ? raw.category : DEFAULT_DATA.category,
    pairs,
    recents: recents.slice(0, RECENT_LIMIT),
    showRecents,
  };
}

/** The pair a category should open on: the one last used, else its default. */
export function pairFor(data: UnitsData, category: CategoryId): UnitPair {
  const stored = data.pairs[category];
  if (stored) return stored;
  const [from, to] = DEFAULT_PAIR[category];
  return { from, to };
}

export function setPair(data: UnitsData, category: CategoryId, pair: UnitPair): UnitsData {
  if (categoryOf(pair.from) !== category || categoryOf(pair.to) !== category) return data;
  const current = data.pairs[category];
  if (current && current.from === pair.from && current.to === pair.to) return data;
  return { ...data, pairs: { ...data.pairs, [category]: pair } };
}

/**
 * Keep a conversion. The same value between the same two units is one entry,
 * moved back to the top rather than repeated, and the list is capped.
 */
export function recordConversion(data: UnitsData, entry: RecentConversion): UnitsData {
  if (!unitById(entry.from) || !unitById(entry.to)) return data;
  if (!Number.isFinite(entry.value)) return data;
  const rest = data.recents.filter(
    (r) => !(r.from === entry.from && r.to === entry.to && r.value === entry.value),
  );
  return { ...data, recents: [entry, ...rest].slice(0, RECENT_LIMIT) };
}

export function clearRecents(data: UnitsData): UnitsData {
  return data.recents.length === 0 ? data : { ...data, recents: [] };
}

/** A stable key for a recent entry: two entries never collide on one list. */
export function recentKey(entry: RecentConversion): string {
  return `${entry.from}>${entry.to}@${entry.value}`;
}
