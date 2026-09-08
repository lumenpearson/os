import { describe, expect, it } from 'vitest';
import {
  canIndent,
  canOutdent,
  createReminder,
  DEFAULT_LIST_ID,
  describeRepeat,
  displayTitle,
  newId,
  nextDue,
  normalizeData,
  normalizeItem,
  normalizeRepeat,
  orderItems,
  type Reminder,
  type RemindersData,
  remindersReducer,
  siblingsOf,
  UNTITLED,
} from './store';

const NOW = 1_700_000_000_000;

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
    createdAt: NOW,
    ...patch,
  };
}

function data(
  items: Reminder[],
  lists = [{ id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 }],
): RemindersData {
  return normalizeData({ version: 1, lists, items, prefs: {} });
}

const ids = (state: RemindersData) => state.items.map((i) => i.id);

describe('normalizeData', () => {
  it('falls back to the defaults for anything unreadable', () => {
    for (const value of [null, undefined, 'nonsense', 42, []]) {
      const parsed = normalizeData(value);
      expect(parsed.items).toEqual([]);
      expect(parsed.lists.map((l) => l.id)).toEqual([DEFAULT_LIST_ID]);
      expect(parsed.prefs).toEqual({
        selection: 'smart:today',
        showCompleted: false,
        showSidebar: true,
      });
    }
  });

  it('keeps a file it wrote itself', () => {
    const before = data([item('a', { due: '2026-09-05', dueTime: 540 })]);
    expect(normalizeData(before)).toEqual(before);
  });

  it('drops entries that are not reminders', () => {
    const parsed = normalizeData({ items: [null, 'x', {}, { id: '  ' }, { id: 'a' }] });
    expect(ids(parsed)).toEqual(['a']);
  });

  it('keeps the first of two reminders sharing an id', () => {
    const parsed = normalizeData({
      items: [
        { id: 'a', title: 'first' },
        { id: 'a', title: 'second' },
      ],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.title).toBe('first');
  });

  it('moves a reminder whose list is gone to the first list', () => {
    const parsed = normalizeData({
      lists: [
        { id: 'work', name: 'Work' },
        { id: 'home', name: 'Home' },
      ],
      items: [
        { id: 'a', listId: 'gone' },
        { id: 'b', listId: 'home' },
      ],
    });
    expect(parsed.items.map((i) => i.listId)).toEqual(['work', 'home']);
  });

  it('caps subtasks at one level and promotes the orphans', () => {
    const parsed = normalizeData({
      items: [
        { id: 'a' },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
        { id: 'd', parentId: 'missing' },
        { id: 'e', parentId: 'e' },
      ],
    });
    const parents = Object.fromEntries(parsed.items.map((i) => [i.id, i.parentId]));
    expect(parents).toEqual({ a: null, b: 'a', c: null, d: null, e: null });
  });

  it('keeps a subtask in its parent list', () => {
    const parsed = normalizeData({
      lists: [
        { id: 'work', name: 'Work' },
        { id: 'home', name: 'Home' },
      ],
      items: [
        { id: 'a', listId: 'home' },
        { id: 'b', listId: 'work', parentId: 'a' },
      ],
    });
    expect(parsed.items.map((i) => i.listId)).toEqual(['home', 'home']);
  });

  it('puts the array in display order', () => {
    const parsed = normalizeData({
      items: [
        { id: 'a' },
        { id: 'b' },
        { id: 'a2', parentId: 'a' },
        { id: 'b1', parentId: 'b' },
        { id: 'a1', parentId: 'a' },
      ],
    });
    expect(ids(parsed)).toEqual(['a', 'a2', 'a1', 'b', 'b1']);
  });

  it('drops a time and a rule that have no date to hang on', () => {
    const parsed = normalizeItem({
      id: 'a',
      dueTime: 540,
      repeat: { freq: 'weekly', interval: 2 },
    });
    expect(parsed).toMatchObject({ due: null, dueTime: null, repeat: null });
  });

  it('rejects a due date the calendar does not have', () => {
    expect(normalizeItem({ id: 'a', due: '2026-02-30' })?.due).toBeNull();
    expect(normalizeItem({ id: 'a', due: '2026-02-28' })?.due).toBe('2026-02-28');
  });

  it('reads a repeat rule or refuses it', () => {
    expect(normalizeRepeat({ freq: 'weekly', interval: 2 })).toEqual({
      freq: 'weekly',
      interval: 2,
    });
    expect(normalizeRepeat({ freq: 'hourly', interval: 1 })).toBeNull();
    expect(normalizeRepeat(null)).toBeNull();
    expect(normalizeRepeat({ freq: 'daily' })?.interval).toBe(1);
    expect(normalizeRepeat({ freq: 'daily', interval: 0 })?.interval).toBe(1);
    expect(normalizeRepeat({ freq: 'daily', interval: 5000 })?.interval).toBe(999);
    expect(normalizeRepeat({ freq: 'daily', interval: 2.7 })?.interval).toBe(2);
  });

  it('only lets a completed reminder carry a completion time', () => {
    expect(normalizeItem({ id: 'a', completedAt: 5 })?.completedAt).toBeNull();
    expect(normalizeItem({ id: 'a', completed: true, completedAt: 5 })?.completedAt).toBe(5);
    expect(normalizeItem({ id: 'a', completed: true })?.completedAt).toBe(0);
  });

  it('clamps a time of day onto the clock face', () => {
    expect(normalizeItem({ id: 'a', due: '2026-09-05', dueTime: 5000 })?.dueTime).toBe(1439);
    expect(normalizeItem({ id: 'a', due: '2026-09-05', dueTime: -1 })?.dueTime).toBe(0);
  });

  it('restores a list when the file has none', () => {
    expect(normalizeData({ lists: [], items: [{ id: 'a' }] }).lists).toEqual([
      { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
    ]);
  });
});

describe('add and edit', () => {
  it('appends to the end of the list', () => {
    const before = data([item('a')]);
    const after = remindersReducer(before, { type: 'add', item: item('b') });
    expect(ids(after)).toEqual(['a', 'b']);
  });

  it('refuses an id it already has, and a list it does not', () => {
    const before = data([item('a')]);
    expect(remindersReducer(before, { type: 'add', item: item('a') })).toBe(before);
    expect(remindersReducer(before, { type: 'add', item: item('b', { listId: 'gone' }) })).toBe(
      before,
    );
  });

  it('files a new subtask behind its parent', () => {
    const before = data([item('a'), item('b')]);
    const after = remindersReducer(before, {
      type: 'add',
      item: item('a1', { parentId: 'a' }),
    });
    expect(ids(after)).toEqual(['a', 'a1', 'b']);
  });

  it('edits the fields it is given and leaves the rest', () => {
    const before = data([item('a', { due: '2026-09-05', dueTime: 540 })]);
    const after = remindersReducer(before, {
      type: 'edit',
      id: 'a',
      patch: { title: 'Milk', priority: 'high' },
    });
    expect(after.items[0]).toMatchObject({
      title: 'Milk',
      priority: 'high',
      due: '2026-09-05',
      dueTime: 540,
    });
  });

  it('clearing the date takes the time and the rule with it', () => {
    const before = data([
      item('a', { due: '2026-09-05', dueTime: 540, repeat: { freq: 'daily', interval: 1 } }),
    ]);
    const after = remindersReducer(before, { type: 'edit', id: 'a', patch: { due: null } });
    expect(after.items[0]).toMatchObject({ due: null, dueTime: null, repeat: null });
  });

  it('ignores an edit to a reminder that is gone', () => {
    const before = data([item('a')]);
    expect(remindersReducer(before, { type: 'edit', id: 'z', patch: { title: 'x' } })).toBe(before);
  });
});

describe('completing', () => {
  it('ticks a plain reminder and stamps the moment', () => {
    const before = data([item('a')]);
    const after = remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' });
    expect(after.items[0]).toMatchObject({ completed: true, completedAt: NOW });
    expect(after.items).toHaveLength(1);
  });

  it('ticks the subtasks with their parent', () => {
    const before = data([item('a'), item('a1', { parentId: 'a' }), item('b')]);
    const after = remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' });
    expect(after.items.map((i) => [i.id, i.completed])).toEqual([
      ['a', true],
      ['a1', true],
      ['b', false],
    ]);
  });

  it('leaves a reminder that is already done alone', () => {
    const before = data([item('a', { completed: true, completedAt: 1 })]);
    expect(remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' })).toBe(
      before,
    );
  });

  it('schedules the next occurrence instead of just ticking a repeat', () => {
    const before = data([
      item('a', { due: '2026-09-05', dueTime: 540, repeat: { freq: 'weekly', interval: 1 } }),
      item('b'),
    ]);
    const after = remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' });
    expect(ids(after)).toEqual(['a', 'r2', 'b']);
    expect(after.items[0]).toMatchObject({
      id: 'a',
      completed: true,
      completedAt: NOW,
      due: '2026-09-05',
      // The filed occurrence stops repeating; the rule went to the next one.
      repeat: null,
    });
    expect(after.items[1]).toMatchObject({
      id: 'r2',
      completed: false,
      completedAt: null,
      due: '2026-09-12',
      dueTime: 540,
      repeat: { freq: 'weekly', interval: 1 },
      createdAt: NOW,
    });
  });

  it('counts the next occurrence from the due date, not the day it was ticked', () => {
    const before = data([
      item('a', { due: '2026-01-31', repeat: { freq: 'monthly', interval: 1 } }),
    ]);
    const after = remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' });
    expect(after.items[1]?.due).toBe('2026-02-28');
  });

  it('has nothing to schedule when a repeat lost its date', () => {
    const before = data([item('a', { repeat: { freq: 'daily', interval: 1 } })]);
    const after = remindersReducer(before, { type: 'complete', id: 'a', now: NOW, nextId: 'r2' });
    expect(after.items).toHaveLength(1);
    expect(after.items[0]?.completed).toBe(true);
  });

  it('steps a rule by its interval', () => {
    expect(nextDue('2026-09-05', { freq: 'daily', interval: 3 })).toBe('2026-09-08');
    expect(nextDue('2026-09-05', { freq: 'weekly', interval: 2 })).toBe('2026-09-19');
    expect(nextDue('2026-09-05', { freq: 'monthly', interval: 2 })).toBe('2026-11-05');
    expect(nextDue('2024-02-29', { freq: 'yearly', interval: 1 })).toBe('2025-02-28');
  });

  it('puts a completed reminder back', () => {
    const before = data([item('a', { completed: true, completedAt: NOW })]);
    const after = remindersReducer(before, { type: 'uncomplete', id: 'a' });
    expect(after.items[0]).toMatchObject({ completed: false, completedAt: null });
  });
});

describe('deleting and moving', () => {
  it('takes the subtasks with the parent', () => {
    const before = data([
      item('a'),
      item('a1', { parentId: 'a' }),
      item('a2', { parentId: 'a' }),
      item('b'),
    ]);
    const after = remindersReducer(before, { type: 'delete', id: 'a' });
    expect(ids(after)).toEqual(['b']);
  });

  it('deletes a subtask on its own', () => {
    const before = data([item('a'), item('a1', { parentId: 'a' })]);
    expect(ids(remindersReducer(before, { type: 'delete', id: 'a1' }))).toEqual(['a']);
  });

  it('ignores a reminder that is gone', () => {
    const before = data([item('a')]);
    expect(remindersReducer(before, { type: 'delete', id: 'z' })).toBe(before);
  });

  it('moves a reminder and its subtasks to another list', () => {
    const before = data(
      [item('a'), item('a1', { parentId: 'a' })],
      [
        { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
        { id: 'work', name: 'Work', createdAt: 0 },
      ],
    );
    const after = remindersReducer(before, { type: 'move', id: 'a', listId: 'work' });
    expect(after.items.map((i) => i.listId)).toEqual(['work', 'work']);
    expect(after.items[1]?.parentId).toBe('a');
  });

  it('a subtask moved to another list stops being one', () => {
    const before = data(
      [item('a'), item('a1', { parentId: 'a' })],
      [
        { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
        { id: 'work', name: 'Work', createdAt: 0 },
      ],
    );
    const after = remindersReducer(before, { type: 'move', id: 'a1', listId: 'work' });
    expect(after.items.map((i) => [i.id, i.listId, i.parentId])).toEqual([
      ['a', DEFAULT_LIST_ID, null],
      ['a1', 'work', null],
    ]);
  });

  it('refuses a list that does not exist', () => {
    const before = data([item('a')]);
    expect(remindersReducer(before, { type: 'move', id: 'a', listId: 'gone' })).toBe(before);
  });
});

describe('reordering', () => {
  it('moves a reminder past its neighbour, subtasks and all', () => {
    const before = data([item('a'), item('a1', { parentId: 'a' }), item('b'), item('c')]);
    const down = remindersReducer(before, { type: 'reorder', id: 'a', direction: 1 });
    expect(ids(down)).toEqual(['b', 'a', 'a1', 'c']);
    const back = remindersReducer(down, { type: 'reorder', id: 'a', direction: -1 });
    expect(ids(back)).toEqual(['a', 'a1', 'b', 'c']);
  });

  it('stops at the ends', () => {
    const before = data([item('a'), item('b')]);
    expect(remindersReducer(before, { type: 'reorder', id: 'a', direction: -1 })).toBe(before);
    expect(remindersReducer(before, { type: 'reorder', id: 'b', direction: 1 })).toBe(before);
  });

  it('reorders subtasks among themselves', () => {
    const before = data([
      item('a'),
      item('a1', { parentId: 'a' }),
      item('a2', { parentId: 'a' }),
      item('b'),
    ]);
    const after = remindersReducer(before, { type: 'reorder', id: 'a2', direction: -1 });
    expect(ids(after)).toEqual(['a', 'a2', 'a1', 'b']);
  });

  it('does not step over a reminder in another list', () => {
    const before = data(
      [item('a'), item('b', { listId: 'work' }), item('c')],
      [
        { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
        { id: 'work', name: 'Work', createdAt: 0 },
      ],
    );
    const after = remindersReducer(before, { type: 'reorder', id: 'a', direction: 1 });
    expect(ids(after)).toEqual(['b', 'c', 'a']);
    expect(siblingsOf(after.items, item('a')).map((i) => i.id)).toEqual(['c', 'a']);
  });
});

describe('indent and outdent', () => {
  it('makes a reminder a subtask of the one above', () => {
    const before = data([item('a'), item('b')]);
    expect(canIndent(before.items, 'b')).toBe(true);
    const after = remindersReducer(before, { type: 'indent', id: 'b' });
    expect(after.items[1]).toMatchObject({ id: 'b', parentId: 'a' });
    expect(ids(after)).toEqual(['a', 'b']);
  });

  it('files it behind the subtasks already there', () => {
    const before = data([item('a'), item('a1', { parentId: 'a' }), item('b')]);
    const after = remindersReducer(before, { type: 'indent', id: 'b' });
    expect(ids(after)).toEqual(['a', 'a1', 'b']);
    expect(after.items[2]?.parentId).toBe('a');
  });

  it('has nothing to indent under at the top of a list', () => {
    const before = data([item('a'), item('b')]);
    expect(canIndent(before.items, 'a')).toBe(false);
    expect(remindersReducer(before, { type: 'indent', id: 'a' })).toBe(before);
  });

  it('refuses to nest a reminder that has subtasks of its own', () => {
    const before = data([item('a'), item('b'), item('b1', { parentId: 'b' })]);
    expect(canIndent(before.items, 'b')).toBe(false);
    expect(remindersReducer(before, { type: 'indent', id: 'b' })).toBe(before);
  });

  it('refuses to nest a subtask deeper', () => {
    const before = data([item('a'), item('a1', { parentId: 'a' }), item('a2', { parentId: 'a' })]);
    expect(canIndent(before.items, 'a2')).toBe(false);
    expect(remindersReducer(before, { type: 'indent', id: 'a2' })).toBe(before);
  });

  it('lifts a subtask back out, behind its old parent', () => {
    const before = data([
      item('a'),
      item('a1', { parentId: 'a' }),
      item('a2', { parentId: 'a' }),
      item('b'),
    ]);
    expect(canOutdent(before.items, 'a1')).toBe(true);
    const after = remindersReducer(before, { type: 'outdent', id: 'a1' });
    expect(ids(after)).toEqual(['a', 'a2', 'a1', 'b']);
    expect(after.items[2]?.parentId).toBeNull();
  });

  it('has nothing to lift at the top level', () => {
    const before = data([item('a')]);
    expect(canOutdent(before.items, 'a')).toBe(false);
    expect(remindersReducer(before, { type: 'outdent', id: 'a' })).toBe(before);
  });
});

describe('lists', () => {
  it('adds, renames and refuses the empty', () => {
    const before = data([item('a')]);
    const added = remindersReducer(before, {
      type: 'addList',
      list: { id: 'work', name: '  Work  ', createdAt: 1 },
    });
    expect(added.lists.map((l) => l.name)).toEqual(['Reminders', 'Work']);
    expect(
      remindersReducer(added, {
        type: 'addList',
        list: { id: 'work', name: 'Again', createdAt: 2 },
      }),
    ).toBe(added);
    expect(
      remindersReducer(added, { type: 'addList', list: { id: 'x', name: '   ', createdAt: 2 } }),
    ).toBe(added);
    const renamed = remindersReducer(added, { type: 'renameList', id: 'work', name: 'Office' });
    expect(renamed.lists[1]?.name).toBe('Office');
    expect(remindersReducer(renamed, { type: 'renameList', id: 'work', name: ' ' })).toBe(renamed);
  });

  it('deleting a list deletes its reminders', () => {
    const before = data(
      [item('a'), item('b', { listId: 'work' })],
      [
        { id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 },
        { id: 'work', name: 'Work', createdAt: 0 },
      ],
    );
    const after = remindersReducer(before, { type: 'deleteList', id: 'work' });
    expect(after.lists.map((l) => l.id)).toEqual([DEFAULT_LIST_ID]);
    expect(ids(after)).toEqual(['a']);
  });

  it('always leaves one list standing', () => {
    const before = data([item('a')]);
    const after = remindersReducer(before, { type: 'deleteList', id: DEFAULT_LIST_ID });
    expect(after.lists).toEqual([{ id: DEFAULT_LIST_ID, name: 'Reminders', createdAt: 0 }]);
    expect(after.items).toEqual([]);
  });
});

describe('helpers', () => {
  it('names a reminder that was left blank', () => {
    expect(displayTitle(item('a', { title: '  ' }))).toBe(UNTITLED);
    expect(displayTitle(item('a', { title: ' Milk ' }))).toBe('Milk');
  });

  it('says a repeat rule in words', () => {
    expect(describeRepeat(null)).toBe('');
    expect(describeRepeat({ freq: 'weekly', interval: 1 })).toBe('Every week');
    expect(describeRepeat({ freq: 'daily', interval: 3 })).toBe('Every 3 days');
    expect(describeRepeat({ freq: 'monthly', interval: 2 })).toBe('Every 2 months');
    expect(describeRepeat({ freq: 'yearly', interval: 1 })).toBe('Every year');
  });

  it('makes a reminder from an input', () => {
    const made = createReminder({ listId: 'work', title: 'Milk', dueTime: 540 }, 'r1', NOW);
    // No date, so the time goes: `settle` runs on everything that is made.
    expect(made).toMatchObject({ id: 'r1', listId: 'work', dueTime: null, createdAt: NOW });
  });

  it('hands out ids that do not collide', () => {
    const made = new Set(Array.from({ length: 200 }, () => newId()));
    expect(made.size).toBe(200);
    expect(newId('l').startsWith('l')).toBe(true);
  });

  it('orders a shuffled array without losing anyone', () => {
    const ordered = orderItems([
      item('a1', { parentId: 'a' }),
      item('b'),
      item('a'),
      item('b1', { parentId: 'b' }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(['b', 'b1', 'a', 'a1']);
  });
});
