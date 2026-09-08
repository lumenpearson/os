import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { REFRESH_RATES, type TabId } from './config';
import { buildTaskManagerMenus, type TaskManagerActions, type TaskManagerMenuState } from './menus';

/** Spies that still satisfy the action signatures the menu builder expects. */
function actions() {
  const spies = {
    showTab: vi.fn((_tab: TabId) => {}),
    setRefreshMs: vi.fn((_ms: number) => {}),
    endProcess: vi.fn(),
    focusWindow: vi.fn(),
    quitApp: vi.fn(),
  };
  return spies satisfies TaskManagerActions;
}

const base: TaskManagerMenuState = {
  tab: 'processes',
  refreshMs: 1000,
  selectionCount: 0,
  canFocusWindow: false,
};

function find(menus: MenuTemplate[], id: string): MenuItemTemplate | undefined {
  const walk = (items: MenuItemTemplate[]): MenuItemTemplate | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      const inner = item.submenu ? walk(item.submenu) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  for (const menu of menus) {
    const found = walk(menu.items);
    if (found) return found;
  }
  return undefined;
}

describe('buildTaskManagerMenus', () => {
  it('offers a View and a Process menu', () => {
    expect(buildTaskManagerMenus(base, actions()).map((m) => m.id)).toEqual(['view', 'process']);
  });

  it('checks the tab that is showing and switches on select', () => {
    const a = actions();
    const menus = buildTaskManagerMenus({ ...base, tab: 'performance' }, a);
    expect(find(menus, 'view.processes')?.checked).toBe(false);
    expect(find(menus, 'view.performance')?.checked).toBe(true);
    expect(find(menus, 'view.apps')?.checked).toBe(false);
    find(menus, 'view.apps')?.onSelect?.();
    expect(a.showTab).toHaveBeenCalledWith('apps');
  });

  it('binds each tab to a number', () => {
    const menus = buildTaskManagerMenus(base, actions());
    expect(find(menus, 'view.processes')?.shortcut).toBe('Mod+1');
    expect(find(menus, 'view.performance')?.shortcut).toBe('Mod+2');
    expect(find(menus, 'view.apps')?.shortcut).toBe('Mod+3');
  });

  it('lists every refresh rate, checks the one in use, and sets it on select', () => {
    const a = actions();
    const menus = buildTaskManagerMenus({ ...base, refreshMs: 2000 }, a);
    const submenu = find(menus, 'view.refresh')?.submenu ?? [];
    expect(submenu.map((i) => i.label)).toEqual(['1 s', '2 s', '5 s']);
    expect(submenu.filter((i) => i.checked).map((i) => i.label)).toEqual(['2 s']);
    find(menus, `view.refresh.${REFRESH_RATES[2]}`)?.onSelect?.();
    expect(a.setRefreshMs).toHaveBeenCalledWith(5000);
  });

  it('stands the process commands down without a selection', () => {
    const menus = buildTaskManagerMenus(base, actions());
    expect(find(menus, 'process.focus')?.enabled).toBe(false);
    expect(find(menus, 'process.quit')?.enabled).toBe(false);
    expect(find(menus, 'process.end')?.enabled).toBe(false);
  });

  it('enables the commands the selection supports', () => {
    const menus = buildTaskManagerMenus(
      { ...base, selectionCount: 1, canFocusWindow: true },
      actions(),
    );
    expect(find(menus, 'process.focus')?.enabled).toBe(true);
    expect(find(menus, 'process.quit')?.enabled).toBe(true);
    expect(find(menus, 'process.end')?.enabled).toBe(true);
  });

  it('leaves Focus Window off for a process with no window', () => {
    const menus = buildTaskManagerMenus(
      { ...base, selectionCount: 1, canFocusWindow: false },
      actions(),
    );
    expect(find(menus, 'process.focus')?.enabled).toBe(false);
  });

  it('stands the process commands down on the other tabs', () => {
    for (const tab of ['performance', 'apps'] as const) {
      const menus = buildTaskManagerMenus(
        { ...base, tab, selectionCount: 2, canFocusWindow: true },
        actions(),
      );
      expect(find(menus, 'process.focus')?.enabled).toBe(false);
      expect(find(menus, 'process.quit')?.enabled).toBe(false);
      expect(find(menus, 'process.end')?.enabled).toBe(false);
    }
  });

  it('counts the processes in the End label', () => {
    const label = (selectionCount: number) =>
      find(buildTaskManagerMenus({ ...base, selectionCount }, actions()), 'process.end')?.label;
    expect(label(0)).toBe('End Process');
    expect(label(1)).toBe('End Process');
    expect(label(3)).toBe('End 3 Processes');
  });

  it('marks ending a process as destructive and gives it the Delete key', () => {
    const end = find(buildTaskManagerMenus(base, actions()), 'process.end');
    expect(end?.danger).toBe(true);
    expect(end?.shortcut).toBe('Delete');
  });

  it('leaves Quit App without a shortcut, because Mod+Q belongs to this window', () => {
    expect(find(buildTaskManagerMenus(base, actions()), 'process.quit')?.shortcut).toBeUndefined();
  });

  it('runs the action behind each process command', () => {
    const a = actions();
    const menus = buildTaskManagerMenus({ ...base, selectionCount: 1, canFocusWindow: true }, a);
    find(menus, 'process.focus')?.onSelect?.();
    find(menus, 'process.quit')?.onSelect?.();
    find(menus, 'process.end')?.onSelect?.();
    expect(a.focusWindow).toHaveBeenCalledOnce();
    expect(a.quitApp).toHaveBeenCalledOnce();
    expect(a.endProcess).toHaveBeenCalledOnce();
  });
});
