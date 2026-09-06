/**
 * Menu builders for the context menu and the menubar. Both read one
 * snapshot of app state and call into one `FilesActions` object, so the
 * same command behaves the same wherever it is invoked from.
 */
import type { AppDefinition, MenuTemplate } from '@lumen/kernel';
import type { MenuEntry } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import { createElement } from 'react';
import { DATE_FILTERS, type FilterState, isFiltering, KIND_FILTERS, SIZE_FILTERS } from './filters';
import { type LaneAxis, SORT_COLUMNS, type SortState, type ViewMode } from './logic';
import { DOCUMENT_TEMPLATES, type DocumentKind } from './operations';
import {
  ICON_SIZES,
  type IconSize,
  LANE_AXES,
  TOOLBAR_PARTS,
  type ToolbarPart,
  type ToolbarParts,
} from './settings';

export interface FilesActions {
  newWindow: () => void;
  newFolder: () => void;
  newDocument: (kind: DocumentKind) => void;
  open: () => void;
  openWith: (appId: string) => void;
  getInfo: () => void;
  rename: () => void;
  duplicate: () => void;
  trash: () => void;
  putBack: () => void;
  emptyTrash: () => void;
  closeWindow: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  setView: (view: ViewMode) => void;
  setCardAxis: (axis: LaneAxis) => void;
  setIconSize: (size: IconSize) => void;
  toggleHidden: () => void;
  toggleSidebar: () => void;
  toggleIndexRail: () => void;
  toggleToolbarPart: (part: ToolbarPart) => void;
  setSort: (sort: SortState) => void;
  toggleFoldersFirst: () => void;
  /** Merge one field into the filter; the rest stays as it is. */
  setFilter: (patch: Partial<FilterState>) => void;
  clearFilter: () => void;
  /** Asks for the name pattern in a prompt. */
  editPattern: () => void;
  quickLook: () => void;
  back: () => void;
  forward: () => void;
  up: () => void;
  go: (path: string) => void;
  goToFolder: () => void;
  toggleFavorite: (path: string) => void;
}

export interface MenuState {
  /** Selected paths. */
  selection: readonly string[];
  /** The entry under the pointer for a context menu; null for empty space. */
  target: DirEntry | null;
  /** Whether the single selected item is a folder (when known). */
  singleIsDirectory: boolean;
  inTrash: boolean;
  canPutBack: boolean;
  canPaste: boolean;
  showHidden: boolean;
  sidebarVisible: boolean;
  indexRail: boolean;
  toolbar: ToolbarParts;
  view: ViewMode;
  cardAxis: LaneAxis;
  iconSize: IconSize;
  sort: SortState;
  foldersFirst: boolean;
  filter: FilterState;
  canBack: boolean;
  canForward: boolean;
  canUp: boolean;
  isFavorite: boolean;
  openWithApps: readonly AppDefinition[];
  places: ReadonlyArray<{ label: string; path: string; shortcut?: string }>;
}

const separator: MenuEntry = { type: 'separator' };

/**
 * Sort levels, read downwards: folders first when it is ticked, then the
 * chosen column, then the name.
 */
export function sortSubmenu(
  sort: SortState,
  foldersFirst: boolean,
  actions: FilesActions,
): MenuEntry[] {
  return [
    ...SORT_COLUMNS.map<MenuEntry>((c) => ({
      id: `sort-${c.id}`,
      type: 'radio',
      label: c.label,
      checked: sort.column === c.id,
      onSelect: () => actions.setSort({ column: c.id, direction: sort.direction }),
    })),
    separator,
    {
      id: 'sort-asc',
      type: 'radio',
      label: 'Ascending',
      checked: sort.direction === 'asc',
      onSelect: () => actions.setSort({ column: sort.column, direction: 'asc' }),
    },
    {
      id: 'sort-desc',
      type: 'radio',
      label: 'Descending',
      checked: sort.direction === 'desc',
      onSelect: () => actions.setSort({ column: sort.column, direction: 'desc' }),
    },
    separator,
    {
      id: 'sort-folders-first',
      type: 'checkbox',
      label: 'Folders First',
      checked: foldersFirst,
      onSelect: actions.toggleFoldersFirst,
    },
  ];
}

