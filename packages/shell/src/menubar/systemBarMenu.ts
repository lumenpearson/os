/**
 * The system bar's own menu. The bar has three things it can open and one
 * place to change what it shows, so that is what the menu offers — the same
 * commands its status buttons run, reachable from anywhere along the strip.
 */

import type { GlobalShortcutId } from '@lumen/kernel';
import type { MenuEntry } from '@lumen/ui';

export interface SystemBarMenuState {
  /** Notifications waiting in the centre; 0 when there are none. */
  unread: number;
}

export interface SystemBarMenuActions {
  controlCenter: () => void;
  notifications: () => void;
  search: () => void;
  settings: () => void;
}

export function systemBarMenuItems(
  state: SystemBarMenuState,
  actions: SystemBarMenuActions,
  shortcut: (id: GlobalShortcutId) => string,
): MenuEntry[] {
  return [
    {
      id: 'control-center',
      label: 'Control Center',
      shortcut: shortcut('shell.controlCenter'),
      onSelect: actions.controlCenter,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      // The count is the one thing the item cannot say for itself, and it is
      // read from the store rather than decorated onto it.
      hint: state.unread > 0 ? `${state.unread} unread` : undefined,
      shortcut: shortcut('shell.notifications'),
      onSelect: actions.notifications,
    },
    {
      id: 'search',
      label: 'Search',
      shortcut: shortcut('shell.spotlight'),
      onSelect: actions.search,
    },
    { id: 'bar-sep', type: 'separator' },
    { id: 'settings', label: 'Menubar Settings…', onSelect: actions.settings },
  ];
}
