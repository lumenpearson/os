import { t } from '@lumen/kernel';
/**
 * The menubar for the Clipboard window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in the detail pane, picked
 * from a menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface ClipboardMenuState {
  /** A row is selected, so the commands that act on one are live. */
  hasSelection: boolean;
  /** The selected row is one of this app's pins. */
  isPinned: boolean;
  /** There is something in the list to clear. */
  hasItems: boolean;
}

export interface ClipboardMenuActions {
  close: () => void;
  putBack: () => void;
  togglePin: () => void;
  remove: () => void;
  clearAll: () => void;
  find: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildClipboardMenus(
  state: ClipboardMenuState,
  actions: ClipboardMenuActions,
): MenuTemplate[] {
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
          id: 'put-back',
          label: t('clipboard.putBack'),
          shortcut: 'Mod+Return',
          enabled: state.hasSelection,
          onSelect: actions.putBack,
        },
        separator,
        {
          id: 'pin',
          label: state.isPinned ? 'Unpin' : 'Pin',
          shortcut: 'Mod+P',
          enabled: state.hasSelection,
          onSelect: actions.togglePin,
        },
        {
          id: 'remove',
          label: t('clipboard.remove'),
          shortcut: 'Mod+Backspace',
          enabled: state.hasSelection,
          danger: true,
          onSelect: actions.remove,
        },
        {
          id: 'clear-all',
          label: t('clipboard.clearAll'),
          shortcut: 'Shift+Mod+Backspace',
          enabled: state.hasItems,
          danger: true,
          onSelect: actions.clearAll,
        },
        separator,
        { id: 'find', label: t('menu.find'), shortcut: 'Mod+F', onSelect: actions.find },
      ],
    },
  ];
}