export function viewSubmenu(
  view: ViewMode,
  actions: FilesActions,
  withShortcuts = false,
): MenuEntry[] {
  const modes: Array<{ id: ViewMode; label: string; shortcut: string }> = [
    { id: 'list', label: 'as List', shortcut: 'Mod+1' },
    { id: 'grid', label: 'as Grid', shortcut: 'Mod+2' },
    { id: 'columns', label: 'as Columns', shortcut: 'Mod+3' },
    { id: 'cards', label: 'as Cards', shortcut: 'Mod+4' },
  ];
  return modes.map((m) => ({
    id: `view-${m.id}`,
    type: 'radio',
    label: m.label,
    shortcut: withShortcuts ? m.shortcut : undefined,
    checked: view === m.id,
    onSelect: () => actions.setView(m.id),
  }));
}

/** Kind, size, date and name pattern; they narrow the list together. */
export function filterSubmenu(state: MenuState, actions: FilesActions): MenuEntry[] {
  const { filter } = state;
  return [
    {
      id: 'filter-kind',
      label: 'Kind',
      submenu: KIND_FILTERS.map((o) => ({
        id: `filter-kind-${o.id}`,
        type: 'radio',
        label: o.label,
        checked: filter.kind === o.id,
        onSelect: () => actions.setFilter({ kind: o.id }),
      })),
    },
    {
      id: 'filter-size',
      label: 'Size',
      submenu: SIZE_FILTERS.map((o) => ({
        id: `filter-size-${o.id}`,
        type: 'radio',
        label: o.label,
        checked: filter.size === o.id,
        onSelect: () => actions.setFilter({ size: o.id }),
      })),
    },
    {
      id: 'filter-date',
      label: 'Date Modified',
      submenu: DATE_FILTERS.map((o) => ({
        id: `filter-date-${o.id}`,
        type: 'radio',
        label: o.label,
        checked: filter.modified === o.id,
        onSelect: () => actions.setFilter({ modified: o.id }),
      })),
    },
    {
      id: 'filter-pattern',
      label: 'Name Pattern…',
      onSelect: actions.editPattern,
    },
    separator,
    {
      id: 'filter-clear',
      label: 'Clear Filters',
      enabled: isFiltering(filter),
      onSelect: actions.clearFilter,
    },
  ];
}

/** Everything about the window's chrome: lane, icon size, sidebar, rail, toolbar. */
export function viewOptionsSubmenu(state: MenuState, actions: FilesActions): MenuEntry[] {
  return [
    {
      id: 'card-axis',
      label: 'Card Lane',
      enabled: state.view === 'cards',
      submenu: LANE_AXES.map((o) => ({
        id: `card-axis-${o.id}`,
        type: 'radio',
        label: o.label,
        checked: state.cardAxis === o.id,
        onSelect: () => actions.setCardAxis(o.id),
      })),
    },
    {
      id: 'icon-size',
      label: 'Icon Size',
      submenu: ICON_SIZES.map((o) => ({
        id: `icon-size-${o.id}`,
        type: 'radio',
        label: o.label,
        checked: state.iconSize === o.id,
        onSelect: () => actions.setIconSize(o.id),
      })),
    },
    separator,
    {
      id: 'sidebar',
      type: 'checkbox',
      label: 'Show Sidebar',
      checked: state.sidebarVisible,
      onSelect: actions.toggleSidebar,
    },
    {
      id: 'index-rail',
      type: 'checkbox',
      label: 'Show A–Z Rail',
      checked: state.indexRail,
      onSelect: actions.toggleIndexRail,
    },
    {
      id: 'toolbar',
      label: 'Toolbar',
      submenu: TOOLBAR_PARTS.map((part) => ({
        id: `toolbar-${part.id}`,
        type: 'checkbox',
        label: part.label,
        checked: state.toolbar[part.id],
        onSelect: () => actions.toggleToolbarPart(part.id),
      })),
    },
  ];
}

export function newDocumentSubmenu(actions: FilesActions): MenuEntry[] {
  return (Object.keys(DOCUMENT_TEMPLATES) as DocumentKind[]).map((kind) => ({
    id: `new-${kind}`,
    label: DOCUMENT_TEMPLATES[kind].label,
    onSelect: () => actions.newDocument(kind),
  }));
}

function openWithSubmenu(state: MenuState, actions: FilesActions): MenuEntry | null {
  if (state.selection.length !== 1) return null;
  const apps = state.openWithApps;
  return {
    id: 'open-with',
    label: 'Open With',
    enabled: apps.length > 0,
    submenu: apps.map((app) => ({
      id: `open-with-${app.id}`,
      label: app.name,
      icon: createElement(app.icon, { size: 14 }),
      onSelect: () => actions.openWith(app.id),
    })),
  };
}

