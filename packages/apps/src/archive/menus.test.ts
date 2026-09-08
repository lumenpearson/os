import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { type ArchiveActions, type ArchiveMenuState, buildArchiveMenus } from './menus';
import { DEFAULT_SORT } from './tree';

const actions = (): ArchiveActions => ({
  open: vi.fn(),
  newArchive: vi.fn(),
  extractAll: vi.fn(),
  extractSelected: vi.fn(),
  close: vi.fn(),
  find: vi.fn(),
  setSort: vi.fn(),
  setDirection: vi.fn(),
  toggleExactBytes: vi.fn(),
  toggleDetails: vi.fn(),
  expandAll: vi.fn(),
  collapseAll: vi.fn(),
});

const state = (patch: Partial<ArchiveMenuState> = {}): ArchiveMenuState => ({
  hasArchive: true,
  hasSelection: false,
  busy: false,
  sort: DEFAULT_SORT,
  exactBytes: false,
  showDetails: true,
  ...patch,
});

const item = (menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate => {
  const found = menus.find((m) => m.id === menuId)?.items.find((i) => i.id === itemId);
  if (!found) throw new Error(`no item "${itemId}" in "${menuId}"`);
  return found;
};

const submenuItem = (menus: MenuTemplate[], itemId: string): MenuItemTemplate => {
  const found = item(menus, 'view', 'sort').submenu?.find((i) => i.id === itemId);
  if (!found) throw new Error(`no item "${itemId}" in the Sort submenu`);
  return found;
};

const shortcuts = (menus: MenuTemplate[]): string[] =>
  menus.flatMap((menu) =>
    menu.items.flatMap((entry) => [
      ...(entry.shortcut ? [entry.shortcut] : []),
      ...(entry.submenu ?? []).flatMap((sub) => (sub.shortcut ? [sub.shortcut] : [])),
    ]),
  );

describe('buildArchiveMenus', () => {
  it('has a File, an Edit and a View menu', () => {
    expect(buildArchiveMenus(state(), actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'view',
    ]);
  });

  it('gives every command in the toolbar a shortcut', () => {
    const menus = buildArchiveMenus(state(), actions());
    expect(item(menus, 'file', 'open').shortcut).toBe('Mod+O');
    expect(item(menus, 'file', 'new').shortcut).toBe('Shift+Mod+N');
    expect(item(menus, 'file', 'extract-all').shortcut).toBe('Mod+E');
    expect(item(menus, 'file', 'extract-selected').shortcut).toBe('Shift+Mod+E');
    expect(item(menus, 'edit', 'find').shortcut).toBe('Mod+F');
  });

  it('binds each command to its action', () => {
    const act = actions();
    const menus = buildArchiveMenus(state({ hasSelection: true }), act);
    item(menus, 'file', 'open').onSelect?.();
    item(menus, 'file', 'new').onSelect?.();
    item(menus, 'file', 'extract-all').onSelect?.();
    item(menus, 'file', 'extract-selected').onSelect?.();
    item(menus, 'file', 'close').onSelect?.();
    item(menus, 'edit', 'find').onSelect?.();
    expect(act.open).toHaveBeenCalled();
    expect(act.newArchive).toHaveBeenCalled();
    expect(act.extractAll).toHaveBeenCalled();
    expect(act.extractSelected).toHaveBeenCalled();
    expect(act.close).toHaveBeenCalled();
    expect(act.find).toHaveBeenCalled();
  });

  it('never gives one shortcut to two commands', () => {
    const list = shortcuts(buildArchiveMenus(state(), actions()));
    expect(new Set(list).size).toBe(list.length);
  });

  it('turns the archive commands off when nothing is open', () => {
    const menus = buildArchiveMenus(state({ hasArchive: false }), actions());
    expect(item(menus, 'file', 'extract-all').enabled).toBe(false);
    expect(item(menus, 'edit', 'find').enabled).toBe(false);
    expect(item(menus, 'view', 'expand-all').enabled).toBe(false);
    expect(item(menus, 'file', 'open').enabled).toBe(true);
  });

  it('turns Extract Selected off until something is selected', () => {
    expect(item(buildArchiveMenus(state(), actions()), 'file', 'extract-selected').enabled).toBe(
      false,
    );
    expect(
      item(buildArchiveMenus(state({ hasSelection: true }), actions()), 'file', 'extract-selected')
        .enabled,
    ).toBe(true);
  });

  it('stops a second long operation from starting while one is running', () => {
    const menus = buildArchiveMenus(state({ busy: true, hasSelection: true }), actions());
    expect(item(menus, 'file', 'open').enabled).toBe(false);
    expect(item(menus, 'file', 'new').enabled).toBe(false);
    expect(item(menus, 'file', 'extract-all').enabled).toBe(false);
    expect(item(menus, 'file', 'extract-selected').enabled).toBe(false);
    expect(item(menus, 'file', 'close').enabled).toBeUndefined();
  });

  it('lists every sort column with a shortcut, and checks the one in use', () => {
    const menus = buildArchiveMenus(
      state({ sort: { column: 'packed', direction: 'asc' } }),
      actions(),
    );
    expect(submenuItem(menus, 'sort-name').shortcut).toBe('Mod+1');
    expect(submenuItem(menus, 'sort-modified').shortcut).toBe('Mod+5');
    expect(submenuItem(menus, 'sort-packed').checked).toBe(true);
    expect(submenuItem(menus, 'sort-name').checked).toBe(false);
  });

  it('checks the sort direction in use and switches it', () => {
    const act = actions();
    const menus = buildArchiveMenus(state({ sort: { column: 'name', direction: 'desc' } }), act);
    expect(submenuItem(menus, 'sort-desc').checked).toBe(true);
    expect(submenuItem(menus, 'sort-asc').checked).toBe(false);
    submenuItem(menus, 'sort-asc').onSelect?.();
    expect(act.setDirection).toHaveBeenCalledWith('asc');
  });

  it('chooses a column from the submenu', () => {
    const act = actions();
    submenuItem(buildArchiveMenus(state(), act), 'sort-ratio').onSelect?.();
    expect(act.setSort).toHaveBeenCalledWith('ratio');
  });

  it('ticks the two View switches while they are on', () => {
    const act = actions();
    const menus = buildArchiveMenus(state({ exactBytes: true, showDetails: false }), act);
    expect(item(menus, 'view', 'exact-bytes').checked).toBe(true);
    expect(item(menus, 'view', 'details').checked).toBe(false);
    item(menus, 'view', 'exact-bytes').onSelect?.();
    item(menus, 'view', 'details').onSelect?.();
    expect(act.toggleExactBytes).toHaveBeenCalled();
    expect(act.toggleDetails).toHaveBeenCalled();
  });

  it('binds Expand All and Collapse All', () => {
    const act = actions();
    const menus = buildArchiveMenus(state(), act);
    item(menus, 'view', 'expand-all').onSelect?.();
    item(menus, 'view', 'collapse-all').onSelect?.();
    expect(act.expandAll).toHaveBeenCalled();
    expect(act.collapseAll).toHaveBeenCalled();
  });
});
