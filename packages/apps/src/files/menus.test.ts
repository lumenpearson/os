import type { MenuEntry } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import { describe, expect, it, vi } from 'vitest';
import { NO_FILTER } from './filters';
import { contextMenuFor, type FilesActions, type MenuState, menubarFor } from './menus';
import { DEFAULT_TOOLBAR } from './settings';

function actions(): FilesActions {
  const a = {} as Record<keyof FilesActions, ReturnType<typeof vi.fn>>;
  for (const key of [
    'newWindow',
    'newFolder',
    'newDocument',
    'open',
    'openWith',
    'getInfo',
    'rename',
    'duplicate',
    'trash',
    'putBack',
    'emptyTrash',
    'closeWindow',
    'cut',
    'copy',
    'paste',
    'selectAll',
    'setView',
    'setCardAxis',
    'setIconSize',
    'toggleHidden',
    'toggleSidebar',
    'toggleIndexRail',
    'toggleToolbarPart',
    'setSort',
    'toggleFoldersFirst',
    'setFilter',
    'clearFilter',
    'editPattern',
    'quickLook',
    'back',
    'forward',
    'up',
    'go',
    'goToFolder',
    'toggleFavorite',
  ] as const) {
    a[key] = vi.fn();
  }
  return a as unknown as FilesActions;
}

const file: DirEntry = {
  path: '/home/a.txt',
  name: 'a.txt',
  kind: 'file',
  size: 1,
  modifiedAt: 0,
  createdAt: 0,
};

function state(patch: Partial<MenuState> = {}): MenuState {
  return {
    selection: [],
    target: null,
    singleIsDirectory: false,
    inTrash: false,
    canPutBack: false,
    canPaste: false,
    showHidden: false,
    sidebarVisible: true,
    indexRail: false,
    toolbar: DEFAULT_TOOLBAR,
    view: 'list',
    cardAxis: 'horizontal',
    iconSize: 'medium',
    sort: { column: 'name', direction: 'asc' },
    foldersFirst: true,
    filter: NO_FILTER,
    canBack: false,
    canForward: false,
    canUp: true,
    isFavorite: false,
    openWithApps: [],
    places: [{ label: 'Home', path: '/home' }],
    ...patch,
  };
}

const labels = (items: Array<{ label?: string }>) => items.map((i) => i.label).filter(Boolean);
const id = (keys: string) => keys;

describe('contextMenuFor', () => {
  it('offers creation and view commands on empty space', () => {
    const items = contextMenuFor(state(), actions(), id);
    expect(labels(items)).toEqual([
      'New Folder',
      'New Text File',
      'New Document',
      'Paste',
      'Get Info',
      'Show Hidden Files',
      'Sort By',
      'Filter',
      'View',
    ]);
    expect(items.find((i) => i.id === 'paste')?.enabled).toBe(false);
  });

  it('offers item commands for a selected file and wires them to actions', () => {
    const a = actions();
    const items = contextMenuFor(
      state({ selection: [file.path], target: file, canPaste: true }),
      a,
      id,
    );
    expect(labels(items)).toContain('Open');
    expect(labels(items)).toContain('Move to Trash');
    expect(labels(items)).not.toContain('Add to Favourites');
    items.find((i) => i.id === 'trash')?.onSelect?.();
    expect(a.trash).toHaveBeenCalled();
    expect(items.find((i) => i.id === 'open-with')?.enabled).toBe(false);
  });

  it('adds favourites for a single folder and Put Back inside the Trash', () => {
    const dir: DirEntry = { ...file, kind: 'directory', path: '/home/docs', name: 'docs' };
    const a = actions();
    const items = contextMenuFor(
      state({ selection: [dir.path], target: dir, singleIsDirectory: true, isFavorite: true }),
      a,
      id,
    );
    expect(labels(items)).toContain('Remove from Favourites');
    items.find((i) => i.id === 'favorite')?.onSelect?.();
    expect(a.toggleFavorite).toHaveBeenCalledWith('/home/docs');

    const trashed = contextMenuFor(
      state({ selection: [file.path], target: file, inTrash: true, canPutBack: true }),
      a,
      id,
    );
    expect(labels(trashed)).toContain('Put Back');
    expect(labels(trashed)).toContain('Delete Permanently');
    expect(trashed.find((i) => i.id === 'duplicate')?.enabled).toBe(false);
    expect(labels(contextMenuFor(state({ inTrash: true }), a, id))).toContain('Empty Trash…');
  });

  it('labels multi-selection opens and disables rename', () => {
    const items = contextMenuFor(state({ selection: ['/a', '/b'], target: file }), actions(), id);
    expect(items[0]?.label).toBe('Open 2 Items');
    expect(items.find((i) => i.id === 'rename')?.enabled).toBe(false);
  });
});

