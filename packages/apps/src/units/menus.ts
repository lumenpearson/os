import { t } from '@lumen/kernel';
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
      label: t('menu.file'),
      items: [{ id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close }],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        {
          id: 'copy-result',
          label: t('menu.copyResult'),
          shortcut: 'Mod+C',
          enabled: state.hasResult,
          onSelect: actions.copyResult,
        },
        { id: 'swap', label: t('units.swapUnits'), shortcut: 'Mod+S', onSelect: actions.swapUnits },
        separator,
        {
          id: 'clear-recents',
          label: t('menu.clearRecents'),
          enabled: state.hasRecents,
          onSelect: actions.clearRecents,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
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
          label: t('units.previousCategory'),
          shortcut: 'Mod+[',
          onSelect: () => actions.stepCategory(-1),
        },
        {
          id: 'next-category',
          label: t('units.nextCategory'),
          shortcut: 'Mod+]',
          onSelect: () => actions.stepCategory(1),
        },
        separator,
        {
          id: 'recents',
          type: 'checkbox',
          label: t('units.recents'),
          shortcut: 'Mod+R',
          checked: state.showRecents,
          onSelect: actions.toggleRecents,
        },
      ],
    },
  ];
}
