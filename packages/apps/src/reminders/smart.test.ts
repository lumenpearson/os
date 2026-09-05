import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELECTION,
  defaultDueFor,
  itemsFor,
  listCounts,
  matchesQuery,
  matchesSmart,
  parseSelection,
  rowsOf,
  type Selection,
  SMART_LISTS,
  sectionsFor,
  selectionId,
  smartCounts,
  stepRow,
  summarize,
  toRows,
} from './smart';
import { DEFAULT_LIST_ID, normalizeData, type Reminder, type RemindersData } from './store';

const TODAY = '2026-09-04';

function item(id: string, patch: Partial<Reminder> = {}): Reminder {
  return {
    id,
    listId: DEFAULT_LIST_ID,
    title: id,
    notes: '',
    due: null,
    dueTime: null,
    priority: 'none',
    completed: false,
    completedAt: null,
    flagged: false,
    parentId: null,
    repeat: null,
    createdAt: 0,
    ...patch,
  };
}

const LISTS = [
  { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
  { id: 'work', name: 'Work', createdAt: 0 },
];

function data(items: Reminder[]): RemindersData {
  return normalizeData({ version: 1, lists: LISTS, items, prefs: {} });
}

const view = (patch: Partial<{ showCompleted: boolean; query: string }> = {}) => ({
  today: TODAY,
  showCompleted: false,
  query: '',
  ...patch,
});

const overdue = item('overdue', { due: '2026-09-01' });
const dueToday = item('today', { due: TODAY });
const soon = item('soon', { due: '2026-09-06' });
const later = item('later', { due: '2026-10-01' });
const someday = item('someday');
const flagged = item('flagged', { flagged: true });
const done = item('done', { completed: true, completedAt: 1, due: TODAY });
const all = [overdue, dueToday, soon, later, someday, flagged, done];

describe('matchesSmart', () => {
  it('puts today and everything behind it in Today', () => {
    expect(matchesSmart(overdue, 'today', TODAY)).toBe(true);
    expect(matchesSmart(dueToday, 'today', TODAY)).toBe(true);
    expect(matchesSmart(soon, 'today', TODAY)).toBe(false);
    expect(matchesSmart(someday, 'today', TODAY)).toBe(false);
  });

  it('keeps Scheduled ahead of today', () => {
    expect(matchesSmart(soon, 'scheduled', TODAY)).toBe(true);
    expect(matchesSmart(later, 'scheduled', TODAY)).toBe(true);
    expect(matchesSmart(dueToday, 'scheduled', TODAY)).toBe(false);
    expect(matchesSmart(overdue, 'scheduled', TODAY)).toBe(false);
    expect(matchesSmart(someday, 'scheduled', TODAY)).toBe(false);
  });

  it('answers Flagged and All', () => {
    expect(matchesSmart(flagged, 'flagged', TODAY)).toBe(true);
    expect(matchesSmart(someday, 'flagged', TODAY)).toBe(false);
    expect(matchesSmart(someday, 'all', TODAY)).toBe(true);
  });

  it('leaves the completed out of every list but Completed', () => {
    for (const id of SMART_LISTS) {
      expect(matchesSmart(done, id, TODAY)).toBe(id === 'completed');
    }
    const alsoFlagged = { ...done, flagged: true };
    expect(matchesSmart(alsoFlagged, 'flagged', TODAY)).toBe(false);
    expect(matchesSmart(alsoFlagged, 'flagged', TODAY, true)).toBe(true);
  });

  it('shows the completed again when the window asks for them', () => {
    expect(matchesSmart(done, 'today', TODAY, true)).toBe(true);
    expect(matchesSmart(done, 'all', TODAY, true)).toBe(true);
  });
});

describe('counts', () => {
  it('counts what is open, and the completed separately', () => {
    expect(smartCounts(all, TODAY)).toEqual({
      today: 2,
      scheduled: 2,
      flagged: 1,
      all: 6,
      completed: 1,
    });
  });

  it('counts open reminders per list', () => {
    const items = [item('a'), item('b', { listId: 'work' }), item('c', { completed: true })];
    expect(listCounts(items)).toEqual({ [DEFAULT_LIST_ID]: 1, work: 1 });
  });

  it('has nothing to count in an empty store', () => {
    expect(smartCounts([], TODAY)).toEqual({
      today: 0,
      scheduled: 0,
      flagged: 0,
      all: 0,
      completed: 0,
    });
    expect(listCounts([])).toEqual({});
  });
});

describe('selection', () => {
  it('writes and reads a selection', () => {
    const cases: Selection[] = [
      { kind: 'smart', id: 'flagged' },
      { kind: 'list', id: 'work' },
    ];
    for (const selection of cases) {
      expect(parseSelection(selectionId(selection), LISTS)).toEqual(selection);
    }
  });

  it('dates a reminder typed into Today, and nowhere else', () => {
    expect(defaultDueFor({ kind: 'smart', id: 'today' }, TODAY)).toBe(TODAY);
    expect(defaultDueFor({ kind: 'smart', id: 'all' }, TODAY)).toBeNull();
    expect(defaultDueFor({ kind: 'list', id: 'work' }, TODAY)).toBeNull();
  });

  it('falls back when the stored row is gone', () => {
    expect(parseSelection('list:deleted', LISTS)).toEqual(DEFAULT_SELECTION);
    expect(parseSelection('smart:invented', LISTS)).toEqual(DEFAULT_SELECTION);
    expect(parseSelection('', LISTS)).toEqual(DEFAULT_SELECTION);
  });
});

describe('the rows a selection shows', () => {
  it('filters a list to its own reminders', () => {
    const store = data([item('a'), item('b', { listId: 'work' })]);
    const rows = itemsFor(store, { kind: 'list', id: 'work' }, view());
    expect(rows.map((i) => i.id)).toEqual(['b']);
  });

  it('hides completed reminders until asked', () => {
    const store = data([item('a'), item('b', { completed: true, completedAt: 1 })]);
    const list: Selection = { kind: 'list', id: DEFAULT_LIST_ID };
    expect(itemsFor(store, list, view()).map((i) => i.id)).toEqual(['a']);
    expect(itemsFor(store, list, view({ showCompleted: true })).map((i) => i.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('searches titles and notes on every word', () => {
    const store = data([
      item('a', { title: 'Buy oat milk' }),
      item('b', { title: 'Call plumber', notes: 'about the milk float' }),
      item('c', { title: 'Book train' }),
    ]);
    const found = (query: string) =>
      itemsFor(store, { kind: 'smart', id: 'all' }, view({ query })).map((i) => i.id);
    expect(found('milk')).toEqual(['a', 'b']);
    expect(found('MILK BUY')).toEqual(['a']);
    expect(found('  ')).toEqual(['a', 'b', 'c']);
    expect(found('zebra')).toEqual([]);
    expect(matchesQuery(item('x', { title: 'Milk' }), 'mil')).toBe(true);
  });

  it('indents a subtask only when its parent is on screen too', () => {
    const store = data([
      item('a'),
      item('a1', { parentId: 'a', due: '2026-09-06' }),
      item('b', { due: '2026-09-06' }),
    ]);
    const inList = toRows(itemsFor(store, { kind: 'list', id: DEFAULT_LIST_ID }, view()));
    expect(inList.map((r) => [r.item.id, r.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['b', 0],
    ]);
    // Scheduled shows the subtask without its parent, so it stands on its own.
    const scheduled = toRows(itemsFor(store, { kind: 'smart', id: 'scheduled' }, view()));
    expect(scheduled.map((r) => [r.item.id, r.depth])).toEqual([
      ['a1', 0],
      ['b', 0],
    ]);
  });
});

describe('sections', () => {
  it('gives one ungrouped section to every list but Scheduled', () => {
    const store = data([item('a'), item('b')]);
    const sections = sectionsFor(store, { kind: 'smart', id: 'all' }, view());
    expect(sections).toHaveLength(1);
    expect(sections[0]?.date).toBeNull();
    expect(sections[0]?.rows).toHaveLength(2);
  });

  it('groups Scheduled by day, in date order', () => {
    const store = data([
      item('late', { due: '2026-10-01' }),
      item('soon', { due: '2026-09-06' }),
      item('alsoSoon', { due: '2026-09-06' }),
    ]);
    const sections = sectionsFor(store, { kind: 'smart', id: 'scheduled' }, view());
    expect(sections.map((s) => [s.date, s.rows.map((r) => r.item.id)])).toEqual([
      ['2026-09-06', ['soon', 'alsoSoon']],
      ['2026-10-01', ['late']],
    ]);
  });

  it('has no sections at all when nothing matches', () => {
    expect(sectionsFor(data([]), { kind: 'smart', id: 'today' }, view())).toEqual([]);
  });
});

describe('the cursor', () => {
  const rows = toRows([item('a'), item('b'), item('c')]);

  it('steps and stops at the ends', () => {
    expect(stepRow(rows, 'a', 1)).toBe('b');
    expect(stepRow(rows, 'c', 1)).toBe('c');
    expect(stepRow(rows, 'a', -1)).toBe('a');
    expect(stepRow(rows, 'b', -1)).toBe('a');
  });

  it('lands on an end when nothing is focused', () => {
    expect(stepRow(rows, null, 1)).toBe('a');
    expect(stepRow(rows, null, -1)).toBe('c');
    expect(stepRow(rows, 'gone', 1)).toBe('a');
    expect(stepRow([], null, 1)).toBeNull();
  });

  it('counts what the status bar prints', () => {
    const store = data([item('a'), item('b', { completed: true, completedAt: 1 })]);
    const sections = sectionsFor(
      store,
      { kind: 'list', id: DEFAULT_LIST_ID },
      view({ showCompleted: true }),
    );
    expect(summarize(rowsOf(sections))).toEqual({ open: 1, completed: 1 });
  });
});
