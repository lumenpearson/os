import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildNotesMenus, type NotesActions, type NotesMenuState } from './menus';

const state = (extra: Partial<NotesMenuState> = {}): NotesMenuState => ({
  hasNote: true,
  pinned: false,
  view: 'edit',
  sort: 'modified',
  showTags: true,
  searchFocused: false,
  ...extra,
});

function actions(): { actions: NotesActions; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name] = args;
    };
  return {
    calls,
    actions: {
      newNote: record('newNote'),
      duplicate: record('duplicate'),
      rename: record('rename'),
      togglePin: record('togglePin'),
      moveToTrash: record('moveToTrash'),
      exportMarkdown: record('exportMarkdown'),
      exportText: record('exportText'),
      close: record('close'),
      find: record('find'),
      setView: record('setView'),
      setSort: record('setSort'),
      toggleTags: record('toggleTags'),
      format: record('format'),
      link: record('link'),
      heading: record('heading'),
      list: record('list'),
      help: record('help'),
    },
  };
}

function flatten(menus: MenuTemplate[]): MenuItemTemplate[] {
  const out: MenuItemTemplate[] = [];
  const walk = (items: MenuItemTemplate[]) => {
    for (const item of items) {
      out.push(item);
      if (item.submenu) walk(item.submenu);
    }
  };
  for (const menu of menus) walk(menu.items);
  return out;
}

function find(menus: MenuTemplate[], id: string): MenuItemTemplate {
  const item = flatten(menus).find((i) => i.id === id);
  if (!item) throw new Error(`no menu item ${id}`);
  return item;
}

describe('shape', () => {
  it('offers the five menus in order', () => {
    expect(buildNotesMenus(state(), actions().actions).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'view',
      'format',
      'help',
    ]);
  });

  it('gives every item an id and a label, or makes it a separator', () => {
    for (const item of flatten(buildNotesMenus(state(), actions().actions))) {
      if (item.type === 'separator') {
        expect(item.label).toBeUndefined();
        continue;
      }
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
    }
  });

  it('binds each shortcut to exactly one command', () => {
    const shortcuts = flatten(buildNotesMenus(state(), actions().actions))
      .map((i) => i.shortcut)
      .filter((s): s is string => Boolean(s));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(shortcuts).toContain('Mod+N');
    expect(shortcuts).toContain('Mod+F');
    expect(shortcuts).toContain('Mod+B');
  });
});

describe('commands', () => {
  it('runs the action behind every leaf item', () => {
    const { actions: a, calls } = actions();
    const menus = buildNotesMenus(state(), a);
    for (const item of flatten(menus)) item.onSelect?.();
    expect(Object.keys(calls).sort()).toEqual(
      [
        'close',
        'duplicate',
        'exportMarkdown',
        'exportText',
        'find',
        'format',
        'heading',
        'link',
        'list',
        'moveToTrash',
        'newNote',
        'rename',
        'setSort',
        'setView',
        'toggleTags',
        'togglePin',
        'help',
      ].sort(),
    );
  });

  it('passes the mode, the level and the style the item stands for', () => {
    const { actions: a, calls } = actions();
    const menus = buildNotesMenus(state(), a);
    find(menus, 'view-split').onSelect?.();
    expect(calls.setView).toEqual(['split']);
    find(menus, 'sort-title').onSelect?.();
    expect(calls.setSort).toEqual(['title']);
    find(menus, 'italic').onSelect?.();
    expect(calls.format).toEqual(['italic']);
    find(menus, 'heading-3').onSelect?.();
    expect(calls.heading).toEqual([3]);
    find(menus, 'heading-0').onSelect?.();
    expect(calls.heading).toEqual([0]);
    find(menus, 'list-task').onSelect?.();
    expect(calls.list).toEqual(['task']);
  });

  it('marks Move to Trash as the dangerous one', () => {
    const menus = buildNotesMenus(state(), actions().actions);
    expect(
      flatten(menus)
        .filter((i) => i.danger)
        .map((i) => i.id),
    ).toEqual(['trash']);
  });
});

describe('state', () => {
  it('stands down the document commands when no note is open', () => {
    const menus = buildNotesMenus(state({ hasNote: false }), actions().actions);
    for (const id of ['duplicate', 'rename', 'pin', 'export-markdown', 'export-text', 'trash']) {
      expect(find(menus, id).enabled).toBe(false);
    }
    expect(find(menus, 'new').enabled).not.toBe(false);
    expect(find(menus, 'close').enabled).not.toBe(false);
    expect(find(menus, 'find').enabled).not.toBe(false);
  });

  it('lets the search field keep the formatting keys while it has the caret', () => {
    const menus = buildNotesMenus(state({ searchFocused: true }), actions().actions);
    for (const id of ['bold', 'italic', 'code', 'link', 'heading', 'heading-1', 'list-bullet']) {
      expect(find(menus, id).enabled).toBe(false);
    }
    const editing = buildNotesMenus(state(), actions().actions);
    expect(find(editing, 'bold').enabled).toBe(true);
  });

  it('ticks the view and the sort in force', () => {
    const menus = buildNotesMenus(state({ view: 'preview', sort: 'title' }), actions().actions);
    expect(find(menus, 'view-preview')).toMatchObject({ type: 'radio', checked: true });
    expect(find(menus, 'view-edit').checked).toBe(false);
    expect(find(menus, 'sort-title')).toMatchObject({ type: 'radio', checked: true });
    expect(find(menus, 'sort-modified').checked).toBe(false);
  });

  it('ticks the pin and the tag rail when they are on', () => {
    const on = buildNotesMenus(state({ pinned: true, showTags: true }), actions().actions);
    expect(find(on, 'pin')).toMatchObject({ type: 'checkbox', checked: true });
    expect(find(on, 'show-tags')).toMatchObject({ type: 'checkbox', checked: true });
    const off = buildNotesMenus(state({ pinned: false, showTags: false }), actions().actions);
    expect(find(off, 'pin').checked).toBe(false);
    expect(find(off, 'show-tags').checked).toBe(false);
  });

  it('reads the same whether a command is clicked or typed', () => {
    const togglePin = vi.fn();
    const menus = buildNotesMenus(state({ pinned: true }), { ...actions().actions, togglePin });
    const item = find(menus, 'pin');
    expect(item.shortcut).toBe('Mod+P');
    item.onSelect?.();
    expect(togglePin).toHaveBeenCalledTimes(1);
  });
});
