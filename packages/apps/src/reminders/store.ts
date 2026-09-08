/**
 * The reminders document: what a reminder is, how one is read back off disk,
 * and every change the window can make to the store.
 *
 * Two invariants hold everywhere below, and `normalizeData` restores both on
 * anything read from a file:
 *
 * 1. A subtask is exactly one level deep. Its parent is a top-level reminder
 *    in the same list, and a reminder that has subtasks cannot become one.
 * 2. The array is in display order: every top-level reminder is followed
 *    immediately by its subtasks. That makes a subtree a contiguous slice, so
 *    moving, indenting and deleting are slices rather than tree walks.
 *
 * A repeat rule needs a due date to repeat from, so `repeat` is dropped
 * whenever `due` is null, and a time of day is dropped with its date.
 */

import { addDays, addMonths, clampMinutes, type DateKey, isDateKey } from './date';

export const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** How a priority prints beside a title: the marks a terminal would use. */
export const PRIORITY_MARKS: Record<Priority, string> = {
  none: '',
  low: '!',
  medium: '!!',
  high: '!!!',
};

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export interface Repeat {
  freq: Frequency;
  /** Every `interval` days / weeks / months / years. At least 1. */
  interval: number;
}

/** A hand-edited file cannot ask for a rule that never comes round. */
export const MAX_INTERVAL = 999;

export interface Reminder {
  id: string;
  listId: string;
  title: string;
  notes: string;
  /** `YYYY-MM-DD`, or null when the reminder has no day. */
  due: DateKey | null;
  /** Minutes since midnight, or null for a day without a time. */
  dueTime: number | null;
  priority: Priority;
  completed: boolean;
  completedAt: number | null;
  flagged: boolean;
  /** The reminder this is a subtask of, or null for a top-level one. */
  parentId: string | null;
  repeat: Repeat | null;
  createdAt: number;
}

export interface ReminderList {
  id: string;
  name: string;
  createdAt: number;
}

export interface RemindersPrefs {
  /** The selected sidebar row, `smart:today` or `list:<id>`. */
  selection: string;
  showCompleted: boolean;
  showSidebar: boolean;
}

export interface RemindersData {
  version: 1;
  lists: ReminderList[];
  items: Reminder[];
  prefs: RemindersPrefs;
}

export const DEFAULT_LIST_ID = 'reminders';
export const DEFAULT_LIST_NAME = 'Reminders';

export const DEFAULT_PREFS: RemindersPrefs = {
  selection: 'smart:today',
  showCompleted: false,
  showSidebar: true,
};

export const DEFAULT_DATA: RemindersData = {
  version: 1,
  lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, createdAt: 0 }],
  items: [],
  prefs: DEFAULT_PREFS,
};

/** "Every week", "Every 3 days" — the rule in words. */
export function describeRepeat(repeat: Repeat | null): string {
  if (!repeat) return '';
  const single: Record<Frequency, string> = {
    daily: 'Every day',
    weekly: 'Every week',
    monthly: 'Every month',
    yearly: 'Every year',
  };
  if (repeat.interval === 1) return single[repeat.freq];
  const plural: Record<Frequency, string> = {
    daily: 'days',
    weekly: 'weeks',
    monthly: 'months',
    yearly: 'years',
  };
  return `Every ${repeat.interval} ${plural[repeat.freq]}`;
}

/** The title a reminder shows when the field was left empty. */
export const UNTITLED = 'New Reminder';

export function displayTitle(item: Reminder): string {
  return item.title.trim() || UNTITLED;
}

// ── reading stored JSON ───────────────────────────────────────────────────

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeRepeat(value: unknown): Repeat | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const freq = FREQUENCIES.find((f) => f === raw.freq);
  if (!freq) return null;
  const interval = Math.floor(num(raw.interval, 1));
  return { freq, interval: Math.min(MAX_INTERVAL, Math.max(1, interval)) };
}

/**
 * Apply the invariants a reminder has to satisfy however it was made: a time
 * and a repeat rule need a date, and only a completed reminder has a moment
 * it was completed at.
 */
export function settle(item: Reminder): Reminder {
  const due = item.due !== null && isDateKey(item.due) ? item.due : null;
  return {
    ...item,
    due,
    dueTime: due === null || item.dueTime === null ? null : clampMinutes(item.dueTime),
    repeat: due === null ? null : item.repeat,
    completedAt: item.completed ? num(item.completedAt, 0) : null,
  };
}

function normalizeList(value: unknown): ReminderList | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id).trim();
  if (!id) return null;
  return { id, name: str(raw.name).trim() || id, createdAt: num(raw.createdAt, 0) };
}

