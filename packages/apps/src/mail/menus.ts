/**
 * The menubar for the Mail window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in a toolbar, picked from
 * a menu, or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { SORT_KEYS, SORT_LABELS, type SortKey } from './store';

export interface MailMenuState {
  /** A message is selected, so the commands that act on one are live. */
  hasSelection: boolean;
  /** The selection is unread; the Mark as command flips its label. */
  unread: boolean;
  flagged: boolean;
  /** The selection sits in Trash, where Delete is permanent and Restore works. */
  inTrash: boolean;
  /** The open mailbox is a folder the user made. */
  inFolder: boolean;
  composing: boolean;
  /** The reading pane is standing alone, so there is a list to go back to. */
  canGoBack: boolean;
  sort: SortKey;
  sidebar: boolean;
}

export interface MailActions {
  newMessage: () => void;
  saveDraft: () => void;
  newFolder: () => void;
  renameFolder: () => void;
  deleteFolder: () => void;
  emptyTrash: () => void;
  close: () => void;
  find: () => void;
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
  toggleRead: () => void;
  toggleFlag: () => void;
  archive: () => void;
  restore: () => void;
  remove: () => void;
  setSort: (sort: SortKey) => void;
  back: () => void;
  toggleSidebar: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildMailMenus(state: MailMenuState, actions: MailActions): MenuTemplate[] {
  // While the compose sheet is open the message commands belong to the draft,
  // not to whatever is still selected behind it.
  const on = state.hasSelection && !state.composing;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'new-message',
          label: 'New Message',
          shortcut: 'Mod+N',
          onSelect: actions.newMessage,
        },
        {
          id: 'save-draft',
          label: 'Save Draft',
          shortcut: 'Mod+S',
          enabled: state.composing,
          onSelect: actions.saveDraft,
        },
        separator,
        { id: 'new-folder', label: 'New Folder…', onSelect: actions.newFolder },
        {
          id: 'rename-folder',
          label: 'Rename Folder…',
          enabled: state.inFolder,
          onSelect: actions.renameFolder,
        },
        {
          id: 'delete-folder',
          label: 'Delete Folder',
          enabled: state.inFolder,
          danger: true,
          onSelect: actions.deleteFolder,
        },
        separator,
        {
          id: 'empty-trash',
          label: 'Empty Trash',
          danger: true,
          onSelect: actions.emptyTrash,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [{ id: 'find', label: 'Find…', shortcut: 'Mod+F', onSelect: actions.find }],
    },
    {
      id: 'message',
      label: 'Message',
      items: [
        { id: 'reply', label: 'Reply', shortcut: 'Mod+R', enabled: on, onSelect: actions.reply },
        {
          id: 'reply-all',
          label: 'Reply All',
          shortcut: 'Shift+Mod+R',
          enabled: on,
          onSelect: actions.replyAll,
        },
        {
          id: 'forward',
          label: 'Forward',
          shortcut: 'Shift+Mod+F',
          enabled: on,
          onSelect: actions.forward,
        },
        separator,
        {
          id: 'toggle-read',
          label: state.unread ? 'Mark as Read' : 'Mark as Unread',
          shortcut: 'Shift+Mod+U',
          enabled: on,
          onSelect: actions.toggleRead,
        },
        {
          id: 'flag',
          type: 'checkbox',
          label: 'Flag',
          shortcut: 'Shift+Mod+L',
          checked: state.flagged,
          enabled: on,
          onSelect: actions.toggleFlag,
        },
        separator,
        {
          id: 'archive',
          label: 'Move to Archive',
          shortcut: 'Shift+Mod+A',
          enabled: on && !state.inTrash,
          onSelect: actions.archive,
        },
        {
          id: 'restore',
          label: 'Move Back from Trash',
          enabled: on && state.inTrash,
          onSelect: actions.restore,
        },
        {
          id: 'delete',
          label: state.inTrash ? 'Delete Permanently' : 'Delete',
          shortcut: 'Delete',
          danger: true,
          enabled: on,
          onSelect: actions.remove,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'sort',
          type: 'submenu',
          label: 'Sort By',
          submenu: SORT_KEYS.map<MenuItemTemplate>((key) => ({
            id: `sort-${key}`,
            type: 'radio',
            label: SORT_LABELS[key],
            checked: state.sort === key,
            onSelect: () => actions.setSort(key),
          })),
        },
        separator,
        {
          id: 'back',
          label: 'Message List',
          shortcut: 'Escape',
          enabled: state.canGoBack,
          onSelect: actions.back,
        },
        {
          id: 'sidebar',
          type: 'checkbox',
          label: 'Sidebar',
          shortcut: 'Shift+Mod+S',
          checked: state.sidebar,
          onSelect: actions.toggleSidebar,
        },
      ],
    },
  ];
}
