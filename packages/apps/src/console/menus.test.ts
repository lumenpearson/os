import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildConsoleMenus, type ConsoleActions, type ConsoleMenuState } from './menus';

const actions = (): ConsoleActions & { [K in keyof ConsoleActions]: ReturnType<typeof vi.fn> } => ({
  exportLog: vi.fn(),
  clear: vi.fn(),
  toggleFollow: vi.fn(),
  toggleLevel: vi.fn(),
  togglePaused: vi.fn(),
  find: vi.fn(),
  copySelected: vi.fn(),
});

const state = (patch: Partial<ConsoleMenuState> = {}): ConsoleMenuState => ({
  levels: ['debug', 'info', 'warn', 'error'],
  follow: true,
  paused: false,
  rowCount: 12,
  hasSelection: false,
  ...patch,
});

function item(menus: MenuTemplate[], id: string): MenuItemTemplate {
  const walk = (items: MenuItemTemplate[]): MenuItemTemplate | undefined => {
    for (const entry of items) {
      if (entry.id === id) return entry;
      const found = entry.submenu ? walk(entry.submenu) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  for (const menu of menus) {
    const found = walk(menu.items);
    if (found) return found;
  }
  throw new Error(`no menu item ${id}`);
}

describe('buildConsoleMenus', () => {
  it('offers File, Edit and View', () => {
    expect(buildConsoleMenus(state(), actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'view',
    ]);
  });

  it('binds each command to its action', () => {
    const acts = actions();
    const menus = buildConsoleMenus(state({ hasSelection: true }), acts);
    item(menus, 'file.export').onSelect?.();
    item(menus, 'file.clear').onSelect?.();
    item(menus, 'edit.copy').onSelect?.();
    item(menus, 'edit.find').onSelect?.();
    item(menus, 'view.follow').onSelect?.();
    item(menus, 'view.pause').onSelect?.();
    expect(acts.exportLog).toHaveBeenCalledOnce();
    expect(acts.clear).toHaveBeenCalledOnce();
    expect(acts.copySelected).toHaveBeenCalledOnce();
    expect(acts.find).toHaveBeenCalledOnce();
    expect(acts.toggleFollow).toHaveBeenCalledOnce();
    expect(acts.togglePaused).toHaveBeenCalledOnce();
  });

  it('has nothing to export from an empty view', () => {
    expect(item(buildConsoleMenus(state({ rowCount: 0 }), actions()), 'file.export').enabled).toBe(
      false,
    );
    expect(item(buildConsoleMenus(state(), actions()), 'file.export').enabled).toBe(true);
  });

  it('only copies when a row is selected', () => {
    expect(item(buildConsoleMenus(state(), actions()), 'edit.copy').enabled).toBe(false);
    expect(
      item(buildConsoleMenus(state({ hasSelection: true }), actions()), 'edit.copy').enabled,
    ).toBe(true);
  });

  it('ticks Follow Tail while it is on', () => {
    expect(item(buildConsoleMenus(state(), actions()), 'view.follow').checked).toBe(true);
    expect(
      item(buildConsoleMenus(state({ follow: false }), actions()), 'view.follow').checked,
    ).toBe(false);
  });

  it('says what the pause command will do', () => {
    expect(item(buildConsoleMenus(state(), actions()), 'view.pause').label).toBe('Pause Capture');
    expect(item(buildConsoleMenus(state({ paused: true }), actions()), 'view.pause').label).toBe(
      'Resume Capture',
    );
  });

  it('ticks the levels that are shown and toggles the one chosen', () => {
    const acts = actions();
    const menus = buildConsoleMenus(state({ levels: ['warn', 'error'] }), acts);
    expect(item(menus, 'view.levels.debug').checked).toBe(false);
    expect(item(menus, 'view.levels.error').checked).toBe(true);
    item(menus, 'view.levels.debug').onSelect?.();
    expect(acts.toggleLevel).toHaveBeenCalledWith('debug');
  });

  it('gives every command a shortcut that is unique in the window', () => {
    const menus = buildConsoleMenus(state(), actions());
    const shortcuts = menus.flatMap((menu) =>
      menu.items.map((entry) => entry.shortcut).filter((keys): keys is string => Boolean(keys)),
    );
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});
