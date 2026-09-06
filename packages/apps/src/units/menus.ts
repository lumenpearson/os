/**
 * The menubar for the converter, built from one snapshot of state so a command
 * does the same thing whether it is clicked in the toolbar, picked from the
 * menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { CATEGORIES, type CategoryId } from './catalogue';

export interface UnitsMenuState {
  category: CategoryId;
  /** There is a finite result to put on the clipboard. */
  hasResult: boolean;
  hasRecents: boolean;
  showRecents: boolean;
}

export interface UnitsMenuActions {
  close: () => void;
  copyResult: () => void;
  swapUnits: () => void;
  clearRecents: () => void;
  setCategory: (category: CategoryId) => void;
  stepCategory: (direction: 1 | -1) => void;
  toggleRecents: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildUnitsMenus(state: UnitsMenuState, actions: UnitsMenuActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [{ id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close }],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'copy-result',
          label: 'Copy Result',
          shortcut: 'Mod+C',
          enabled: state.hasResult,
          onSelect: actions.copyResult,
        },
        { id: 'swap', label: 'Swap Units', shortcut: 'Mod+S', onSelect: actions.swapUnits },
        separator,
        {
          id: 'clear-recents',
          label: 'Clear Recents',
          enabled: state.hasRecents,
          onSelect: actions.clearRecents,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...CATEGORIES.map<MenuItemTemplate>((category) => ({
          id: `category-${category.id}`,
          type: 'radio',
          label: category.name,
          checked: state.category === category.id,
          onSelect: () => actions.setCategory(category.id),
        })),
        separator,
        {
          id: 'previous-category',
          label: 'Previous Category',
          shortcut: 'Mod+[',
          onSelect: () => actions.stepCategory(-1),
        },
        {
          id: 'next-category',
          label: 'Next Category',
          shortcut: 'Mod+]',
          onSelect: () => actions.stepCategory(1),
        },
        separator,
        {
          id: 'recents',
          type: 'checkbox',
          label: 'Recents',
          shortcut: 'Mod+R',
          checked: state.showRecents,
          onSelect: actions.toggleRecents,
        },
      ],
    },
  ];
}
