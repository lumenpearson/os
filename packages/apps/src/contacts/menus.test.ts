import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildContactsMenus, type ContactsActions, type ContactsMenuState } from './menus';

const state: ContactsMenuState = {
  sort: 'first',
  showGroups: true,
  hasSelection: true,
  isFavourite: false,
  editing: false,
};

function actions(): ContactsActions {
  return {
    newContact: vi.fn(),
    importVcard: vi.fn(),
    exportVcard: vi.fn(),
    close: vi.fn(),
    find: vi.fn(),
    editContact: vi.fn(),
    saveContact: vi.fn(),
    cancelEdit: vi.fn(),
    deleteContact: vi.fn(),
    toggleFavourite: vi.fn(),
    findDuplicates: vi.fn(),
    setSort: vi.fn(),
    toggleGroups: vi.fn(),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('the menubar', () => {
  it('has the three menus the app promises', () => {
    expect(buildContactsMenus(state, actions()).map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
    ]);
  });

  it('gives every command a shortcut', () => {
    for (const menu of buildContactsMenus(state, actions())) {
      for (const entry of menu.items) {
        if (entry.type === 'separator') continue;
        expect(entry.shortcut, `${menu.id} > ${entry.id}`).toBeTruthy();
      }
    }
  });

  it('uses each shortcut once', () => {
    const keys = buildContactsMenus(state, actions())
      .flatMap((menu) => menu.items)
      .map((entry) => entry.shortcut)
      .filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('runs the action the item names', () => {
    const handlers = actions();
    const menus = buildContactsMenus(state, handlers);
    item(menus, 'file', 'new').onSelect?.();
    item(menus, 'file', 'import').onSelect?.();
    item(menus, 'edit', 'delete').onSelect?.();
    expect(handlers.newContact).toHaveBeenCalledOnce();
    expect(handlers.importVcard).toHaveBeenCalledOnce();
    expect(handlers.deleteContact).toHaveBeenCalledOnce();
  });

  it('asks for the sort the item shows', () => {
    const handlers = actions();
    item(buildContactsMenus(state, handlers), 'view', 'sort-last').onSelect?.();
    expect(handlers.setSort).toHaveBeenCalledWith('last');
  });

  it('ticks the sort in force and the sidebar when it is open', () => {
    const menus = buildContactsMenus({ ...state, sort: 'last' }, actions());
    expect(item(menus, 'view', 'sort-first').checked).toBe(false);
    expect(item(menus, 'view', 'sort-last').checked).toBe(true);
    expect(item(menus, 'view', 'groups').checked).toBe(true);
  });

  it('greys out what needs a selection when there is none', () => {
    const menus = buildContactsMenus({ ...state, hasSelection: false }, actions());
    expect(item(menus, 'edit', 'edit-contact').enabled).toBe(false);
    expect(item(menus, 'edit', 'delete').enabled).toBe(false);
    expect(item(menus, 'edit', 'favourite').enabled).toBe(false);
    expect(item(menus, 'file', 'new').enabled).toBeUndefined();
  });

  it('offers Save and Discard only while editing', () => {
    const reading = buildContactsMenus(state, actions());
    expect(item(reading, 'edit', 'save').enabled).toBe(false);
    expect(item(reading, 'edit', 'cancel').enabled).toBe(false);

    const editing = buildContactsMenus({ ...state, editing: true }, actions());
    expect(item(editing, 'edit', 'save').enabled).toBe(true);
    expect(item(editing, 'edit', 'edit-contact').enabled).toBe(false);
    expect(item(editing, 'edit', 'delete').enabled).toBe(false);
  });

  it('ticks Favourite for a starred contact', () => {
    expect(item(buildContactsMenus(state, actions()), 'edit', 'favourite').checked).toBe(false);
    expect(
      item(buildContactsMenus({ ...state, isFavourite: true }, actions()), 'edit', 'favourite')
        .checked,
    ).toBe(true);
  });

  it('marks deleting as the destructive one', () => {
    expect(item(buildContactsMenus(state, actions()), 'edit', 'delete').danger).toBe(true);
  });
});