/** Read one reminder out of unknown JSON, or reject it. */
export function normalizeItem(value: unknown): Reminder | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id).trim();
  if (!id) return null;
  const completed = raw.completed === true;
  return settle({
    id,
    listId: str(raw.listId).trim(),
    title: str(raw.title),
    notes: str(raw.notes),
    due: isDateKey(raw.due) ? raw.due : null,
    dueTime: typeof raw.dueTime === 'number' ? clampMinutes(raw.dueTime) : null,
    priority: PRIORITIES.find((p) => p === raw.priority) ?? 'none',
    completed,
    completedAt: completed ? num(raw.completedAt, 0) : null,
    flagged: raw.flagged === true,
    parentId: str(raw.parentId).trim() || null,
    repeat: normalizeRepeat(raw.repeat),
    createdAt: num(raw.createdAt, 0),
  });
}

/**
 * Display order: top-level reminders keep the order they are stored in, and
 * each one takes its subtasks along behind it.
 */
export function orderItems(items: readonly Reminder[]): Reminder[] {
  const children = new Map<string, Reminder[]>();
  for (const item of items) {
    if (item.parentId === null) continue;
    const bucket = children.get(item.parentId);
    if (bucket) bucket.push(item);
    else children.set(item.parentId, [item]);
  }
  const out: Reminder[] = [];
  for (const item of items) {
    if (item.parentId !== null) continue;
    out.push(item);
    out.push(...(children.get(item.id) ?? []));
  }
  return out;
}

/**
 * Read the whole file. Anything unreadable falls back to the defaults rather
 * than throwing, and every reference is checked: a reminder in a list that is
 * gone moves to the first list, a subtask of a missing (or itself nested)
 * parent is promoted, and a subtask follows its parent's list.
 */
