/**
 * The menubar for the Contacts window, built from one snapshot of state so a
 * command does the same thing whether it is clicked, chosen from a menu or
 * typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import type { SortKey } from './contact';
import { SORT_LABELS } from './sort';

export interface ContactsMenuState {
  sort: SortKey;
  showGroups: boolean;
  /** A contact is selected, so the commands that act on one are live. */
  hasSelection: boolean;
  /** The selected contact is starred. */
  isFavourite: boolean;
  /** The detail pane is in edit mode. */
  editing: boolean;
}

export interface ContactsActions {
  newContact: () => void;
  importVcard: () => void;
  exportVcard: () => void;
  close: () => void;
  find: () => void;
  editContact: () => void;
  saveContact: () => void;
  cancelEdit: () => void;
  deleteContact: () => void;
  toggleFavourite: () => void;
  findDuplicates: () => void;
  setSort: (sort: SortKey) => void;
  toggleGroups: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildContactsMenus(
  state: ContactsMenuState,
  actions: ContactsActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Contact', shortcut: 'Mod+N', onSelect: actions.newContact },
        separator,
        {
          id: 'import',
          label: 'Import vCard…',
          shortcut: 'Mod+O',
          onSelect: actions.importVcard,
        },
        {
          id: 'export',
          label: 'Export vCard…',
          shortcut: 'Shift+Mod+E',
          onSelect: actions.exportVcard,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'find', label: 'Find', shortcut: 'Mod+F', onSelect: actions.find },
        separator,
        {
          id: 'edit-contact',
          label: 'Edit Contact',
          shortcut: 'Mod+E',
          enabled: state.hasSelection && !state.editing,
          onSelect: actions.editContact,
        },
        {
          id: 'save',
          label: 'Save Changes',
          shortcut: 'Mod+S',
          enabled: state.editing,
          onSelect: actions.saveContact,
        },
        {
          id: 'cancel',
          label: 'Discard Changes',
          shortcut: 'Escape',
          enabled: state.editing,
          onSelect: actions.cancelEdit,
        },
        separator,
        {
          id: 'favourite',
          label: 'Favourite',
          type: 'checkbox',
          shortcut: 'Mod+D',
          checked: state.isFavourite,
          enabled: state.hasSelection,
          onSelect: actions.toggleFavourite,
        },
        {
          id: 'duplicates',
          label: 'Find Duplicates…',
          shortcut: 'Shift+Mod+D',
          onSelect: actions.findDuplicates,
        },
        separator,
        {
          id: 'delete',
          label: 'Delete Contact',
          shortcut: 'Mod+Backspace',
          danger: true,
          enabled: state.hasSelection && !state.editing,
          onSelect: actions.deleteContact,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'sort-first',
          type: 'radio',
          label: SORT_LABELS.first,
          shortcut: 'Mod+1',
          checked: state.sort === 'first',
          onSelect: () => actions.setSort('first'),
        },
        {
          id: 'sort-last',
          type: 'radio',
          label: SORT_LABELS.last,
          shortcut: 'Mod+2',
          checked: state.sort === 'last',
          onSelect: () => actions.setSort('last'),
        },
        separator,
        {
          id: 'groups',
          type: 'checkbox',
          label: 'Groups Sidebar',
          shortcut: 'Shift+Mod+G',
          checked: state.showGroups,
          onSelect: actions.toggleGroups,
        },
      ],
    },
  ];
}
