import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { LEVELS } from './engine';
import { buildChessMenus, type ChessActions, type ChessMenuState } from './menus';

const state: ChessMenuState = {
  canTakeBack: true,
  canUndo: true,
  canRedo: false,
  canRestart: true,
  canResign: true,
  flipped: false,
  coordinates: true,
  lastMove: true,
  hints: true,
  captured: true,
  moveList: true,
  level: 'club',
  side: 'w',
};

function actions(): ChessActions {
  return {
    newGame: vi.fn(),
    newGameAs: vi.fn(),
    restart: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    takeBack: vi.fn(),
    resign: vi.fn(),
    close: vi.fn(),
    copyFen: vi.fn(),
    copyPgn: vi.fn(),
    pasteFen: vi.fn(),
    flip: vi.fn(),
    toggleCoordinates: vi.fn(),
    toggleLastMove: vi.fn(),
    toggleHints: vi.fn(),
    toggleCaptured: vi.fn(),
    toggleMoveList: vi.fn(),
    first: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    last: vi.fn(),
    setLevel: vi.fn(),
    howToPlay: vi.fn(),
    about: vi.fn(),
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

describe('buildChessMenus', () => {
  it('contributes Game, Edit, View, Level and Help', () => {
    expect(buildChessMenus(state, actions()).map((m) => m.id)).toEqual([
      'game',
      'edit',
      'view',
      'level',
      'help',
    ]);
  });

  it('starts a game on either side, and asks which when it is not told', () => {
    const api = actions();
    const menus = buildChessMenus(state, api);
    find(menus, 'new')?.onSelect?.();
    expect(api.newGame).toHaveBeenCalledTimes(1);
    find(menus, 'new-black')?.onSelect?.();
    expect(api.newGameAs).toHaveBeenCalledWith('b');
    find(menus, 'new-white')?.onSelect?.();
    expect(api.newGameAs).toHaveBeenCalledWith('w');
  });

  it('offers every level the engine has, with the current one checked', () => {
    const menus = buildChessMenus(state, actions());
    const level = menus.find((m) => m.id === 'level');
    expect(level?.items.map((item) => item.id)).toEqual(LEVELS.map((l) => `level-${l.id}`));
    expect(level?.items.every((item) => item.type === 'radio')).toBe(true);
    expect(level?.items.filter((item) => item.checked).map((item) => item.id)).toEqual([
      'level-club',
    ]);
  });

  it('sets the level the item names', () => {
    const api = actions();
    find(buildChessMenus(state, api), 'level-strong')?.onSelect?.();
    expect(api.setLevel).toHaveBeenCalledWith('strong');
  });

  it('gives the commands a player repeats a shortcut the menubar can bind', () => {
    const menus = buildChessMenus(state, actions());
    for (const id of [
      'new',
      'new-black',
      'restart',
      'undo',
      'redo',
      'take-back',
      'close',
      'copy-fen',
      'copy-pgn',
      'paste-fen',
      'flip',
      'first',
      'previous',
      'next',
      'last',
    ]) {
      expect(find(menus, id)?.shortcut).toBeTruthy();
    }
  });

  it('greys out what cannot be done and marks resigning as the one that ends it', () => {
    const menus = buildChessMenus(
      { ...state, canTakeBack: false, canUndo: false, canRedo: false, canRestart: false },
      actions(),
    );
    expect(find(menus, 'take-back')?.enabled).toBe(false);
    expect(find(menus, 'undo')?.enabled).toBe(false);
    expect(find(menus, 'redo')?.enabled).toBe(false);
    expect(find(menus, 'restart')?.enabled).toBe(false);
    expect(find(menus, 'resign')?.danger).toBe(true);
    expect(
      find(buildChessMenus({ ...state, canResign: false }, actions()), 'resign')?.enabled,
    ).toBe(false);
  });

  it('shows every view option as a checkbox in its current state', () => {
    const menus = buildChessMenus(
      { ...state, flipped: true, coordinates: false, captured: false },
      actions(),
    );
    const checks: Array<[string, boolean]> = [
      ['flip', true],
      ['coordinates', false],
      ['last-move', true],
      ['hints', true],
      ['captured', false],
      ['move-list', true],
    ];
    for (const [id, checked] of checks) {
      expect(find(menus, id)?.type).toBe('checkbox');
      expect(find(menus, id)?.checked).toBe(checked);
    }
  });

  it('wires each item to its action', () => {
    const api = actions();
    const menus = buildChessMenus(state, api);
    const pairs: Array<[string, keyof ChessActions]> = [
      ['restart', 'restart'],
      ['undo', 'undo'],
      ['redo', 'redo'],
      ['take-back', 'takeBack'],
      ['resign', 'resign'],
      ['close', 'close'],
      ['copy-fen', 'copyFen'],
      ['copy-pgn', 'copyPgn'],
      ['paste-fen', 'pasteFen'],
      ['flip', 'flip'],
      ['coordinates', 'toggleCoordinates'],
      ['last-move', 'toggleLastMove'],
      ['hints', 'toggleHints'],
      ['captured', 'toggleCaptured'],
      ['move-list', 'toggleMoveList'],
      ['first', 'first'],
      ['previous', 'previous'],
      ['next', 'next'],
      ['last', 'last'],
      ['how-to-play', 'howToPlay'],
      ['about', 'about'],
    ];
    for (const [id, action] of pairs) {
      find(menus, id)?.onSelect?.();
      expect(api[action]).toHaveBeenCalledTimes(1);
    }
  });
});