export function normalizeData(value: unknown): RemindersData {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const parsedLists = Array.isArray(raw.lists)
    ? raw.lists.map(normalizeList).filter((l): l is ReminderList => l !== null)
    : [];
  const lists: ReminderList[] = [];
  const seenList = new Set<string>();
  for (const list of parsedLists) {
    if (seenList.has(list.id)) continue;
    seenList.add(list.id);
    lists.push(list);
  }
  if (lists.length === 0) {
    lists.push({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, createdAt: 0 });
  }
  const fallbackList = lists[0]?.id ?? DEFAULT_LIST_ID;

  const parsedItems = Array.isArray(raw.items)
    ? raw.items.map(normalizeItem).filter((i): i is Reminder => i !== null)
    : [];
  const items: Reminder[] = [];
  const seenItem = new Set<string>();
  for (const item of parsedItems) {
    if (seenItem.has(item.id)) continue;
    seenItem.add(item.id);
    items.push({ ...item, listId: seenList.has(item.listId) ? item.listId : fallbackList });
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const resolved = items.map((item) => {
    if (item.parentId === null) return item;
    const parent = byId.get(item.parentId);
    // Only a top-level reminder can be a parent: that caps the depth at one
    // and makes a cycle impossible.
    if (!parent || parent.id === item.id || parent.parentId !== null) {
      return { ...item, parentId: null };
    }
    return { ...item, listId: parent.listId };
  });

  const prefs =
    raw.prefs && typeof raw.prefs === 'object' ? (raw.prefs as Record<string, unknown>) : {};
  return {
    version: 1,
    lists,
    items: orderItems(resolved),
    prefs: {
      selection: str(prefs.selection, DEFAULT_PREFS.selection) || DEFAULT_PREFS.selection,
      showCompleted: prefs.showCompleted === true,
      showSidebar: prefs.showSidebar !== false,
    },
  };
}

// ── making one ────────────────────────────────────────────────────────────

export interface ReminderInput {
  listId: string;
  title: string;
  notes?: string;
  due?: DateKey | null;
  dueTime?: number | null;
  priority?: Priority;
  flagged?: boolean;
  parentId?: string | null;
  repeat?: Repeat | null;
}

export function createReminder(input: ReminderInput, id: string, now: number): Reminder {
  return settle({
    id,
    listId: input.listId,
    title: input.title,
    notes: input.notes ?? '',
    due: input.due ?? null,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? 'none',
    completed: false,
    completedAt: null,
    flagged: input.flagged ?? false,
    parentId: input.parentId ?? null,
    repeat: input.repeat ?? null,
    createdAt: now,
  });
}

/**
 * A fresh id. The clock alone is not enough — two reminders typed in the same
 * millisecond would collide — so a counter rides along with it.
 */
let sequence = 0;
export function newId(prefix: 'r' | 'l' = 'r'): string {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence.toString(36)}`;
}

// ── reading the tree ──────────────────────────────────────────────────────

export function findItem(items: readonly Reminder[], id: string | null): Reminder | null {
  if (id === null) return null;
  return items.find((i) => i.id === id) ?? null;
}

export function childrenOf(items: readonly Reminder[], id: string): Reminder[] {
  return items.filter((i) => i.parentId === id);
}

/** Where a reminder's subtree sits in the ordered array. */
export function subtreeRange(
  items: readonly Reminder[],
  id: string,
): { start: number; end: number } | null {
  const start = items.findIndex((i) => i.id === id);
  if (start < 0) return null;
  const item = items[start];
  if (!item || item.parentId !== null) return { start, end: start + 1 };
  let end = start + 1;
  while (items[end]?.parentId === id) end += 1;
  return { start, end };
}

/** The reminders that sit at the same level, in order. */
export function siblingsOf(items: readonly Reminder[], item: Reminder): Reminder[] {
  if (item.parentId !== null) return childrenOf(items, item.parentId);
  return items.filter((i) => i.parentId === null && i.listId === item.listId);
}

/** True when Tab would do something: there is a reminder above to sit under. */
export function canIndent(items: readonly Reminder[], id: string): boolean {
  const item = findItem(items, id);
  if (!item || item.parentId !== null) return false;
  if (childrenOf(items, id).length > 0) return false;
  const siblings = siblingsOf(items, item);
  return siblings.findIndex((s) => s.id === id) > 0;
}

export function canOutdent(items: readonly Reminder[], id: string): boolean {
  return findItem(items, id)?.parentId != null;
}

/** The date the next occurrence of a repeating reminder falls on. */
export function nextDue(due: DateKey, repeat: Repeat): DateKey {
  switch (repeat.freq) {
    case 'daily':
      return addDays(due, repeat.interval);
    case 'weekly':
      return addDays(due, repeat.interval * 7);
    case 'monthly':
      return addMonths(due, repeat.interval);
    case 'yearly':
      return addMonths(due, repeat.interval * 12);
  }
}

// ── changing the store ────────────────────────────────────────────────────

export type ReminderPatch = Partial<
  Pick<Reminder, 'title' | 'notes' | 'due' | 'dueTime' | 'priority' | 'flagged' | 'repeat'>
>;

export type RemindersAction =
  | { type: 'add'; item: Reminder }
  | { type: 'edit'; id: string; patch: ReminderPatch }
  /**
   * Ticking a repeating reminder files the occurrence just done and opens the
   * next one under `nextId`; the rule moves with it, so exactly one reminder
   * of a series is ever open.
   */
  | { type: 'complete'; id: string; now: number; nextId: string }
  | { type: 'uncomplete'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'move'; id: string; listId: string }
  | { type: 'reorder'; id: string; direction: 1 | -1 }
  | { type: 'indent'; id: string }
  | { type: 'outdent'; id: string }
  | { type: 'addList'; list: ReminderList }
  | { type: 'renameList'; id: string; name: string }
  | { type: 'deleteList'; id: string };

function withItems(data: RemindersData, items: Reminder[]): RemindersData {
  return { ...data, items: orderItems(items) };
}

/** Take a subtree out of the array, returning both halves. */
function extract(
  items: readonly Reminder[],
  id: string,
): { rest: Reminder[]; subtree: Reminder[] } | null {
  const range = subtreeRange(items, id);
  if (!range) return null;
  return {
    rest: [...items.slice(0, range.start), ...items.slice(range.end)],
    subtree: items.slice(range.start, range.end),
  };
}

function insertAt(
  items: readonly Reminder[],
  subtree: readonly Reminder[],
  at: number,
): Reminder[] {
  const index = Math.max(0, Math.min(items.length, at));
  return [...items.slice(0, index), ...subtree, ...items.slice(index)];
}

function reorder(data: RemindersData, id: string, direction: 1 | -1): RemindersData {
  const item = findItem(data.items, id);
  if (!item) return data;
  const siblings = siblingsOf(data.items, item);
  const at = siblings.findIndex((s) => s.id === id);
  const neighbour = siblings[at + direction];
  if (at < 0 || !neighbour) return data;
  const taken = extract(data.items, id);
  if (!taken) return data;
  const range = subtreeRange(taken.rest, neighbour.id);
  if (!range) return data;
  return withItems(
    data,
    insertAt(taken.rest, taken.subtree, direction < 0 ? range.start : range.end),
  );
}

function indent(data: RemindersData, id: string): RemindersData {
  if (!canIndent(data.items, id)) return data;
  const item = findItem(data.items, id);
  if (!item) return data;
  const siblings = siblingsOf(data.items, item);
  const parent = siblings[siblings.findIndex((s) => s.id === id) - 1];
  if (!parent) return data;
  const taken = extract(data.items, id);
  if (!taken) return data;
  const range = subtreeRange(taken.rest, parent.id);
  if (!range) return data;
  const moved = taken.subtree.map((i) => ({ ...i, parentId: parent.id, listId: parent.listId }));
  return withItems(data, insertAt(taken.rest, moved, range.end));
}

function outdent(data: RemindersData, id: string): RemindersData {
  const item = findItem(data.items, id);
  if (!item || item.parentId === null) return data;
  const parentId = item.parentId;
  const taken = extract(data.items, id);
  if (!taken) return data;
  const range = subtreeRange(taken.rest, parentId);
  if (!range) return data;
  const moved = taken.subtree.map((i) => ({ ...i, parentId: null }));
  return withItems(data, insertAt(taken.rest, moved, range.end));
}

function complete(data: RemindersData, id: string, now: number, nextId: string): RemindersData {
  const item = findItem(data.items, id);
  if (!item || item.completed) return data;
  const done = new Set([id, ...childrenOf(data.items, id).map((c) => c.id)]);
  const items = data.items.map((i) =>
    done.has(i.id) && !i.completed ? { ...i, completed: true, completedAt: now, repeat: null } : i,
  );
  if (!item.repeat || item.due === null) return withItems(data, items);
  const next: Reminder = {
    ...item,
    id: nextId,
    due: nextDue(item.due, item.repeat),
    completed: false,
    completedAt: null,
    createdAt: now,
  };
  const range = subtreeRange(items, id);
  return withItems(data, insertAt(items, [next], range ? range.end : items.length));
}

function moveToList(data: RemindersData, id: string, listId: string): RemindersData {
  if (!data.lists.some((l) => l.id === listId)) return data;
  const item = findItem(data.items, id);
  if (!item) return data;
  const moving = new Set([id, ...childrenOf(data.items, id).map((c) => c.id)]);
  // A subtask dragged to another list leaves its parent behind, so it lands
  // as a reminder of its own rather than a subtask across two lists.
  const items = data.items.map((i) =>
    moving.has(i.id) ? { ...i, listId, parentId: i.id === id ? null : i.parentId } : i,
  );
  return withItems(data, items);
}

export function remindersReducer(data: RemindersData, action: RemindersAction): RemindersData {
  switch (action.type) {
    case 'add': {
      if (findItem(data.items, action.item.id)) return data;
      const item = settle(action.item);
      if (!data.lists.some((l) => l.id === item.listId)) return data;
      return withItems(data, [...data.items, item]);
    }
    case 'edit': {
      const current = findItem(data.items, action.id);
      if (!current) return data;
      return withItems(
        data,
        data.items.map((i) => (i.id === action.id ? settle({ ...i, ...action.patch }) : i)),
      );
    }
    case 'complete':
      return complete(data, action.id, action.now, action.nextId);
    case 'uncomplete':
      return withItems(
        data,
        data.items.map((i) =>
          i.id === action.id ? { ...i, completed: false, completedAt: null } : i,
        ),
      );
    case 'delete': {
      const range = subtreeRange(data.items, action.id);
      if (!range) return data;
      return withItems(data, [...data.items.slice(0, range.start), ...data.items.slice(range.end)]);
    }
    case 'move':
      return moveToList(data, action.id, action.listId);
    case 'reorder':
      return reorder(data, action.id, action.direction);
    case 'indent':
      return indent(data, action.id);
    case 'outdent':
      return outdent(data, action.id);
    case 'addList': {
      const name = action.list.name.trim();
      if (!action.list.id || !name) return data;
      if (data.lists.some((l) => l.id === action.list.id)) return data;
      return { ...data, lists: [...data.lists, { ...action.list, name }] };
    }
    case 'renameList': {
      const name = action.name.trim();
      if (!name) return data;
      return {
        ...data,
        lists: data.lists.map((l) => (l.id === action.id ? { ...l, name } : l)),
      };
    }
    case 'deleteList': {
      const lists = data.lists.filter((l) => l.id !== action.id);
      // The window always has somewhere to put a reminder.
      if (lists.length === 0) {
        return {
          ...data,
          lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, createdAt: 0 }],
          items: [],
        };
      }
      return { ...data, lists, items: data.items.filter((i) => i.listId !== action.id) };
    }
  }
}
