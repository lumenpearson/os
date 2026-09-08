import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildRemindersMenus, type RemindersActions, type RemindersMenuState } from './menus';
import { SMART_LISTS } from './smart';

function actions(): RemindersActions {
  return {
    newReminder: vi.fn(),
    newList: vi.fn(),
    close: vi.fn(),
    find: vi.fn(),
    editDetails: vi.fn(),
    toggleCompleted: vi.fn(),
    toggleFlagged: vi.fn(),
    indent: vi.fn(),
    outdent: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    deleteItem: vi.fn(),
    select: vi.fn(),
    toggleShowCompleted: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

const state: RemindersMenuState = {
  selection: { kind: 'smart', id: 'today' },
  hasFocus: false,
  focusedCompleted: false,
  focusedFlagged: false,
  canIndent: false,
  canOutdent: false,
  showCompleted: false,
  showSidebar: true,
};

function item(menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate | undefined {
  return menus.find((m) => m.id === menuId)?.items.find((i) => i.id === itemId);
}

describe('buildRemindersMenus', () => {
  it('offers File, Edit and View', () => {
    expect(buildRemindersMenus(state, actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'view',
    ]);
  });

  it('kills the row commands while no row has the cursor', () => {
    const menus = buildRemindersMenus(state, actions());
    for (const id of ['edit-details', 'toggle-completed', 'toggle-flagged', 'delete']) {
      expect(item(menus, 'edit', id)?.enabled).toBe(false);
    }
    // Find and the File commands stay live: they do not need a row.
    expect(item(menus, 'edit', 'find')?.enabled).toBeUndefined();
    expect(item(menus, 'file', 'new-reminder')?.enabled).toBeUndefined();
  });

  it('wakes them when a row is focused', () => {
    const menus = buildRemindersMenus({ ...state, hasFocus: true }, actions());
    expect(item(menus, 'edit', 'delete')?.enabled).toBe(true);
    expect(item(menus, 'edit', 'move-up')?.enabled).toBe(true);
    // Nesting still depends on where the row sits.
    expect(item(menus, 'edit', 'indent')?.enabled).toBe(false);
    expect(item(menus, 'edit', 'outdent')?.enabled).toBe(false);
    const nested = buildRemindersMenus(
      { ...state, hasFocus: true, canIndent: true, canOutdent: true },
      actions(),
    );
    expect(item(nested, 'edit', 'indent')?.enabled).toBe(true);
    expect(item(nested, 'edit', 'outdent')?.enabled).toBe(true);
  });

  it('names the command after what it would do', () => {
    const open = buildRemindersMenus({ ...state, hasFocus: true }, actions());
    expect(item(open, 'edit', 'toggle-completed')?.label).toBe('Mark as Completed');
    expect(item(open, 'edit', 'toggle-flagged')?.label).toBe('Flag');
    const done = buildRemindersMenus(
      { ...state, hasFocus: true, focusedCompleted: true, focusedFlagged: true },
      actions(),
    );
    expect(item(done, 'edit', 'toggle-completed')?.label).toBe('Mark as Not Completed');
    expect(item(done, 'edit', 'toggle-flagged')?.label).toBe('Remove Flag');
  });

  it('checks the smart list on screen and no other', () => {
    const menus = buildRemindersMenus(
      { ...state, selection: { kind: 'smart', id: 'flagged' } },
      actions(),
    );
    const radios = menus
      .find((m) => m.id === 'view')
      ?.items.filter((i) => i.type === 'radio')
      .map((i) => [i.label, i.checked]);
    expect(radios).toEqual([
      ['Today', false],
      ['Scheduled', false],
      ['Flagged', true],
      ['All', false],
      ['Completed', false],
    ]);
  });

  it('checks nothing while a user list is selected', () => {
    const menus = buildRemindersMenus(
      { ...state, selection: { kind: 'list', id: 'work' } },
      actions(),
    );
    const checked = menus
      .find((m) => m.id === 'view')
      ?.items.filter((i) => i.type === 'radio' && i.checked);
    expect(checked).toEqual([]);
  });

  it('mirrors the toggles the window is in', () => {
    const menus = buildRemindersMenus(
      { ...state, showCompleted: true, showSidebar: false },
      actions(),
    );
    expect(item(menus, 'view', 'show-completed')?.checked).toBe(true);
    expect(item(menus, 'view', 'sidebar')?.checked).toBe(false);
  });

  it('carries a shortcut for every command a toolbar button also fires', () => {
    const menus = buildRemindersMenus({ ...state, hasFocus: true }, actions());
    expect(item(menus, 'file', 'new-reminder')?.shortcut).toBe('Mod+N');
    expect(item(menus, 'file', 'new-list')?.shortcut).toBe('Shift+Mod+N');
    expect(item(menus, 'edit', 'find')?.shortcut).toBe('Mod+F');
    expect(item(menus, 'view', 'sidebar')?.shortcut).toBe('Shift+Mod+S');
    expect(item(menus, 'view', 'show-completed')?.shortcut).toBe('Shift+Mod+C');
    for (const id of SMART_LISTS) {
      expect(item(menus, 'view', `smart-${id}`)?.shortcut).toMatch(/^Mod\+\d$/);
    }
  });

  it('has no two commands answering the same chord', () => {
    const menus = buildRemindersMenus({ ...state, hasFocus: true }, actions());
    const shortcuts = menus.flatMap((m) => m.items.map((i) => i.shortcut).filter(Boolean));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('runs the action the item names', () => {
    const spies = actions();
    const menus = buildRemindersMenus({ ...state, hasFocus: true }, spies);
    item(menus, 'edit', 'delete')?.onSelect?.();
    item(menus, 'view', 'smart-scheduled')?.onSelect?.();
    expect(spies.deleteItem).toHaveBeenCalledOnce();
    expect(spies.select).toHaveBeenCalledWith({ kind: 'smart', id: 'scheduled' });
  });
});
