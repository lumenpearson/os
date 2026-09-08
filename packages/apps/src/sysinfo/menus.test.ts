import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildSysInfoMenus, type SysInfoActions, type SysInfoMenuState } from './menus';

function actions(): SysInfoActions {
  return { copyReport: vi.fn(), saveReport: vi.fn(), refresh: vi.fn(), close: vi.fn() };
}

function item(menus: MenuTemplate[], id: string): MenuItemTemplate | undefined {
  return menus.flatMap((m) => m.items).find((i) => i.id === id);
}

const READY: SysInfoMenuState = { ready: true, reading: false };

describe('buildSysInfoMenus', () => {
  it('has the three menus in order', () => {
    expect(buildSysInfoMenus(READY, actions()).map((m) => m.id)).toEqual(['file', 'edit', 'view']);
  });

  it('gives every command a label and a shortcut', () => {
    const items = buildSysInfoMenus(READY, actions())
      .flatMap((m) => m.items)
      .filter((i) => i.type !== 'separator');
    expect(items).toHaveLength(4);
    for (const i of items) {
      expect(i.label).toBeTruthy();
      expect(i.shortcut).toBeTruthy();
      expect(i.onSelect).toBeInstanceOf(Function);
    }
  });

  it('runs the action the item names', () => {
    const a = actions();
    const menus = buildSysInfoMenus(READY, a);
    item(menus, 'file.save')?.onSelect?.();
    item(menus, 'edit.copy')?.onSelect?.();
    item(menus, 'view.refresh')?.onSelect?.();
    item(menus, 'file.close')?.onSelect?.();
    expect(a.saveReport).toHaveBeenCalledOnce();
    expect(a.copyReport).toHaveBeenCalledOnce();
    expect(a.refresh).toHaveBeenCalledOnce();
    expect(a.close).toHaveBeenCalledOnce();
  });

  it('stands the report commands down before the first reading', () => {
    const menus = buildSysInfoMenus({ ready: false, reading: true }, actions());
    expect(item(menus, 'file.save')?.enabled).toBe(false);
    expect(item(menus, 'edit.copy')?.enabled).toBe(false);
    expect(item(menus, 'view.refresh')?.enabled).toBe(false);
  });

  it('will not copy a report that is half measured', () => {
    const menus = buildSysInfoMenus({ ready: true, reading: true }, actions());
    expect(item(menus, 'edit.copy')?.enabled).toBe(false);
    expect(item(menus, 'view.refresh')?.enabled).toBe(false);
  });

  it('keeps Close available whatever the readings are doing', () => {
    const menus = buildSysInfoMenus({ ready: false, reading: true }, actions());
    expect(item(menus, 'file.close')?.enabled).toBeUndefined();
  });
});
