import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildSolitaireMenus, type SolitaireMenuActions } from './menus';

const actions = (): SolitaireMenuActions => ({
  newDeal: vi.fn(),
  restart: vi.fn(),
  undo: vi.fn(),
  close: vi.fn(),
  setDraw: vi.fn(),
  toggleTimer: vi.fn(),
});

const item = (menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate | undefined =>
  menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);

describe('buildSolitaireMenus', () => {
  const state = { canUndo: true, draw: 1 as const, timer: true };

  it('offers a Game menu and a View menu', () => {
    const menus = buildSolitaireMenus(state, actions());
    expect(menus.map((m) => m.id)).toEqual(['game', 'view']);
    expect(menus.map((m) => m.label)).toEqual(['Game', 'View']);
  });

  it('carries every toolbar command', () => {
    const menus = buildSolitaireMenus(state, actions());
    expect(item(menus, 'game', 'new')?.label).toBe('New Deal');
    expect(item(menus, 'game', 'restart')?.label).toBe('Restart This Deal');
    expect(item(menus, 'game', 'undo')?.label).toBe('Undo');
    expect(item(menus, 'game', 'close')?.label).toBe('Close');
  });

  it('binds a shortcut to every command', () => {
    const menus = buildSolitaireMenus(state, actions());
    expect(item(menus, 'game', 'new')?.shortcut).toBe('Mod+N');
    expect(item(menus, 'game', 'restart')?.shortcut).toBe('Mod+R');
    expect(item(menus, 'game', 'undo')?.shortcut).toBe('Mod+Z');
    expect(item(menus, 'game', 'close')?.shortcut).toBe('Mod+W');
    expect(item(menus, 'view', 'draw-one')?.shortcut).toBe('Mod+1');
    expect(item(menus, 'view', 'draw-three')?.shortcut).toBe('Mod+3');
    expect(item(menus, 'view', 'timer')?.shortcut).toBe('Mod+T');
  });

  it('greys out Undo when there is nothing to take back', () => {
    expect(
      item(buildSolitaireMenus({ ...state, canUndo: false }, actions()), 'game', 'undo')?.enabled,
    ).toBe(false);
    expect(item(buildSolitaireMenus(state, actions()), 'game', 'undo')?.enabled).toBe(true);
  });

  it('ticks the draw setting, one of the two', () => {
    const one = buildSolitaireMenus(state, actions());
    expect(item(one, 'view', 'draw-one')?.checked).toBe(true);
    expect(item(one, 'view', 'draw-three')?.checked).toBe(false);
    const three = buildSolitaireMenus({ ...state, draw: 3 }, actions());
    expect(item(three, 'view', 'draw-one')?.checked).toBe(false);
    expect(item(three, 'view', 'draw-three')?.checked).toBe(true);
  });

  it('ticks the timer from the state', () => {
    expect(item(buildSolitaireMenus(state, actions()), 'view', 'timer')?.checked).toBe(true);
    expect(
      item(buildSolitaireMenus({ ...state, timer: false }, actions()), 'view', 'timer')?.checked,
    ).toBe(false);
  });

  it('runs the action the item was built with', () => {
    const handlers = actions();
    const menus = buildSolitaireMenus(state, handlers);
    item(menus, 'game', 'new')?.onSelect?.();
    item(menus, 'game', 'restart')?.onSelect?.();
    item(menus, 'game', 'undo')?.onSelect?.();
    item(menus, 'game', 'close')?.onSelect?.();
    item(menus, 'view', 'draw-three')?.onSelect?.();
    item(menus, 'view', 'timer')?.onSelect?.();
    expect(handlers.newDeal).toHaveBeenCalledTimes(1);
    expect(handlers.restart).toHaveBeenCalledTimes(1);
    expect(handlers.undo).toHaveBeenCalledTimes(1);
    expect(handlers.close).toHaveBeenCalledTimes(1);
    expect(handlers.setDraw).toHaveBeenCalledWith(3);
    expect(handlers.toggleTimer).toHaveBeenCalledTimes(1);
  });
});
