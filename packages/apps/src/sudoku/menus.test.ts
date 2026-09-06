import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from './generate';
import { buildSudokuMenus, type SudokuActions, type SudokuMenuState } from './menus';

const state: SudokuMenuState = {
  canUndo: true,
  canRedo: false,
  canClear: true,
  canHint: true,
  difficulty: 'hard',
  pencil: false,
  highlight: true,
  timer: true,
};

function actions(): SudokuActions {
  return {
    newPuzzle: vi.fn(),
    check: vi.fn(),
    hint: vi.fn(),
    close: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clearCell: vi.fn(),
    togglePencil: vi.fn(),
    toggleHighlight: vi.fn(),
    toggleTimer: vi.fn(),
  };
}

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

describe('buildSudokuMenus', () => {
  it('contributes Game, Edit and View', () => {
    expect(buildSudokuMenus(state, actions()).map((m) => m.id)).toEqual(['game', 'edit', 'view']);
  });

  it('offers all four difficulties, with the current one checked', () => {
    const menus = buildSudokuMenus(state, actions());
    const submenu = find(menus, 'new')?.submenu ?? [];
    expect(submenu.map((item) => item.id)).toEqual(DIFFICULTIES.map((d) => `new-${d}`));
    expect(submenu.filter((item) => item.checked).map((item) => item.id)).toEqual(['new-hard']);
    expect(submenu.map((item) => item.shortcut)).toEqual(['Mod+1', 'Mod+2', 'Mod+3', 'Mod+4']);
  });

  it('starts the puzzle the difficulty item names', () => {
    const api = actions();
    find(buildSudokuMenus(state, api), 'new-expert')?.onSelect?.();
    expect(api.newPuzzle).toHaveBeenCalledWith('expert');
  });

  it('gives every command a shortcut the menubar can bind', () => {
    const menus = buildSudokuMenus(state, actions());
    for (const id of ['check', 'hint', 'close', 'undo', 'redo', 'clear-cell', 'pencil']) {
      expect(find(menus, id)?.shortcut).toBeTruthy();
    }
  });

  it('greys out what cannot be done', () => {
    const menus = buildSudokuMenus(
      { ...state, canUndo: false, canRedo: false, canClear: false, canHint: false },
      actions(),
    );
    expect(find(menus, 'undo')?.enabled).toBe(false);
    expect(find(menus, 'redo')?.enabled).toBe(false);
    expect(find(menus, 'clear-cell')?.enabled).toBe(false);
    expect(find(menus, 'hint')?.enabled).toBe(false);
    expect(find(menus, 'check')?.enabled).toBeUndefined();
  });

  it('shows the view options as checkboxes in their current state', () => {
    const menus = buildSudokuMenus({ ...state, pencil: true, timer: false }, actions());
    expect(find(menus, 'pencil')?.checked).toBe(true);
    expect(find(menus, 'highlight')?.checked).toBe(true);
    expect(find(menus, 'timer')?.checked).toBe(false);
    for (const id of ['pencil', 'highlight', 'timer']) {
      expect(find(menus, id)?.type).toBe('checkbox');
    }
  });

  it('wires each item to its action', () => {
    const api = actions();
    const menus = buildSudokuMenus(state, api);
    const pairs: Array<[string, keyof SudokuActions]> = [
      ['check', 'check'],
      ['hint', 'hint'],
      ['close', 'close'],
      ['undo', 'undo'],
      ['redo', 'redo'],
      ['clear-cell', 'clearCell'],
      ['pencil', 'togglePencil'],
      ['highlight', 'toggleHighlight'],
      ['timer', 'toggleTimer'],
    ];
    for (const [id, action] of pairs) {
      find(menus, id)?.onSelect?.();
      expect(api[action]).toHaveBeenCalledTimes(1);
    }
  });
});
