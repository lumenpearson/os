import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkbenchMenus, type WorkbenchActions } from './menus';
import { TOOL_SHORTCUT, TOOLS } from './tools';

const actions = (): WorkbenchActions => ({
  close: vi.fn(),
  copyOutput: vi.fn(),
  clear: vi.fn(),
  setTool: vi.fn(),
  nextTool: vi.fn(),
  previousTool: vi.fn(),
});

const menu = (menus: MenuTemplate[], id: string) => {
  const found = menus.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} menu`);
  return found;
};

const item = (menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate => {
  const found = menu(menus, menuId).items.find((i) => i.id === itemId);
  if (!found) throw new Error(`no ${menuId} > ${itemId}`);
  return found;
};

const state = { tool: 'json', hasOutput: true, hasInput: true } as const;

describe('buildWorkbenchMenus', () => {
  it('offers File, Edit and View', () => {
    const menus = buildWorkbenchMenus(state, actions());
    expect(menus.map((m) => m.id)).toEqual(['file', 'edit', 'view']);
  });

  it('gives every command a shortcut', () => {
    const menus = buildWorkbenchMenus(state, actions());
    const commands = menus.flatMap((m) => m.items).filter((i) => i.type !== 'separator');
    expect(commands.every((i) => typeof i.shortcut === 'string' && i.shortcut.length > 0)).toBe(
      true,
    );
  });

  it('uses each shortcut once', () => {
    const menus = buildWorkbenchMenus(state, actions());
    const shortcuts = menus
      .flatMap((m) => m.items)
      .flatMap((i) => (i.shortcut ? [i.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('lists every tool in View with its shortcut and marks the current one', () => {
    const menus = buildWorkbenchMenus({ ...state, tool: 'diff' }, actions());
    for (const tool of TOOLS) {
      const entry = item(menus, 'view', `tool-${tool}`);
      expect(entry.type).toBe('radio');
      expect(entry.shortcut).toBe(TOOL_SHORTCUT[tool]);
      expect(entry.checked).toBe(tool === 'diff');
    }
  });

  it('runs the action the caller passed', () => {
    const run = actions();
    const menus = buildWorkbenchMenus(state, run);
    item(menus, 'file', 'close').onSelect?.();
    item(menus, 'edit', 'copy-output').onSelect?.();
    item(menus, 'edit', 'clear').onSelect?.();
    item(menus, 'view', 'tool-hash').onSelect?.();
    item(menus, 'view', 'next-tool').onSelect?.();
    item(menus, 'view', 'previous-tool').onSelect?.();
    expect(run.close).toHaveBeenCalledOnce();
    expect(run.copyOutput).toHaveBeenCalledOnce();
    expect(run.clear).toHaveBeenCalledOnce();
    expect(run.setTool).toHaveBeenCalledWith('hash');
    expect(run.nextTool).toHaveBeenCalledOnce();
    expect(run.previousTool).toHaveBeenCalledOnce();
  });

  it('disables Copy Output and Clear when there is nothing to act on', () => {
    const menus = buildWorkbenchMenus(
      { tool: 'json', hasOutput: false, hasInput: false },
      actions(),
    );
    expect(item(menus, 'edit', 'copy-output').enabled).toBe(false);
    expect(item(menus, 'edit', 'clear').enabled).toBe(false);
  });
});
