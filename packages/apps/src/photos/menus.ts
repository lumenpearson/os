/**
 * The menubar for a Photos window, built from one snapshot of state so a
 * command reads the same whether it is clicked, typed or picked out of the
 * context menu on a tile.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { THUMB_SIZES, type ThumbSize } from './grid';
import { SORT_KEYS, type SortKey } from './library';

export interface PhotosMenuState {
  /** A picture is under the cursor, so the commands that act on one apply. */
  hasSelection: boolean;
  /** The selected picture is marked. */
  favourite: boolean;
  /** Paint edits this kind of file, so offering it is not a dead end. */
  canEdit: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  /** The lightbox is filling the window. */
  lightbox: boolean;
  sort: SortKey;
  ascending: boolean;
  size: ThumbSize;
  info: boolean;
  sidebar: boolean;
}

export interface PhotosActions {
  openInPreview: () => void;
  openInPaint: () => void;
  reveal: () => void;
  trash: () => void;
  refresh: () => void;
  close: () => void;
  toggleFavourite: () => void;
  previous: () => void;
  next: () => void;
  openLightbox: () => void;
  closeLightbox: () => void;
  setSort: (key: SortKey) => void;
  setAscending: (ascending: boolean) => void;
  setSize: (size: ThumbSize) => void;
  toggleInfo: () => void;
  toggleSidebar: () => void;
  focusSearch: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildPhotosMenus(state: PhotosMenuState, actions: PhotosActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'open-preview',
          label: 'Open in Preview',
          shortcut: 'Mod+O',
          enabled: state.hasSelection,
          onSelect: actions.openInPreview,
        },
        {
          id: 'open-paint',
          label: 'Open in Paint',
          enabled: state.hasSelection && state.canEdit,
          onSelect: actions.openInPaint,
        },
        {
          id: 'reveal',
          label: 'Reveal in Files',
          shortcut: 'Shift+Mod+R',
          enabled: state.hasSelection,
          onSelect: actions.reveal,
        },
        separator,
        { id: 'refresh', label: 'Refresh', shortcut: 'Mod+R', onSelect: actions.refresh },
        separator,
        {
          id: 'trash',
          label: 'Move to Trash…',
          shortcut: 'Mod+Backspace',
          danger: true,
          enabled: state.hasSelection,
          onSelect: actions.trash,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'picture',
      label: 'Picture',
      items: [
        {
          id: 'lightbox',
          label: state.lightbox ? 'Back to Library' : 'View Full Window',
          shortcut: state.lightbox ? 'Escape' : 'Return',
          enabled: state.hasSelection,
          onSelect: state.lightbox ? actions.closeLightbox : actions.openLightbox,
        },
        {
          id: 'favourite',
          type: 'checkbox',
          label: 'Favourite',
          shortcut: 'Mod+D',
          checked: state.favourite,
          enabled: state.hasSelection,
          onSelect: actions.toggleFavourite,
        },
        separator,
        {
          id: 'previous',
          label: 'Previous',
          shortcut: 'Mod+Left',
          enabled: state.hasPrevious,
          onSelect: actions.previous,
        },
        {
          id: 'next',
          label: 'Next',
          shortcut: 'Mod+Right',
          enabled: state.hasNext,
          onSelect: actions.next,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...SORT_KEYS.map(
          (key): MenuItemTemplate => ({
            id: `sort-${key.id}`,
            type: 'radio',
            label: `Sort by ${key.label}`,
            checked: state.sort === key.id,
            onSelect: () => actions.setSort(key.id),
          }),
        ),
        separator,
        {
          id: 'ascending',
          type: 'radio',
          label: 'Ascending',
          checked: state.ascending,
          onSelect: () => actions.setAscending(true),
        },
        {
          id: 'descending',
          type: 'radio',
          label: 'Descending',
          checked: !state.ascending,
          onSelect: () => actions.setAscending(false),
        },
        separator,
        ...THUMB_SIZES.map(
          (size): MenuItemTemplate => ({
            id: `size-${size.id}`,
            type: 'radio',
            label: `${size.label} Thumbnails`,
            checked: state.size === size.id,
            onSelect: () => actions.setSize(size.id),
          }),
        ),
        separator,
        {
          id: 'sidebar',
          type: 'checkbox',
          label: 'Show Albums',
          shortcut: 'Mod+1',
          checked: state.sidebar,
          onSelect: actions.toggleSidebar,
        },
        {
          id: 'info',
          type: 'checkbox',
          label: 'Show Info',
          shortcut: 'Mod+I',
          checked: state.info,
          onSelect: actions.toggleInfo,
        },
        separator,
        { id: 'search', label: 'Search', shortcut: 'Mod+F', onSelect: actions.focusSearch },
      ],
    },
  ];
}

/** The same commands on a right-click, minus the ones that need no picture. */
export function pictureContextMenu(state: PhotosMenuState, actions: PhotosActions) {
  return [
    { id: 'view', label: 'View Full Window', onSelect: actions.openLightbox },
    { id: 'open-preview', label: 'Open in Preview', onSelect: actions.openInPreview },
    {
      id: 'open-paint',
      label: 'Open in Paint',
      enabled: state.canEdit,
      onSelect: actions.openInPaint,
    },
    { id: 'reveal', label: 'Reveal in Files', onSelect: actions.reveal },
    { type: 'separator' as const },
    {
      id: 'favourite',
      type: 'checkbox' as const,
      label: 'Favourite',
      checked: state.favourite,
      onSelect: actions.toggleFavourite,
    },
    { type: 'separator' as const },
    { id: 'trash', label: 'Move to Trash…', danger: true, onSelect: actions.trash },
  ];
}
