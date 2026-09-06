/**
 * The menubar, built from one snapshot of state so a command does the same
 * thing whether it is clicked in the detail pane, picked from the menu or
 * typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface CharmapMenuState {
  /** A character is under the cursor: the copy commands have something to copy. */
  hasCharacter: boolean;
  /** That character is pinned, so the command unpins it. */
  pinned: boolean;
  hasRecents: boolean;
  /** The grid is showing a block, so previous and next mean something. */
  inBlock: boolean;
  showSidebar: boolean;
}

export interface CharmapMenuActions {
  close: () => void;
  copyCharacter: () => void;
  copyCodePoint: () => void;
  copyHtml: () => void;
  copyJavaScript: () => void;
  copyCss: () => void;
  togglePin: () => void;
  clearRecents: () => void;
  showPinned: () => void;
  showRecent: () => void;
  stepBlock: (steps: number) => void;
  focusSearch: () => void;
  toggleSidebar: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildCharmapMenus(
  state: CharmapMenuState,
  actions: CharmapMenuActions,
): MenuTemplate[] {
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
          id: 'copy-character',
          label: 'Copy Character',
          shortcut: 'Mod+C',
          enabled: state.hasCharacter,
          onSelect: actions.copyCharacter,
        },
        {
          id: 'copy-code-point',
          label: 'Copy Code Point',
          shortcut: 'Shift+Mod+C',
          enabled: state.hasCharacter,
          onSelect: actions.copyCodePoint,
        },
        {
          id: 'copy-html',
          label: 'Copy HTML Entity',
          enabled: state.hasCharacter,
          onSelect: actions.copyHtml,
        },
        {
          id: 'copy-javascript',
          label: 'Copy JavaScript Escape',
          enabled: state.hasCharacter,
          onSelect: actions.copyJavaScript,
        },
        {
          id: 'copy-css',
          label: 'Copy CSS Escape',
          enabled: state.hasCharacter,
          onSelect: actions.copyCss,
        },
        separator,
        {
          id: 'toggle-pin',
          label: state.pinned ? 'Unpin Character' : 'Pin Character',
          shortcut: 'Mod+D',
          enabled: state.hasCharacter,
          onSelect: actions.togglePin,
        },
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
      id: 'go',
      label: 'Go',
      items: [
        { id: 'go-pinned', label: 'Pinned', onSelect: actions.showPinned },
        { id: 'go-recent', label: 'Recent', onSelect: actions.showRecent },
        separator,
        {
          id: 'previous-block',
          label: 'Previous Block',
          shortcut: 'Mod+[',
          enabled: state.inBlock,
          onSelect: () => actions.stepBlock(-1),
        },
        {
          id: 'next-block',
          label: 'Next Block',
          shortcut: 'Mod+]',
          enabled: state.inBlock,
          onSelect: () => actions.stepBlock(1),
        },
        separator,
        { id: 'find', label: 'Find', shortcut: 'Mod+F', onSelect: actions.focusSearch },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'sidebar',
          type: 'checkbox',
          label: 'Blocks Sidebar',
          shortcut: 'Mod+B',
          checked: state.showSidebar,
          onSelect: actions.toggleSidebar,
        },
      ],
    },
  ];
}
