/**
 * The taskbar's pure logic: what the bar carries and in which order, which
 * apps have been used most, where a dragged icon lands, and the curve the
 * magnifier follows. Nothing here touches the DOM or a store, so every rule
 * the bar follows can be read and tested on its own.
 */

/** Every piece the bar knows how to draw. `taskbar.items` is a list of these. */
export const TASKBAR_ITEM_IDS = [
  'start',
  'search',
  'windows',
  'pinned',
  'frequent',
  'weather',
  'news',
  'trash',
  'clock',
] as const;

export type TaskbarItemId = (typeof TASKBAR_ITEM_IDS)[number];

const KNOWN: ReadonlySet<string> = new Set(TASKBAR_ITEM_IDS);

export function isTaskbarItemId(id: string): id is TaskbarItemId {
  return KNOWN.has(id);
}

/**
 * The ids the bar will draw, in the order the setting gives them. Unknown ids
 * are dropped rather than guessed at, and a repeat is drawn once: two Start
 * buttons would be two answers to the same question.
 */
export function resolveItems(ids: readonly string[]): TaskbarItemId[] {
  const out: TaskbarItemId[] = [];
  for (const id of ids) if (isTaskbarItemId(id) && !out.includes(id)) out.push(id);
  return out;
}

/** One entry of the kernel's Recents list. */
export interface RecentEntry {
  path: string;
  openedAt: number;
  appId: string;
}

/**
 * The apps that opened the most documents, most recent first among ties.
 *
 * This counts what the kernel already records — its Recents list — rather
 * than keeping a launch counter of its own. An app with nothing in Recents
 * has no measurement behind it and does not appear.
 */
export function frequentAppIds(
  recents: readonly RecentEntry[],
  options: { exclude?: ReadonlySet<string>; limit?: number } = {},
): string[] {
  const limit = options.limit ?? 3;
  if (limit <= 0) return [];
  const tally = new Map<string, { count: number; last: number }>();
  for (const entry of recents) {
    const appId = entry?.appId;
    if (typeof appId !== 'string' || appId === '') continue;
    if (options.exclude?.has(appId)) continue;
    const seen = tally.get(appId);
    if (seen) {
      seen.count += 1;
      seen.last = Math.max(seen.last, entry.openedAt);
    } else {
      tally.set(appId, { count: 1, last: entry.openedAt });
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}

/** Move `fromId` to where `toId` sits. Ids the list does not hold are ignored. */
export function reorderIds(list: readonly string[], fromId: string, toId: string): string[] {
  const next = [...list];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** The index a drag of `delta` px from `from` would drop on. */
export function dropTarget(from: number, delta: number, extent: number, count: number): number {
  if (count <= 1 || extent <= 0) return from;
  const to = from + Math.round(delta / extent);
  return Math.max(0, Math.min(count - 1, to));
}

/** How far icon `index` slides while the icon at `from` is dragged towards `to`. */
export function shiftFor(index: number, from: number, to: number, extent: number): number {
  if (index === from) return 0;
  if (to > from && index > from && index <= to) return -extent;
  if (to < from && index >= to && index < from) return extent;
  return 0;
}

/**
 * The magnifier's curve: `1 + amount` under the pointer, easing back to 1 at
 * `range` px away. Smooth at both ends, so an icon never pops.
 */
export function magnifyScale(distance: number, range: number, amount = 0.45): number {
  if (range <= 0) return 1;
  const t = Math.min(1, Math.abs(distance) / range);
  const eased = t * t * (3 - 2 * t);
  return 1 + amount * (1 - eased);
}
