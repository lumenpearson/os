/**
 * The smart lists, the counts beside them, and the rows a selection puts on
 * screen.
 *
 * A smart list is a question asked of every reminder — is it due by today, is
 * it flagged, is it done — so the same reminder appears wherever it answers
 * yes, and nothing is copied to make that happen. The counts in the sidebar
 * are always of what is still open, which is why Completed counts the ones
 * that are not.
 */

import { compareKeys, type DateKey } from './date';
import type { Reminder, ReminderList, RemindersData } from './store';

export const SMART_LISTS = ['today', 'scheduled', 'flagged', 'all', 'completed'] as const;
export type SmartListId = (typeof SMART_LISTS)[number];

export const SMART_LABELS: Record<SmartListId, string> = {
  today: 'Today',
  scheduled: 'Scheduled',
  flagged: 'Flagged',
  all: 'All',
  completed: 'Completed',
};

export const SMART_SHORTCUTS: Record<SmartListId, string> = {
  today: 'Mod+1',
  scheduled: 'Mod+2',
  flagged: 'Mod+3',
  all: 'Mod+4',
  completed: 'Mod+5',
};

/** What the sidebar says when a list has nothing in it. */
export const SMART_EMPTY: Record<SmartListId, string> = {
  today: 'Nothing due today.',
  scheduled: 'Nothing scheduled ahead.',
  flagged: 'No flagged reminders.',
  all: 'No reminders yet.',
  completed: 'Nothing completed yet.',
};

export type Selection = { kind: 'smart'; id: SmartListId } | { kind: 'list'; id: string };

export const DEFAULT_SELECTION: Selection = { kind: 'smart', id: 'today' };

export function selectionId(selection: Selection): string {
  return `${selection.kind}:${selection.id}`;
}

/** Read a stored selection back, falling back when the list is gone. */
export function parseSelection(value: string, lists: readonly ReminderList[]): Selection {
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  if (kind === 'smart') {
    const smart = SMART_LISTS.find((s) => s === id);
    return smart ? { kind: 'smart', id: smart } : DEFAULT_SELECTION;
  }
  if (kind === 'list' && lists.some((l) => l.id === id)) return { kind: 'list', id };
  return DEFAULT_SELECTION;
}

/**
 * Whether a reminder belongs in a smart list. Completed reminders are out of
 * every list but Completed, unless the window is showing them.
 */
export function matchesSmart(
  item: Reminder,
  id: SmartListId,
  today: DateKey,
  includeCompleted = false,
): boolean {
  if (id === 'completed') return item.completed;
  if (item.completed && !includeCompleted) return false;
  switch (id) {
    case 'today':
      // Due today, and everything that fell behind.
      return item.due !== null && compareKeys(item.due, today) <= 0;
    case 'scheduled':
      return item.due !== null && compareKeys(item.due, today) > 0;
    case 'flagged':
      return item.flagged;
    case 'all':
      return true;
  }
}

/** The number beside each smart list: what is open, and what is done. */
export function smartCounts(
  items: readonly Reminder[],
  today: DateKey,
): Record<SmartListId, number> {
  const counts: Record<SmartListId, number> = {
    today: 0,
    scheduled: 0,
    flagged: 0,
    all: 0,
    completed: 0,
  };
  for (const item of items) {
    for (const id of SMART_LISTS) {
      if (matchesSmart(item, id, today)) counts[id] += 1;
    }
  }
  return counts;
}

/** Open reminders per list id. */
export function listCounts(items: readonly Reminder[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.completed) continue;
    counts[item.listId] = (counts[item.listId] ?? 0) + 1;
  }
  return counts;
}

/** Title and notes, matched case-insensitively on every word typed. */
export function matchesQuery(item: Reminder, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${item.title}\n${item.notes}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export interface Row {
  item: Reminder;
  /** 1 for a subtask shown under its parent, 0 when the parent is not here. */
  depth: 0 | 1;
}

export interface Section {
  id: string;
  /** The day a scheduled group falls on; null for an ungrouped section. */
  date: DateKey | null;
  rows: Row[];
}

export interface ViewOptions {
  today: DateKey;
  showCompleted: boolean;
  query: string;
}

/** Every reminder a selection shows, in display order. */
export function itemsFor(
  data: RemindersData,
  selection: Selection,
  options: ViewOptions,
): Reminder[] {
  return data.items.filter((item) => {
    if (!matchesQuery(item, options.query)) return false;
    if (selection.kind === 'list') {
      if (item.listId !== selection.id) return false;
      return options.showCompleted || !item.completed;
    }
    return matchesSmart(item, selection.id, options.today, options.showCompleted);
  });
}

/** Rows keep their nesting only where the parent is on screen too. */
export function toRows(items: readonly Reminder[]): Row[] {
  const present = new Set(items.map((i) => i.id));
  return items.map((item) => ({
    item,
    depth: item.parentId !== null && present.has(item.parentId) ? 1 : 0,
  }));
}

/**
 * The sections a selection draws: Scheduled groups by the day a reminder is
 * due, everything else is one run of rows.
 */
export function sectionsFor(
  data: RemindersData,
  selection: Selection,
  options: ViewOptions,
): Section[] {
  const rows = toRows(itemsFor(data, selection, options));
  if (rows.length === 0) return [];
  if (!(selection.kind === 'smart' && selection.id === 'scheduled')) {
    return [{ id: 'items', date: null, rows }];
  }
  const byDay = new Map<DateKey, Row[]>();
  for (const row of rows) {
    const date = row.item.due;
    if (date === null) continue;
    const bucket = byDay.get(date);
    if (bucket) bucket.push(row);
    else byDay.set(date, [row]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([date, dayRows]) => ({ id: date, date, rows: dayRows }));
}

/**
 * The date a reminder typed into a smart list should take, so that what was
 * just added is visible in the list it was added from.
 */
export function defaultDueFor(selection: Selection, today: DateKey): DateKey | null {
  if (selection.kind !== 'smart') return null;
  return selection.id === 'today' ? today : null;
}

/** How many rows a set of sections holds, for the roving cursor. */
export function rowsOf(sections: readonly Section[]): Row[] {
  return sections.flatMap((section) => section.rows);
}

/** The row after (or before) `id`, or the nearest end when it is not there. */
export function stepRow(rows: readonly Row[], id: string | null, direction: 1 | -1): string | null {
  if (rows.length === 0) return null;
  const at = rows.findIndex((r) => r.item.id === id);
  if (at < 0) return (direction > 0 ? rows[0] : rows[rows.length - 1])?.item.id ?? null;
  const next = rows[Math.min(rows.length - 1, Math.max(0, at + direction))];
  return next?.item.id ?? null;
}

/** What the status bar counts for the selection on screen. */
export function summarize(rows: readonly Row[]): { open: number; completed: number } {
  let open = 0;
  let completed = 0;
  for (const row of rows) {
    if (row.item.completed) completed += 1;
    else open += 1;
  }
  return { open, completed };
}
