import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMinesweeperMenus,
  type MinesweeperMenuActions,
  type MinesweeperMenuState,
} from './menus';

const actions = (): MinesweeperMenuActions => ({
  newGame: vi.fn(),
  setDifficulty: vi.fn(),
  openCustom: vi.fn(),
  openBestTimes: vi.fn(),
  toggleQuestionMarks: vi.fn(),
});

const state = (patch: Partial<MinesweeperMenuState> = {}): MinesweeperMenuState => ({
  difficulty: 'beginner',
  questionMarks: false,
  ...patch,
});

const item = (menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate => {
  const found = menus.find((m) => m.id === menuId)?.items.find((i) => i.id === itemId);
  if (!found) throw new Error(`no item "${itemId}" in "${menuId}"`);
  return found;
};

describe('buildMinesweeperMenus', () => {
  it('has a Game and an Options menu', () => {
    expect(buildMinesweeperMenus(state(), actions()).map((m) => m.id)).toEqual(['game', 'options']);
  });

  it('lists the four difficulties with shortcuts', () => {
    const menus = buildMinesweeperMenus(state(), actions());
    expect(item(menus, 'game', 'beginner').shortcut).toBe('Mod+1');
    expect(item(menus, 'game', 'intermediate').shortcut).toBe('Mod+2');
    expect(item(menus, 'game', 'expert').shortcut).toBe('Mod+3');
    expect(item(menus, 'game', 'custom').shortcut).toBe('Mod+4');
  });

  it('checks the difficulty in play', () => {
    const menus = buildMinesweeperMenus(state({ difficulty: 'expert' }), actions());
    expect(item(menus, 'game', 'expert').checked).toBe(true);
    expect(item(menus, 'game', 'beginner').checked).toBe(false);
    expect(item(menus, 'game', 'custom').checked).toBe(false);
  });

  it('checks Custom for a board the user typed', () => {
    const menus = buildMinesweeperMenus(state({ difficulty: 'custom' }), actions());
    expect(item(menus, 'game', 'custom').checked).toBe(true);
  });

  it('switches difficulty from a preset item', () => {
    const act = actions();
    item(buildMinesweeperMenus(state(), act), 'game', 'intermediate').onSelect?.();
    expect(act.setDifficulty).toHaveBeenCalledWith('intermediate');
  });

  it('binds the game commands', () => {
    const act = actions();
    const menus = buildMinesweeperMenus(state(), act);
    item(menus, 'game', 'new').onSelect?.();
    item(menus, 'game', 'custom').onSelect?.();
    item(menus, 'game', 'best-times').onSelect?.();
    expect(act.newGame).toHaveBeenCalled();
    expect(act.openCustom).toHaveBeenCalled();
    expect(act.openBestTimes).toHaveBeenCalled();
    expect(item(menus, 'game', 'new').shortcut).toBe('Mod+N');
  });

  it('ticks Question Marks while they are on', () => {
    const act = actions();
    expect(item(buildMinesweeperMenus(state(), act), 'options', 'question-marks').checked).toBe(
      false,
    );
    const on = buildMinesweeperMenus(state({ questionMarks: true }), act);
    expect(item(on, 'options', 'question-marks').checked).toBe(true);
    item(on, 'options', 'question-marks').onSelect?.();
    expect(act.toggleQuestionMarks).toHaveBeenCalled();
  });
});
