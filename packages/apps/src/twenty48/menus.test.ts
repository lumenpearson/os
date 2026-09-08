import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildTwenty48Menus, type Twenty48MenuActions } from './menus';

const actions = (): Twenty48MenuActions => ({
  newGame: vi.fn(),
  undo: vi.fn(),
  close: vi.fn(),
  toggleBest: vi.fn(),
  toggleAnimations: vi.fn(),
});

const item = (menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate | undefined =>
  menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);

describe('buildTwenty48Menus', () => {
  const state = { canUndo: true, showBest: true, animations: true };

  it('offers a Game menu and a View menu', () => {
    const menus = buildTwenty48Menus(state, actions());
    expect(menus.map((menu) => menu.id)).toEqual(['game', 'view']);
    expect(menus.map((menu) => menu.label)).toEqual(['Game', 'View']);
  });

  it('carries the toolbar commands', () => {
    const menus = buildTwenty48Menus(state, actions());
    expect(item(menus, 'game', 'new')?.label).toBe('New Game');
    expect(item(menus, 'game', 'undo')?.label).toBe('Undo');
    expect(item(menus, 'game', 'close')?.label).toBe('Close');
  });

  it('binds a shortcut to every command a shortcut belongs on', () => {
    const menus = buildTwenty48Menus(state, actions());
    expect(item(menus, 'game', 'new')?.shortcut).toBe('Mod+N');
    expect(item(menus, 'game', 'undo')?.shortcut).toBe('Mod+Z');
    expect(item(menus, 'game', 'close')?.shortcut).toBe('Mod+W');
    expect(item(menus, 'view', 'best')?.shortcut).toBe('Mod+B');
  });

  it('greys out Undo when there is nothing to take back', () => {
    const menus = buildTwenty48Menus({ ...state, canUndo: false }, actions());
    expect(item(menus, 'game', 'undo')?.enabled).toBe(false);
    expect(item(buildTwenty48Menus(state, actions()), 'game', 'undo')?.enabled).toBe(true);
  });

  it('ticks the View switches from the state', () => {
    const on = buildTwenty48Menus(state, actions());
    expect(item(on, 'view', 'best')?.checked).toBe(true);
    expect(item(on, 'view', 'animations')?.checked).toBe(true);
    const off = buildTwenty48Menus({ ...state, showBest: false, animations: false }, actions());
    expect(item(off, 'view', 'best')?.checked).toBe(false);
    expect(item(off, 'view', 'animations')?.checked).toBe(false);
  });

  it('runs the action the item was built with', () => {
    const handlers = actions();
    const menus = buildTwenty48Menus(state, handlers);
    item(menus, 'game', 'new')?.onSelect?.();
    item(menus, 'game', 'undo')?.onSelect?.();
    item(menus, 'game', 'close')?.onSelect?.();
    item(menus, 'view', 'best')?.onSelect?.();
    item(menus, 'view', 'animations')?.onSelect?.();
    expect(handlers.newGame).toHaveBeenCalledTimes(1);
    expect(handlers.undo).toHaveBeenCalledTimes(1);
    expect(handlers.close).toHaveBeenCalledTimes(1);
    expect(handlers.toggleBest).toHaveBeenCalledTimes(1);
    expect(handlers.toggleAnimations).toHaveBeenCalledTimes(1);
  });

  it('gives every item that is not a separator an id and a label', () => {
    for (const menu of buildTwenty48Menus(state, actions())) {
      for (const entry of menu.items) {
        if (entry.type === 'separator') continue;
        expect(entry.id).toBeTruthy();
        expect(entry.label).toBeTruthy();
      }
    }
  });
});
