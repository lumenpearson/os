import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  buildStorageMenus,
  type StorageActions,
  type StorageMenuState,
  type StorageView,
} from './menus';

function actions() {
  const spies = {
    rescan: vi.fn(),
    cancelScan: vi.fn(),
    emptyTrash: vi.fn(),
    showView: vi.fn((_view: StorageView) => {}),
    goUp: vi.fn(),
    close: vi.fn(),
  };
  return spies satisfies StorageActions;
}

const base: StorageMenuState = {
  view: 'overview',
  scanning: false,
  trashBytes: 1024,
  canGoUp: false,
};

function find(menus: MenuTemplate[], id: string): MenuItemTemplate | undefined {
  for (const menu of menus) {
    const item = menu.items.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
}

describe('buildStorageMenus', () => {
  it('contributes File and View', () => {
    expect(buildStorageMenus(base, actions()).map((m) => m.label)).toEqual(['File', 'View']);
  });

  it('offers Rescan while idle and Cancel Scan while scanning', () => {
    const idle = buildStorageMenus(base, actions());
    expect(find(idle, 'file.rescan')?.enabled).toBe(true);
    expect(find(idle, 'file.cancel')?.enabled).toBe(false);
    const busy = buildStorageMenus({ ...base, scanning: true }, actions());
    expect(find(busy, 'file.rescan')?.enabled).toBe(false);
    expect(find(busy, 'file.cancel')?.enabled).toBe(true);
  });

  it('runs the action behind each command', () => {
    const spies = actions();
    const menus = buildStorageMenus({ ...base, scanning: true }, spies);
    find(menus, 'file.cancel')?.onSelect?.();
    find(menus, 'file.close')?.onSelect?.();
    expect(spies.cancelScan).toHaveBeenCalledTimes(1);
    expect(spies.close).toHaveBeenCalledTimes(1);
  });

  it('only offers Empty Trash when there is something in it', () => {
    expect(find(buildStorageMenus(base, actions()), 'file.empty-trash')?.enabled).toBe(true);
    expect(
      find(buildStorageMenus({ ...base, trashBytes: 0 }, actions()), 'file.empty-trash')?.enabled,
    ).toBe(false);
    expect(
      find(buildStorageMenus({ ...base, trashBytes: null }, actions()), 'file.empty-trash')
        ?.enabled,
    ).toBe(false);
  });

  it('marks Empty Trash as the destructive command it is', () => {
    expect(find(buildStorageMenus(base, actions()), 'file.empty-trash')?.danger).toBe(true);
  });

  it('checks the view that is showing', () => {
    const menus = buildStorageMenus({ ...base, view: 'folders' }, actions());
    expect(find(menus, 'view.overview')?.checked).toBe(false);
    expect(find(menus, 'view.folders')?.checked).toBe(true);
    expect(find(menus, 'view.files')?.checked).toBe(false);
  });

  it('switches view from the menu', () => {
    const spies = actions();
    find(buildStorageMenus(base, spies), 'view.files')?.onSelect?.();
    expect(spies.showView).toHaveBeenCalledWith('files');
  });

  it('only offers Go Up in the folder view, below the root', () => {
    expect(find(buildStorageMenus(base, actions()), 'view.up')?.enabled).toBe(false);
    expect(
      find(buildStorageMenus({ ...base, view: 'folders', canGoUp: true }, actions()), 'view.up')
        ?.enabled,
    ).toBe(true);
    expect(
      find(buildStorageMenus({ ...base, view: 'files', canGoUp: true }, actions()), 'view.up')
        ?.enabled,
    ).toBe(false);
  });

  it('gives every command a shortcut the menubar can print', () => {
    const menus = buildStorageMenus(base, actions());
    expect(find(menus, 'file.rescan')?.shortcut).toBe('Mod+R');
    expect(find(menus, 'view.up')?.shortcut).toBe('Mod+Up');
  });
});