describe('view, sort and filter submenus', () => {
  const sub = (items: MenuEntry[], id: string): MenuEntry[] =>
    items.find((i) => i.id === id)?.submenu ?? [];

  it('offers the card lane as a fourth view with its own shortcut', () => {
    const a = actions();
    const view = menubarFor(state(), a)[2]?.items ?? [];
    const cards = view.find((i) => i.id === 'view-cards');
    expect(cards?.label).toBe('as Cards');
    expect(cards?.shortcut).toBe('Mod+4');
    cards?.onSelect?.();
    expect(a.setView).toHaveBeenCalledWith('cards');
  });

  it('keeps the lane axis for the card view only', () => {
    const inList = menubarFor(state(), actions())[2]?.items ?? [];
    expect(inList.find((i) => i.id === 'card-axis')?.enabled).toBe(false);
    const inCards = menubarFor(state({ view: 'cards' }), actions())[2]?.items ?? [];
    expect(inCards.find((i) => i.id === 'card-axis')?.enabled).toBe(true);
  });

  it('shows icon size, the rail and the toolbar parts in View', () => {
    const a = actions();
    const view = menubarFor(state({ iconSize: 'large' }), a)[2]?.items ?? [];
    expect(sub(view, 'icon-size').find((i) => i.id === 'icon-size-large')?.checked).toBe(true);
    view.find((i) => i.id === 'index-rail')?.onSelect?.();
    expect(a.toggleIndexRail).toHaveBeenCalled();
    sub(view, 'toolbar')
      .find((i) => i.id === 'toolbar-search')
      ?.onSelect?.();
    expect(a.toggleToolbarPart).toHaveBeenCalledWith('search');
  });

  it('sorts on three levels: folders first, the column, then the name', () => {
    const a = actions();
    const view = menubarFor(state({ foldersFirst: false }), a)[2]?.items ?? [];
    const sort = sub(view, 'sort-by');
    const foldersFirst = sort.find((i) => i.id === 'sort-folders-first');
    expect(foldersFirst?.checked).toBe(false);
    foldersFirst?.onSelect?.();
    expect(a.toggleFoldersFirst).toHaveBeenCalled();
  });

  it('sets one filter field at a time and clears them together', () => {
    const a = actions();
    const view = menubarFor(state({ filter: { ...NO_FILTER, kind: 'images' } }), a)[2]?.items ?? [];
    const filter = sub(view, 'filter');
    expect(sub(filter, 'filter-kind').find((i) => i.id === 'filter-kind-images')?.checked).toBe(
      true,
    );
    sub(filter, 'filter-size')
      .find((i) => i.id === 'filter-size-small')
      ?.onSelect?.();
    expect(a.setFilter).toHaveBeenCalledWith({ size: 'small' });
    filter.find((i) => i.id === 'filter-pattern')?.onSelect?.();
    expect(a.editPattern).toHaveBeenCalled();
    expect(filter.find((i) => i.id === 'filter-clear')?.enabled).toBe(true);
    const clean = sub(menubarFor(state(), a)[2]?.items ?? [], 'filter');
    expect(clean.find((i) => i.id === 'filter-clear')?.enabled).toBe(false);
  });

  it('repeats the view options in the right-click menu', () => {
    const items = contextMenuFor(state({ view: 'cards' }), actions(), id);
    const view = sub(items, 'view');
    expect(view.map((i) => i.id)).toContain('view-cards');
    expect(view.map((i) => i.id)).toContain('icon-size');
    expect(view.map((i) => i.id)).toContain('toolbar');
    expect(sub(items, 'filter').map((i) => i.id)).toContain('filter-kind');
  });
});

describe('menubarFor', () => {
  it('builds File, Edit, View and Go with shortcuts', () => {
    const a = actions();
    const menus = menubarFor(state({ selection: [file.path], canBack: true }), a);
    expect(menus.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Go']);
    const file_ = menus[0]?.items ?? [];
    expect(file_.find((i) => i.id === 'new-window')?.shortcut).toBe('Mod+N');
    expect(file_.find((i) => i.id === 'trash')?.enabled).toBe(true);
    const go = menus[3]?.items ?? [];
    expect(go.find((i) => i.id === 'back')?.enabled).toBe(true);
    expect(go.find((i) => i.id === 'forward')?.enabled).toBe(false);
    go.find((i) => i.id === 'go-/home')?.onSelect?.();
    expect(a.go).toHaveBeenCalledWith('/home');
    const view = menus[2]?.items ?? [];
    expect(view.find((i) => i.id === 'view-list')?.checked).toBe(true);
    expect(menus[1]?.items.find((i) => i.id === 'undo')?.enabled).toBe(false);
  });
});
