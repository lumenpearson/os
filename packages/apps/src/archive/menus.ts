/**
 * The menubar for the archive window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in the toolbar, chosen
 * from a menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { SORT_COLUMNS, SORT_LABELS, type SortColumn, type SortState } from './tree';

export interface ArchiveMenuState {
  /** An archive is open, so the commands that act on one are live. */
  hasArchive: boolean;
  hasSelection: boolean;
  /** A long operation is running; the commands that would start another are not. */
  busy: boolean;
  sort: SortState;
  exactBytes: boolean;
  showDetails: boolean;
}

export interface ArchiveActions {
  open: () => void;
  newArchive: () => void;
  extractAll: () => void;
  extractSelected: () => void;
  close: () => void;
  find: () => void;
  setSort: (column: SortColumn) => void;
  setDirection: (direction: 'asc' | 'desc') => void;
  toggleExactBytes: () => void;
  toggleDetails: () => void;
  expandAll: () => void;
  collapseAll: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildArchiveMenus(
  state: ArchiveMenuState,
  actions: ArchiveActions,
): MenuTemplate[] {
  const ready = state.hasArchive && !state.busy;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'open',
          label: 'Open…',
          shortcut: 'Mod+O',
          enabled: !state.busy,
          onSelect: actions.open,
        },
        {
          id: 'new',
          label: 'New Archive…',
          shortcut: 'Shift+Mod+N',
          enabled: !state.busy,
          onSelect: actions.newArchive,
        },
        separator,
        {
          id: 'extract-all',
          label: 'Extract All…',
          shortcut: 'Mod+E',
          enabled: ready,
          onSelect: actions.extractAll,
        },
        {
          id: 'extract-selected',
          label: 'Extract Selected…',
          shortcut: 'Shift+Mod+E',
          enabled: ready && state.hasSelection,
          onSelect: actions.extractSelected,
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
          id: 'find',
          label: 'Find',
          shortcut: 'Mod+F',
          enabled: state.hasArchive,
          onSelect: actions.find,
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
          label: 'Sort',
          submenu: [
            ...SORT_COLUMNS.map<MenuItemTemplate>((column, index) => ({
              id: `sort-${column}`,
              type: 'radio',
              label: SORT_LABELS[column],
              shortcut: `Mod+${index + 1}`,
              checked: state.sort.column === column,
              onSelect: () => actions.setSort(column),
            })),
            separator,
            {
              id: 'sort-asc',
              type: 'radio',
              label: 'Ascending',
              checked: state.sort.direction === 'asc',
              onSelect: () => actions.setDirection('asc'),
            },
            {
              id: 'sort-desc',
              type: 'radio',
              label: 'Descending',
              checked: state.sort.direction === 'desc',
              onSelect: () => actions.setDirection('desc'),
            },
          ],
        },
        separator,
        {
          id: 'exact-bytes',
          type: 'checkbox',
          label: 'Show Sizes as Bytes',
          shortcut: 'Mod+B',
          checked: state.exactBytes,
          onSelect: actions.toggleExactBytes,
        },
        {
          id: 'details',
          type: 'checkbox',
          label: 'Details',
          shortcut: 'Shift+Mod+D',
          checked: state.showDetails,
          onSelect: actions.toggleDetails,
        },
        separator,
        {
          id: 'expand-all',
          label: 'Expand All',
          shortcut: 'Mod+.',
          enabled: state.hasArchive,
          onSelect: actions.expandAll,
        },
        {
          id: 'collapse-all',
          label: 'Collapse All',
          shortcut: 'Shift+Mod+.',
          enabled: state.hasArchive,
          onSelect: actions.collapseAll,
        },
      ],
    },
  ];
}