function trashLabel(state: MenuState): string {
  return state.inTrash ? 'Delete Permanently' : 'Move to Trash';
}

/** Items for right-clicking an entry (or, with `target` null, empty space). */
export function contextMenuFor(
  state: MenuState,
  actions: FilesActions,
  shortcut: (keys: string) => string,
): MenuEntry[] {
  const count = state.selection.length;
  if (state.target && count > 0) {
    const single = count === 1;
    const openWith = openWithSubmenu(state, actions);
    const items: MenuEntry[] = [
      { id: 'open', label: count > 1 ? `Open ${count} Items` : 'Open', onSelect: actions.open },
    ];
    if (openWith) items.push(openWith);
    if (state.canPutBack) {
      items.push(separator, { id: 'put-back', label: 'Put Back', onSelect: actions.putBack });
    }
    items.push(
      separator,
      { id: 'info', label: 'Get Info', shortcut: shortcut('Mod+I'), onSelect: actions.getInfo },
      { id: 'quick-look', label: 'Quick Look', enabled: single, onSelect: actions.quickLook },
      separator,
      {
        id: 'rename',
        label: 'Rename',
        shortcut: shortcut('F2'),
        enabled: single,
        onSelect: actions.rename,
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        shortcut: shortcut('Mod+D'),
        enabled: !state.inTrash,
        onSelect: actions.duplicate,
      },
      separator,
      { id: 'cut', label: 'Cut', shortcut: shortcut('Mod+X'), onSelect: actions.cut },
      { id: 'copy', label: 'Copy', shortcut: shortcut('Mod+C'), onSelect: actions.copy },
      {
        id: 'paste',
        label: 'Paste',
        shortcut: shortcut('Mod+V'),
        enabled: state.canPaste,
        onSelect: actions.paste,
      },
    );
    if (single && state.singleIsDirectory && !state.inTrash) {
      const path = state.selection[0] as string;
      items.push(separator, {
        id: 'favorite',
        label: state.isFavorite ? 'Remove from Favourites' : 'Add to Favourites',
        onSelect: () => actions.toggleFavorite(path),
      });
    }
    items.push(separator, {
      id: 'trash',
      label: trashLabel(state),
      shortcut: shortcut('Delete'),
      danger: true,
      onSelect: actions.trash,
    });
    return items;
  }
  const items: MenuEntry[] = [
    {
      id: 'new-folder',
      label: 'New Folder',
      shortcut: shortcut('Shift+Mod+N'),
      enabled: !state.inTrash,
      onSelect: actions.newFolder,
    },
    {
      id: 'new-text',
      label: 'New Text File',
      enabled: !state.inTrash,
      onSelect: () => actions.newDocument('text'),
    },
    {
      id: 'new-document',
      label: 'New Document',
      enabled: !state.inTrash,
      submenu: newDocumentSubmenu(actions),
    },
    separator,
    {
      id: 'paste',
      label: 'Paste',
      shortcut: shortcut('Mod+V'),
      enabled: state.canPaste && !state.inTrash,
      onSelect: actions.paste,
    },
    { id: 'info', label: 'Get Info', shortcut: shortcut('Mod+I'), onSelect: actions.getInfo },
    separator,
    {
      id: 'hidden',
      type: 'checkbox',
      label: 'Show Hidden Files',
      checked: state.showHidden,
      onSelect: actions.toggleHidden,
    },
    {
      id: 'sort-by',
      label: 'Sort By',
      submenu: sortSubmenu(state.sort, state.foldersFirst, actions),
    },
    { id: 'filter', label: 'Filter', submenu: filterSubmenu(state, actions) },
    {
      id: 'view',
      label: 'View',
      submenu: [
        ...viewSubmenu(state.view, actions),
        separator,
        ...viewOptionsSubmenu(state, actions),
      ],
    },
  ];
  if (state.inTrash) {
    items.push(separator, {
      id: 'empty-trash',
      label: 'Empty Trash…',
      danger: true,
      onSelect: actions.emptyTrash,
    });
  }
  return items;
}

