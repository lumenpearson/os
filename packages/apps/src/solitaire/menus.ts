/**
 * The menubar for the game window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in a menu, pressed on the
 * toolbar, or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import type { DrawCount } from './rules';

export interface SolitaireMenuState {
  canUndo: boolean;
  draw: DrawCount;
  timer: boolean;
}

export interface SolitaireMenuActions {
  newDeal: () => void;
  restart: () => void;
  undo: () => void;
  close: () => void;
  setDraw: (draw: DrawCount) => void;
  toggleTimer: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildSolitaireMenus(
  state: SolitaireMenuState,
  actions: SolitaireMenuActions,
): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: 'Game',
      items: [
        { id: 'new', label: 'New Deal', shortcut: 'Mod+N', onSelect: actions.newDeal },
        { id: 'restart', label: 'Restart This Deal', shortcut: 'Mod+R', onSelect: actions.restart },
        separator,
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'draw-one',
          type: 'radio',
          label: 'Draw One',
          shortcut: 'Mod+1',
          checked: state.draw === 1,
          onSelect: () => actions.setDraw(1),
        },
        {
          id: 'draw-three',
          type: 'radio',
          label: 'Draw Three',
          shortcut: 'Mod+3',
          checked: state.draw === 3,
          onSelect: () => actions.setDraw(3),
        },
        separator,
        {
          id: 'timer',
          type: 'checkbox',
          label: 'Timer',
          shortcut: 'Mod+T',
          checked: state.timer,
          onSelect: actions.toggleTimer,
        },
      ],
    },
  ];
}
