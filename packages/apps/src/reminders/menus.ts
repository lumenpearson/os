/**
 * The menubar for the Reminders window, built from one snapshot of state so a
 * command reads the same whether it is clicked in a menu, typed as a shortcut
 * or pressed on the toolbar.
 *
 * The commands that act on a reminder go dead when no row is focused. That is
 * not only for looks: an item with `enabled: false` does not answer its
 * shortcut, which is what keeps Delete from firing while a title is being
 * typed into the field above the list.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { type Selection, SMART_LABELS, SMART_LISTS, SMART_SHORTCUTS } from './smart';

export interface RemindersMenuState {
  selection: Selection;
  /** A row has the cursor, so the commands that act on one are live. */
  hasFocus: boolean;
  focusedCompleted: boolean;
  focusedFlagged: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  showCompleted: boolean;
  showSidebar: boolean;
}

export interface RemindersActions {
  newReminder: () => void;
  newList: () => void;
  close: () => void;
  find: () => void;
  editDetails: () => void;
  toggleCompleted: () => void;
  toggleFlagged: () => void;
  indent: () => void;
  outdent: () => void;
  moveUp: () => void;
  moveDown: () => void;
  deleteItem: () => void;
  select: (selection: Selection) => void;
  toggleShowCompleted: () => void;
  toggleSidebar: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildRemindersMenus(
  state: RemindersMenuState,
  actions: RemindersActions,
): MenuTemplate[] {
  const onRow = state.hasFocus;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'new-reminder',
          label: 'New Reminder',
          shortcut: 'Mod+N',
          onSelect: actions.newReminder,
        },
        { id: 'new-list', label: 'New List', shortcut: 'Shift+Mod+N', onSelect: actions.newList },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'find', label: 'Find…', shortcut: 'Mod+F', onSelect: actions.find },
        separator,
        {
          id: 'edit-details',
          label: 'Edit Details…',
          shortcut: 'Mod+E',
          enabled: onRow,
          onSelect: actions.editDetails,
        },
        {
          id: 'toggle-completed',
          label: state.focusedCompleted ? 'Mark as Not Completed' : 'Mark as Completed',
          shortcut: 'Mod+Return',
          enabled: onRow,
          onSelect: actions.toggleCompleted,
        },
        {
          id: 'toggle-flagged',
          label: state.focusedFlagged ? 'Remove Flag' : 'Flag',
          shortcut: 'Shift+Mod+L',
          enabled: onRow,
          onSelect: actions.toggleFlagged,
        },
        separator,
        {
          id: 'indent',
          label: 'Make Subtask',
          shortcut: 'Mod+]',
          enabled: onRow && state.canIndent,
          onSelect: actions.indent,
        },
        {
          id: 'outdent',
          label: 'Lift Out of Subtask',
          shortcut: 'Mod+[',
          enabled: onRow && state.canOutdent,
          onSelect: actions.outdent,
        },
        {
          id: 'move-up',
          label: 'Move Up',
          shortcut: 'Shift+Mod+ArrowUp',
          enabled: onRow,
          onSelect: actions.moveUp,
        },
        {
          id: 'move-down',
          label: 'Move Down',
          shortcut: 'Shift+Mod+ArrowDown',
          enabled: onRow,
          onSelect: actions.moveDown,
        },
        separator,
        {
          id: 'delete',
          label: 'Delete',
          shortcut: 'Delete',
          danger: true,
          enabled: onRow,
          onSelect: actions.deleteItem,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...SMART_LISTS.map<MenuItemTemplate>((id) => ({
          id: `smart-${id}`,
          type: 'radio',
          label: SMART_LABELS[id],
          shortcut: SMART_SHORTCUTS[id],
          checked: state.selection.kind === 'smart' && state.selection.id === id,
          onSelect: () => actions.select({ kind: 'smart', id }),
        })),
        separator,
        {
          id: 'show-completed',
          type: 'checkbox',
          label: 'Show Completed',
          shortcut: 'Shift+Mod+C',
          checked: state.showCompleted,
          onSelect: actions.toggleShowCompleted,
        },
        {
          id: 'sidebar',
          type: 'checkbox',
          label: 'Sidebar',
          shortcut: 'Shift+Mod+S',
          checked: state.showSidebar,
          onSelect: actions.toggleSidebar,
        },
      ],
    },
  ];
}
