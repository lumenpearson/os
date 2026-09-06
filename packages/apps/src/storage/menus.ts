/**
 * The menubar for the Storage window. Built from one snapshot of state, so a
 * command reads the same whether it is clicked or typed, and a command with
 * nothing to act on stands down instead of failing quietly.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export type StorageView = 'overview' | 'folders' | 'files';

export const VIEW_LABELS: Record<StorageView, string> = {
  overview: 'Overview',
  folders: 'By Folder',
  files: 'Largest Files',
};

export interface StorageMenuState {
  view: StorageView;
  /** A scan is running now. */
  scanning: boolean;
  /** Bytes in the Trash, or null when they could not be measured. */
  trashBytes: number | null;
  /** The folder view is below the root of the scan. */
  canGoUp: boolean;
}

export interface StorageActions {
  rescan: () => void;
  cancelScan: () => void;
  emptyTrash: () => void;
  showView: (view: StorageView) => void;
  goUp: () => void;
  close: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildStorageMenus(
  state: StorageMenuState,
  actions: StorageActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'file.rescan',
          label: 'Rescan',
          shortcut: 'Mod+R',
          enabled: !state.scanning,
          onSelect: actions.rescan,
        },
        {
          id: 'file.cancel',
          label: 'Cancel Scan',
          shortcut: 'Mod+.',
          enabled: state.scanning,
          onSelect: actions.cancelScan,
        },
        separator,
        {
          id: 'file.empty-trash',
          label: 'Empty Trash',
          danger: true,
          enabled: state.trashBytes !== null && state.trashBytes > 0 && !state.scanning,
          onSelect: actions.emptyTrash,
        },
        separator,
        { id: 'file.close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view.overview',
          type: 'radio',
          label: VIEW_LABELS.overview,
          shortcut: 'Mod+1',
          checked: state.view === 'overview',
          onSelect: () => actions.showView('overview'),
        },
        {
          id: 'view.folders',
          type: 'radio',
          label: VIEW_LABELS.folders,
          shortcut: 'Mod+2',
          checked: state.view === 'folders',
          onSelect: () => actions.showView('folders'),
        },
        {
          id: 'view.files',
          type: 'radio',
          label: VIEW_LABELS.files,
          shortcut: 'Mod+3',
          checked: state.view === 'files',
          onSelect: () => actions.showView('files'),
        },
        separator,
        {
          id: 'view.up',
          label: 'Go Up',
          shortcut: 'Mod+Up',
          enabled: state.view === 'folders' && state.canGoUp,
          onSelect: actions.goUp,
        },
      ],
    },
  ];
}
