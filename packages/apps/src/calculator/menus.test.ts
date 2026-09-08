import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCalculatorMenus,
  type CalculatorMenuActions,
  type CalculatorMenuState,
} from './menus';

const actions = (): CalculatorMenuActions => ({
  copy: vi.fn(),
  copyResult: vi.fn(),
  paste: vi.fn(),
  clear: vi.fn(),
  clearTape: vi.fn(),
  setMode: vi.fn(),
  setAngle: vi.fn(),
  toggleTape: vi.fn(),
});

const state = (patch: Partial<CalculatorMenuState> = {}): CalculatorMenuState => ({
  mode: 'basic',
  angle: 'deg',
  showTape: false,
  hasTape: false,
  ...patch,
});

const item = (menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate => {
  const found = menus.find((m) => m.id === menuId)?.items.find((i) => i.id === itemId);
  if (!found) throw new Error(`no item "${itemId}" in "${menuId}"`);
  return found;
};

describe('buildCalculatorMenus', () => {
  it('has an Edit and a View menu', () => {
    expect(buildCalculatorMenus(state(), actions()).map((m) => m.id)).toEqual(['edit', 'view']);
  });

  it('checks the mode the calculator is in', () => {
    const menus = buildCalculatorMenus(state({ mode: 'scientific' }), actions());
    expect(item(menus, 'view', 'scientific').checked).toBe(true);
    expect(item(menus, 'view', 'basic').checked).toBe(false);
    expect(item(menus, 'view', 'scientific').shortcut).toBe('Mod+2');
  });

  it('switches mode when a mode item is chosen', () => {
    const act = actions();
    const menus = buildCalculatorMenus(state(), act);
    item(menus, 'view', 'programmer').onSelect?.();
    expect(act.setMode).toHaveBeenCalledWith('programmer');
  });

  it('checks the angle unit and switches it', () => {
    const act = actions();
    const menus = buildCalculatorMenus(state({ angle: 'rad' }), act);
    expect(item(menus, 'view', 'radians').checked).toBe(true);
    expect(item(menus, 'view', 'degrees').checked).toBe(false);
    item(menus, 'view', 'degrees').onSelect?.();
    expect(act.setAngle).toHaveBeenCalledWith('deg');
  });

  it('greys out the angle unit in programmer mode, where it means nothing', () => {
    const menus = buildCalculatorMenus(state({ mode: 'programmer' }), actions());
    expect(item(menus, 'view', 'degrees').enabled).toBe(false);
    expect(item(menus, 'view', 'radians').enabled).toBe(false);
    expect(buildCalculatorMenus(state(), actions())).toBeDefined();
    expect(item(buildCalculatorMenus(state(), actions()), 'view', 'degrees').enabled).toBe(true);
  });

  it('greys out Clear Tape while the tape is empty', () => {
    expect(item(buildCalculatorMenus(state(), actions()), 'edit', 'clear-tape').enabled).toBe(
      false,
    );
    expect(
      item(buildCalculatorMenus(state({ hasTape: true }), actions()), 'edit', 'clear-tape').enabled,
    ).toBe(true);
  });

  it('ticks Show Tape while the tape is open', () => {
    const menus = buildCalculatorMenus(state({ showTape: true }), actions());
    expect(item(menus, 'view', 'tape').checked).toBe(true);
    expect(item(menus, 'view', 'tape').shortcut).toBe('Mod+T');
  });

  it('binds the clipboard and clear commands', () => {
    const act = actions();
    const menus = buildCalculatorMenus(state(), act);
    item(menus, 'edit', 'copy').onSelect?.();
    item(menus, 'edit', 'copy-result').onSelect?.();
    item(menus, 'edit', 'paste').onSelect?.();
    item(menus, 'edit', 'clear').onSelect?.();
    expect(act.copy).toHaveBeenCalled();
    expect(act.copyResult).toHaveBeenCalled();
    expect(act.paste).toHaveBeenCalled();
    expect(act.clear).toHaveBeenCalled();
    expect(item(menus, 'edit', 'clear').shortcut).toBe('Escape');
  });
});
