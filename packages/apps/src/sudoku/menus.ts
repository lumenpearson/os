/**
 * The menubar for a Sudoku window, built from one snapshot of state so a
 * command reads and behaves the same whether it is clicked or typed. Every
 * toolbar button has its twin here.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from './generate';

export interface SudokuMenuState {
  canUndo: boolean;
  canRedo: boolean;
  /** The cursor is on a cell the player may empty. */
  canClear: boolean;
  /** There is a cell left for a hint to fill. */
  canHint: boolean;
  difficulty: Difficulty;
  pencil: boolean;
  highlight: boolean;
  timer: boolean;
}

export interface SudokuActions {
  newPuzzle: (difficulty: Difficulty) => void;
  check: () => void;
  hint: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  clearCell: () => void;
  togglePencil: () => void;
  toggleHighlight: () => void;
  toggleTimer: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildSudokuMenus(state: SudokuMenuState, actions: SudokuActions): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: 'Game',
      items: [
        {
          id: 'new',
          label: 'New Puzzle',
          submenu: DIFFICULTIES.map<MenuItemTemplate>((difficulty, position) => ({
            id: `new-${difficulty}`,
            type: 'radio',
            label: DIFFICULTY_LABEL[difficulty],
            shortcut: `Mod+${position + 1}`,
            checked: state.difficulty === difficulty,
            onSelect: () => actions.newPuzzle(difficulty),
          })),
        },
        separator,
        { id: 'check', label: 'Check', shortcut: 'Mod+K', onSelect: actions.check },
        {
          id: 'hint',
          label: 'Hint',
          shortcut: 'Mod+H',
          enabled: state.canHint,
          onSelect: actions.hint,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo,
          onSelect: actions.redo,
        },
        separator,
        {
          id: 'clear-cell',
          label: 'Clear Cell',
          shortcut: 'Mod+Backspace',
          enabled: state.canClear,
          onSelect: actions.clearCell,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'pencil',
          type: 'checkbox',
          label: 'Pencil Marks',
          shortcut: 'Mod+P',
          checked: state.pencil,
          onSelect: actions.togglePencil,
        },
        {
          id: 'highlight',
          type: 'checkbox',
          label: 'Highlight Peers',
          checked: state.highlight,
          onSelect: actions.toggleHighlight,
        },
        {
          id: 'timer',
          type: 'checkbox',
          label: 'Timer',
          checked: state.timer,
          onSelect: actions.toggleTimer,
        },
      ],
    },
  ];
}
