import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildClipboardMenus, type ClipboardMenuState } from './menus';

const actions = () => ({
  close: vi.fn(),
  putBack: vi.fn(),
  togglePin: vi.fn(),
  remove: vi.fn(),
  clearAll: vi.fn(),
  find: vi.fn(),
});

const state = (patch: Partial<ClipboardMenuState> = {}): ClipboardMenuState => ({
  hasSelection: true,
  isPinned: false,
  hasItems: true,
  ...patch,
});

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('the menubar', () => {
  it('offers File and Edit, and nothing it cannot do', () => {
    const menus = buildClipboardMenus(state(), actions());
    expect(menus.map((menu) => menu.id)).toEqual(['file', 'edit']);
    expect(item(menus, 'file', 'close').shortcut).toBe('Mod+W');
    expect(item(menus, 'edit', 'put-back').shortcut).toBe('Mod+Return');
  });

  it('runs the command the caller passed', () => {
    const run = actions();
    const menus = buildClipboardMenus(state(), run);
    item(menus, 'edit', 'put-back').onSelect?.();
    item(menus, 'edit', 'remove').onSelect?.();
    item(menus, 'edit', 'clear-all').onSelect?.();
    expect(run.putBack).toHaveBeenCalledTimes(1);
    expect(run.remove).toHaveBeenCalledTimes(1);
    expect(run.clearAll).toHaveBeenCalledTimes(1);
  });

  it('turns off what needs a selection when there is none', () => {
    const menus = buildClipboardMenus(state({ hasSelection: false }), actions());
    expect(item(menus, 'edit', 'put-back').enabled).toBe(false);
    expect(item(menus, 'edit', 'pin').enabled).toBe(false);
    expect(item(menus, 'edit', 'remove').enabled).toBe(false);
    expect(item(menus, 'edit', 'find').enabled).toBeUndefined();
  });

  it('names the pin command after what it will do', () => {
    expect(item(buildClipboardMenus(state(), actions()), 'edit', 'pin').label).toBe('Pin');
    expect(
      item(buildClipboardMenus(state({ isPinned: true }), actions()), 'edit', 'pin').label,
    ).toBe('Unpin');
  });

  it('offers Clear All only when there is a history to clear', () => {
    expect(
      item(buildClipboardMenus(state({ hasItems: false }), actions()), 'edit', 'clear-all').enabled,
    ).toBe(false);
  });
});
