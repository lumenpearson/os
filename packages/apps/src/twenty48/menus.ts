/**
 * The menubar for the game window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in the toolbar, chosen
 * from the menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface Twenty48MenuState {
  canUndo: boolean;
  showBest: boolean;
  animations: boolean;
}

export interface Twenty48MenuActions {
  newGame: () => void;
  undo: () => void;
  close: () => void;
  toggleBest: () => void;
  toggleAnimations: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildTwenty48Menus(
  state: Twenty48MenuState,
  actions: Twenty48MenuActions,
): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: 'Game',
      items: [
        { id: 'new', label: 'New Game', shortcut: 'Mod+N', onSelect: actions.newGame },
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
          id: 'best',
          type: 'checkbox',
          label: 'Best Score',
          shortcut: 'Mod+B',
          checked: state.showBest,
          onSelect: actions.toggleBest,
        },
        {
          id: 'animations',
          type: 'checkbox',
          label: 'Animations',
          checked: state.animations,
          onSelect: actions.toggleAnimations,
        },
      ],
    },
  ];
}