/** The File / Edit / View / Go menus for the menubar. */
export function menubarFor(state: MenuState, actions: FilesActions): MenuTemplate[] {
  const count = state.selection.length;
  const some = count > 0;
  const single = count === 1;
  const openWith = openWithSubmenu(state, actions);
  const file: MenuEntry[] = [
    { id: 'new-window', label: 'New Window', shortcut: 'Mod+N', onSelect: actions.newWindow },
    {
      id: 'new-folder',
      label: 'New Folder',
      shortcut: 'Shift+Mod+N',
      enabled: !state.inTrash,
      onSelect: actions.newFolder,
    },
    {
      id: 'new-text',
      label: 'New Text File',
      enabled: !state.inTrash,
      onSelect: () => actions.newDocument('text'),
    },
    {
      id: 'new-document',
      label: 'New Document',
      enabled: !state.inTrash,
      submenu: newDocumentSubmenu(actions),
    },
    separator,
    { id: 'open', label: 'Open', shortcut: 'Mod+O', enabled: some, onSelect: actions.open },
    ...(openWith ? [openWith] : []),
    { id: 'info', label: 'Get Info', shortcut: 'Mod+I', onSelect: actions.getInfo },
    { id: 'quick-look', label: 'Quick Look', enabled: single, onSelect: actions.quickLook },
    separator,
    { id: 'rename', label: 'Rename', shortcut: 'F2', enabled: single, onSelect: actions.rename },
    {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: 'Mod+D',
      enabled: some && !state.inTrash,
      onSelect: actions.duplicate,
    },
    separator,
  ];
  if (state.canPutBack)
    file.push({ id: 'put-back', label: 'Put Back', enabled: some, onSelect: actions.putBack });
  file.push({
    id: 'trash',
    label: trashLabel(state),
    shortcut: 'Delete',
    enabled: some,
    danger: true,
    onSelect: actions.trash,
  });
  if (state.inTrash)
    file.push({
      id: 'empty-trash',
      label: 'Empty Trash…',
      danger: true,
      onSelect: actions.emptyTrash,
    });
  file.push(separator, {
    id: 'close',
    label: 'Close Window',
    shortcut: 'Mod+W',
    onSelect: actions.closeWindow,
  });

  const edit: MenuEntry[] = [
    { id: 'undo', label: 'Undo', shortcut: 'Mod+Z', enabled: false },
    separator,
    { id: 'cut', label: 'Cut', shortcut: 'Mod+X', enabled: some, onSelect: actions.cut },
    { id: 'copy', label: 'Copy', shortcut: 'Mod+C', enabled: some, onSelect: actions.copy },
    {
      id: 'paste',
      label: 'Paste',
      shortcut: 'Mod+V',
      enabled: state.canPaste && !state.inTrash,
      onSelect: actions.paste,
    },
    separator,
    { id: 'select-all', label: 'Select All', shortcut: 'Mod+A', onSelect: actions.selectAll },
  ];

  const view: MenuEntry[] = [
    ...viewSubmenu(state.view, actions, true),
    separator,
    {
      id: 'hidden',
      type: 'checkbox',
      label: 'Show Hidden Files',
      shortcut: 'Shift+Mod+Period',
      checked: state.showHidden,
      onSelect: actions.toggleHidden,
    },
    ...viewOptionsSubmenu(state, actions),
    separator,
    {
      id: 'sort-by',
      label: 'Sort By',
      submenu: sortSubmenu(state.sort, state.foldersFirst, actions),
    },
    { id: 'filter', label: 'Filter', submenu: filterSubmenu(state, actions) },
  ];

  const go: MenuEntry[] = [
    {
      id: 'back',
      label: 'Back',
      shortcut: 'Mod+[',
      enabled: state.canBack,
      onSelect: actions.back,
    },
    {
      id: 'forward',
      label: 'Forward',
      shortcut: 'Mod+]',
      enabled: state.canForward,
      onSelect: actions.forward,
    },
    {
      id: 'up',
      label: 'Enclosing Folder',
      shortcut: 'Mod+ArrowUp',
      enabled: state.canUp,
      onSelect: actions.up,
    },
    separator,
    ...state.places.map<MenuEntry>((p) => ({
      id: `go-${p.path}`,
      label: p.label,
      shortcut: p.shortcut,
      onSelect: () => actions.go(p.path),
    })),
    separator,
    { id: 'go-to', label: 'Go to Folder…', shortcut: 'Shift+Mod+G', onSelect: actions.goToFolder },
  ];

  return [
    { id: 'file', label: 'File', items: file },
    { id: 'edit', label: 'Edit', items: edit },
    { id: 'view', label: 'View', items: view },
    { id: 'go', label: 'Go', items: go },
  ];
}
