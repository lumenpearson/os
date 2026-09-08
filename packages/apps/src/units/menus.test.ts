import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from './catalogue';
import { buildUnitsMenus, type UnitsMenuActions, type UnitsMenuState } from './menus';

const state: UnitsMenuState = {
  category: 'length',
  hasResult: true,
  hasRecents: true,
  showRecents: true,
};

function actions(): UnitsMenuActions {
  return {
    close: vi.fn(),
    copyResult: vi.fn(),
    swapUnits: vi.fn(),
    clearRecents: vi.fn(),
    setCategory: vi.fn(),
    stepCategory: vi.fn(),
    toggleRecents: vi.fn(),
  };
}

const menu = (menus: MenuTemplate[], id: string) => menus.find((m) => m.id === id);

function item(menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate {
  const found = menu(menus, menuId)?.items.find((i) => i.id === itemId);
  if (!found) throw new Error(`no ${menuId} > ${itemId}`);
  return found;
}

describe('the menubar', () => {
  it('offers File, Edit and View', () => {
    expect(buildUnitsMenus(state, actions()).map((m) => m.id)).toEqual(['file', 'edit', 'view']);
  });

  it('gives every command that does something a shortcut', () => {
    const menus = buildUnitsMenus(state, actions());
    for (const id of ['close']) expect(item(menus, 'file', id).shortcut).toBeTruthy();
    for (const id of ['copy-result', 'swap']) expect(item(menus, 'edit', id).shortcut).toBeTruthy();
    for (const id of ['previous-category', 'next-category', 'recents']) {
      expect(item(menus, 'view', id).shortcut).toBeTruthy();
    }
  });

  it('never uses one shortcut for two commands', () => {
    const shortcuts = buildUnitsMenus(state, actions())
      .flatMap((m) => m.items)
      .map((i) => i.shortcut)
      .filter((s): s is string => typeof s === 'string');
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});

describe('Edit', () => {
  it('runs the command it names', () => {
    const acts = actions();
    const menus = buildUnitsMenus(state, acts);
    item(menus, 'edit', 'copy-result').onSelect?.();
    item(menus, 'edit', 'swap').onSelect?.();
    item(menus, 'edit', 'clear-recents').onSelect?.();
    item(menus, 'file', 'close').onSelect?.();
    expect(acts.copyResult).toHaveBeenCalledOnce();
    expect(acts.swapUnits).toHaveBeenCalledOnce();
    expect(acts.clearRecents).toHaveBeenCalledOnce();
    expect(acts.close).toHaveBeenCalledOnce();
  });

  it('greys out Copy Result when there is nothing to copy', () => {
    const menus = buildUnitsMenus({ ...state, hasResult: false }, actions());
    expect(item(menus, 'edit', 'copy-result').enabled).toBe(false);
    expect(item(buildUnitsMenus(state, actions()), 'edit', 'copy-result').enabled).toBe(true);
  });

  it('greys out Clear Recents when the list is already empty', () => {
    const menus = buildUnitsMenus({ ...state, hasRecents: false }, actions());
    expect(item(menus, 'edit', 'clear-recents').enabled).toBe(false);
  });
});

describe('View', () => {
  it('lists every category as a radio item', () => {
    const menus = buildUnitsMenus(state, actions());
    for (const category of CATEGORIES) {
      const entry = item(menus, 'view', `category-${category.id}`);
      expect(entry.type).toBe('radio');
      expect(entry.label).toBe(category.name);
    }
  });

  it('ticks exactly the category in use', () => {
    const menus = buildUnitsMenus({ ...state, category: 'fuel' }, actions());
    const ticked = (menu(menus, 'view')?.items ?? []).filter(
      (i) => i.type === 'radio' && i.checked,
    );
    expect(ticked.map((i) => i.id)).toEqual(['category-fuel']);
  });

  it('switches category when one is picked', () => {
    const acts = actions();
    const menus = buildUnitsMenus(state, acts);
    item(menus, 'view', 'category-temperature').onSelect?.();
    expect(acts.setCategory).toHaveBeenCalledWith('temperature');
  });

  it('steps forward and back through the categories', () => {
    const acts = actions();
    const menus = buildUnitsMenus(state, acts);
    item(menus, 'view', 'next-category').onSelect?.();
    item(menus, 'view', 'previous-category').onSelect?.();
    expect(acts.stepCategory).toHaveBeenNthCalledWith(1, 1);
    expect(acts.stepCategory).toHaveBeenNthCalledWith(2, -1);
  });

  it('shows the recents list as a checkbox that reads the current state', () => {
    expect(item(buildUnitsMenus(state, actions()), 'view', 'recents').checked).toBe(true);
    const off = buildUnitsMenus({ ...state, showRecents: false }, actions());
    expect(item(off, 'view', 'recents').checked).toBe(false);
    const acts = actions();
    item(buildUnitsMenus(state, acts), 'view', 'recents').onSelect?.();
    expect(acts.toggleRecents).toHaveBeenCalledOnce();
  });
});
