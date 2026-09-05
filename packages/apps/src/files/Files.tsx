import { appsForFile, TRASH_DIR, useClipboardStore } from '@lumen/kernel';
import { useKernel, useSetting, useVfs } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  Button,
  Dialog,
  EmptyState,
  SplitPane,
  useContextMenu,
  useDebounced,
  useDialogs,
  useElementSize,
} from '@lumen/ui';
import { basename, type DirEntry, dirname, isInside, join, VfsError } from '@lumen/vfs';
import { FolderOpen, House, ListFilter, Trash2 } from 'lucide-react';
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useArgs,
  useDirectory,
  useJsonFile,
  useLauncher,
  useNotify,
  useShortcutLabel,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { CardView } from './CardView';
import { ColumnView } from './ColumnView';
import { beginDrag, draggedPaths, endDrag, hasHostFiles, hasPayload, operationFor } from './dnd';
import { FilePreview } from './FilePreview';
import { FilesSidebar, standardPlaces } from './FilesSidebar';
import { FilesToolbar } from './FilesToolbar';
import {
  applyFilter,
  type FilterState,
  filterSummary,
  isFiltering,
  NO_FILTER,
  sortPlanFor,
  sortWithPlan,
} from './filters';
import { GridView } from './GridView';
import { IndexRail } from './IndexRail';
import { InfoDialog } from './InfoDialog';
import { ListView } from './ListView';
import {
  canDrop,
  canGoBack,
  canGoForward,
  createHistory,
  currentPath,
  EMPTY_SELECTION,
  goBack,
  goForward,
  isEditableTarget,
  type LaneAxis,
  pruneSelection,
  pushHistory,
  type Selection,
  type SortState,
  selectAll,
  selectOnly,
  statusText,
  type ViewMode,
} from './logic';
import { contextMenuFor, type FilesActions, type MenuState, menubarFor } from './menus';
import {
  createDocument,
  type DocumentKind,
  describeFailures,
  duplicateAll,
  importHostFiles,
  restoreAll,
  transferInto,
  trashAll,
} from './operations';
import { SearchResults } from './SearchResults';
import {
  DEFAULT_PREFS,
  type FilesPrefs,
  type IconSize,
  normalizePrefs,
  prefsPath,
  type ToolbarPart,
} from './settings';
import type { EntryViewState } from './types';

/** Below this width the sidebar folds away so the file list keeps its columns. */
const NARROW = 560;

/** True while a text field owns the keyboard, so shortcuts stay out of the way. */
function editingElsewhere(): boolean {
  return isEditableTarget(document.activeElement);
}

export default function Files({ args }: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const { container } = useApp();
  const dialogs = useDialogs();
  const notify = useNotify();
  const launcher = useLauncher();
  const shortcut = useShortcutLabel();
  const controls = useWindowControls();
  const [prefs, patchPrefs] = useSetting('files');
  const launchArgs = useArgs(args);

  const home = prefs.home || kernel.home;
  const [history, setHistory] = useState(() =>
    createHistory(typeof launchArgs.path === 'string' ? launchArgs.path : home),
  );
  const path = currentPath(history);
  const inTrash = isInside(TRASH_DIR, path, true);

  /**
   * The window's own preferences — view, card lane, icon size, toolbar,
   * sidebar, A–Z rail, sort and filters — in `~/.config/files.json`, next to
   * every other app's. Settings → Files keeps the system-wide switches
   * (hidden files, folders first, single click); this file keeps the rest.
   */
  const [storedPrefs, storePrefs] = useJsonFile<FilesPrefs>(prefsPath(kernel.home), DEFAULT_PREFS);
  const own = useMemo(
    () => normalizePrefs(storedPrefs, prefs.defaultView),
    [storedPrefs, prefs.defaultView],
  );
  const patchOwn = useCallback(
    (patch: Partial<FilesPrefs>) =>
      storePrefs((previous) => ({ ...normalizePrefs(previous, prefs.defaultView), ...patch })),
    [storePrefs, prefs.defaultView],
  );
  const { view, sort, filter } = own;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [rawQuery, setRawQuery] = useState('');
  const [results, setResults] = useState<DirEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [infoPath, setInfoPath] = useState<string | null>(null);
  const [quickLook, setQuickLook] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => [...kernel.state.favorites]);
  const [places, setPlaces] = useState<ReadonlySet<string>>(new Set());
  const [usage, setUsage] = useState<{ used: number; quota: number | null } | null>(null);

  const [rootRef, rootSize] = useElementSize<HTMLDivElement>();
  const [contentRef, contentSize] = useElementSize<HTMLDivElement>();
  const contentBox = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const menu = useContextMenu();
  const [menuTarget, setMenuTarget] = useState<DirEntry | null>(null);

  const query = useDebounced(rawQuery.trim(), 220);
  const isSearch = query.length > 0;
  const dir = useDirectory(path, { showHidden: prefs.showHidden });
  /** Filter first, then sort: folders first when asked, then the column, then name. */
  const sorted = useMemo(
    () => sortWithPlan(applyFilter(dir.entries, filter), sortPlanFor(sort, prefs.foldersFirst)),
    [dir.entries, filter, sort, prefs.foldersFirst],
  );
  const found = useMemo(() => applyFilter(results, filter), [results, filter]);
  const entries = isSearch ? found : sorted;
  const total = isSearch ? results.length : dir.entries.length;

  const clipboard = useClipboardStore((s) => s.item);
  const copyFiles = useClipboardStore((s) => s.copyFiles);
  const clearClipboard = useClipboardStore((s) => s.clear);
  const clipboardCount = clipboard?.kind === 'files' ? (clipboard.files?.paths.length ?? 0) : 0;
  const cutPaths = useMemo(() => {
    const files = clipboard?.kind === 'files' ? clipboard.files : undefined;
    return new Set(files?.operation === 'cut' ? files.paths : []);
  }, [clipboard]);

  const selected = useMemo(() => [...selection.keys], [selection]);
  const entryFor = useCallback(
    (p: string) => entries.find((e) => e.path === p) ?? sorted.find((e) => e.path === p),
    [entries, sorted],
  );

  // ── window chrome ───────────────────────────────────────────────────────

  useTitle(kernel.labelFor(path));
  const { setDocument } = controls;
  useEffect(() => {
    setDocument(path);
  }, [setDocument, path]);

  // ── loading side data ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const all = standardPlaces(home).map((p) => p.path);
    Promise.all(all.map((p) => vfs.exists(p)))
      .then((flags) => {
        if (!cancelled) setPlaces(new Set(all.filter((_, i) => flags[i])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vfs, home]);

  const refreshUsage = useCallback(() => {
    vfs
      .usage()
      .then(setUsage)
      .catch(() => {});
  }, [vfs]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  /** A file passed as the launch argument opens its folder with the file selected. */
  useEffect(() => {
    const target = launchArgs.path;
    if (typeof target !== 'string') return;
    let cancelled = false;
    vfs
      .stat(target)
      .then((st) => {
        if (cancelled) return;
        setHistory((h) => pushHistory(h, st.kind === 'directory' ? st.path : dirname(st.path)));
        if (st.kind === 'file') setSelection(selectOnly(st.path));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vfs, launchArgs.path]);

  // ── search ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSearch) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    vfs
      .search(path, {
        query,
        limit: 400,
        includeHidden: prefs.showHidden,
        signal: controller.signal,
      })
      .then((found) => {
        if (!controller.signal.aborted) setResults(found);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [vfs, path, query, isSearch, prefs.showHidden]);

  /** Keep the selection across refreshes, dropping only what really disappeared. */
  useEffect(() => {
    const existing = new Set(entries.map((e) => e.path));
    setSelection((sel) => {
      const relaxed = view === 'columns' && !isSearch;
      const survives = (k: string) => existing.has(k) || (relaxed && dirname(k) !== path);
      const allowed = new Set(
        [...sel.keys, sel.anchor, sel.cursor].filter((k): k is string => k !== null && survives(k)),
      );
      return pruneSelection(sel, allowed);
    });
  }, [entries, view, isSearch, path]);

  // ── navigation ──────────────────────────────────────────────────────────

  const focusContent = useCallback(() => {
    contentBox.current
      ?.querySelector<HTMLElement>('[role="listbox"], [role="grid"]')
      ?.focus({ preventScroll: true });
  }, []);

  const go = useCallback((next: string) => {
    setHistory((h) => pushHistory(h, next));
    setSelection(EMPTY_SELECTION);
    setRenaming(null);
    setTrail([]);
    setRawQuery('');
  }, []);

  const openEntry = useCallback(
    (entry: DirEntry) => {
      if (entry.kind === 'directory') go(entry.path);
      else void kernel.open(entry.path);
    },
    [go, kernel],
  );

  // ── operations ──────────────────────────────────────────────────────────

  const report = useCallback(
    (result: { done: string[]; failed: Array<{ path: string; error: string }> }, verb: string) => {
      const message = describeFailures(result, verb);
      if (message) notify(message);
      return result;
    },
    [notify],
  );

  /** Serialise the file operations so a held key cannot start the same job twice. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await fn();
      } finally {
        busy.current = false;
        refreshUsage();
      }
    },
    [refreshUsage],
  );

  const createAndRename = useCallback(
    (make: () => Promise<string>) =>
      run(async () => {
        try {
          const created = await make();
          setSelection(selectOnly(created));
          setRenaming(created);
        } catch (e) {
          notify('Could not create the item', VfsError.is(e) ? e.message : String(e));
        }
      }),
    [run, notify],
  );

  const commitRename = useCallback(
    (target: string, name: string) => {
      setRenaming(null);
      void run(async () => {
        try {
          const next = join(dirname(target), name);
          await vfs.rename(target, next);
          setSelection(selectOnly(next));
        } catch (e) {
          notify(`Could not rename ${basename(target)}`, VfsError.is(e) ? e.message : String(e));
        }
      });
    },
    [run, vfs, notify],
  );

  /** Move or copy into `target`, selecting the results when they land in view. */
  const transfer = useCallback(
    async (sources: string[], target: string, operation: 'move' | 'copy') => {
      const result = report(await transferInto(vfs, sources, target, operation), operation);
      if (result.done.length > 0 && dirname(result.done[0] as string) === path) {
        setSelection(selectAll(result.done));
      }
    },
    [report, vfs, path],
  );

  const dropOnFolder = useCallback(
    (target: string, e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      endDrag();
      if (hasHostFiles(e) && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        void run(async () => {
          report(await importHostFiles(vfs, target, files), 'copy');
        });
        return;
      }
      const sources = draggedPaths(e);
      const operation = operationFor(e);
      if (!canDrop(sources, target, operation)) return;
      void run(() => transfer(sources, target, operation));
    },
    [run, report, vfs, transfer],
  );

  const dragOverFolder = useCallback((target: string, e: DragEvent) => {
    if (!hasPayload(e)) return;
    const operation = operationFor(e);
    if (hasHostFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropTarget(target);
      return;
    }
    if (!canDrop(draggedPaths(e), target, operation)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = operation;
    setDropTarget(target);
  }, []);

  // ── actions ─────────────────────────────────────────────────────────────

  const actions = useMemo<FilesActions>(() => {
    const targets = () => [...selection.keys];
    const confirmTrash = async (paths: string[]) => {
      const permanent = inTrash;
      if (!permanent && !prefs.confirmDelete) return true;
      const what = paths.length === 1 ? basename(paths[0] as string) : `${paths.length} items`;
      return dialogs.confirm({
        title: permanent ? `Delete ${what}?` : `Move ${what} to the Trash?`,
        message: permanent ? 'This cannot be undone.' : undefined,
        confirmLabel: permanent ? 'Delete' : 'Move to Trash',
        danger: true,
      });
    };
    return {
      newWindow: () => launcher.launch('lumen.files', { path }),
      newFolder: () => void createAndRename(() => vfs.createFolder(path)),
      newDocument: (kind: DocumentKind) =>
        void createAndRename(() => createDocument(vfs, path, kind)),
      open: () => {
        const list = targets();
        if (list.length === 0) return;
        const first = entryFor(list[0] as string);
        if (list.length === 1 && first) {
          openEntry(first);
          return;
        }
        for (const p of list) {
          const entry = entryFor(p);
          if (entry?.kind === 'file') void kernel.open(p);
        }
      },
      openWith: (appId: string) => {
        const first = targets()[0];
        if (first) void kernel.open(first, { with: appId });
      },
      getInfo: () => setInfoPath(targets()[0] ?? path),
      rename: () => {
        if (editingElsewhere()) return;
        const first = targets()[0];
        if (first) setRenaming(first);
      },
      duplicate: () => {
        if (editingElsewhere()) return;
        const list = targets();
        if (list.length === 0) return;
        void run(async () => {
          const result = report(await duplicateAll(vfs, list), 'duplicate');
          if (result.done.length > 0) setSelection(selectAll(result.done));
        });
      },
      trash: () => {
        if (editingElsewhere()) return;
        const list = targets();
        if (list.length === 0) return;
        void run(async () => {
          if (!(await confirmTrash(list))) return;
          report(await trashAll(vfs, list), 'delete');
          setSelection(EMPTY_SELECTION);
        });
      },
      putBack: () => {
        const list = targets();
        if (list.length === 0) return;
        void run(async () => {
          report(await restoreAll(vfs, list), 'restore');
          setSelection(EMPTY_SELECTION);
        });
      },
      emptyTrash: () => {
        void run(async () => {
          const ok = await dialogs.confirm({
            title: 'Empty the Trash?',
            message: 'Everything in the Trash is deleted for good.',
            confirmLabel: 'Empty Trash',
            danger: true,
          });
          if (!ok) return;
          await vfs.emptyTrash();
          setSelection(EMPTY_SELECTION);
        });
      },
      closeWindow: () => void controls.close(),
      cut: () => {
        if (editingElsewhere()) return;
        const list = targets();
        if (list.length > 0) copyFiles(list, 'cut');
      },
      copy: () => {
        if (editingElsewhere()) return;
        const list = targets();
        if (list.length > 0) copyFiles(list, 'copy');
      },
      paste: () => {
        if (editingElsewhere()) return;
        const item = useClipboardStore.getState().item;
        const files = item?.kind === 'files' ? item.files : undefined;
        if (!files || files.paths.length === 0) return;
        void run(async () => {
          await transfer(files.paths, path, files.operation === 'cut' ? 'move' : 'copy');
          if (files.operation === 'cut') clearClipboard();
        });
      },
      selectAll: () => {
        if (editingElsewhere()) return;
        setSelection(selectAll(entries.map((e) => e.path)));
      },
      setView: (next: ViewMode) => {
        patchOwn({ view: next });
        // Settings → Files holds the view new windows open in; keep it in step.
        patchPrefs({ defaultView: next });
        setTrail([]);
      },
      setCardAxis: (axis: LaneAxis) => patchOwn({ cardAxis: axis }),
      setIconSize: (size: IconSize) => patchOwn({ iconSize: size }),
      toggleHidden: () => patchPrefs({ showHidden: !prefs.showHidden }),
      toggleSidebar: () => patchOwn({ sidebar: !own.sidebar }),
      toggleIndexRail: () => patchOwn({ indexRail: !own.indexRail }),
      toggleToolbarPart: (part: ToolbarPart) =>
        patchOwn({ toolbar: { ...own.toolbar, [part]: !own.toolbar[part] } }),
      setSort: (next: SortState) => patchOwn({ sort: next }),
      toggleFoldersFirst: () => patchPrefs({ foldersFirst: !prefs.foldersFirst }),
      setFilter: (patch: Partial<FilterState>) => patchOwn({ filter: { ...filter, ...patch } }),
      clearFilter: () => patchOwn({ filter: NO_FILTER }),
      editPattern: () => {
        void (async () => {
          const answer = await dialogs.prompt({
            title: 'Filter by Name',
            message: 'Type part of a name, or a pattern with * and ?.',
            defaultValue: filter.pattern,
            mono: true,
            confirmLabel: 'Filter',
          });
          if (answer === null) return;
          patchOwn({ filter: { ...filter, pattern: answer.trim() } });
        })();
      },
      quickLook: () => {
        const first = targets()[0];
        setQuickLook((current) => (current ? null : (first ?? null)));
      },
      back: () => setHistory((h) => goBack(h)),
      forward: () => setHistory((h) => goForward(h)),
      up: () => go(dirname(path)),
      go,
      goToFolder: () => {
        void (async () => {
          const answer = await dialogs.prompt({
            title: 'Go to Folder',
            message: 'Type a path. "~" is your home folder.',
            defaultValue: path,
            mono: true,
            confirmLabel: 'Go',
          });
          if (answer === null) return;
          const target = kernel.expandPath(answer.trim());
          if (await vfs.isDirectory(target)) go(target);
          else await dialogs.alert({ title: 'No such folder', message: target });
        })();
      },
      toggleFavorite: (target: string) => {
        kernel.toggleFavorite(target);
        setFavorites([...kernel.state.favorites]);
      },
    };
  }, [
    selection,
    path,
    inTrash,
    entries,
    entryFor,
    prefs.confirmDelete,
    prefs.showHidden,
    prefs.foldersFirst,
    own.sidebar,
    own.indexRail,
    own.toolbar,
    filter,
    patchOwn,
    dialogs,
    kernel,
    vfs,
    launcher,
    controls,
    copyFiles,
    clearClipboard,
    createAndRename,
    openEntry,
    patchPrefs,
    report,
    run,
    transfer,
    go,
  ]);

  // ── menus ───────────────────────────────────────────────────────────────

  const menuState = useMemo<MenuState>(() => {
    const first = selected[0];
    const single = selected.length === 1 && first !== undefined ? entryFor(first) : undefined;
    return {
      selection: selected,
      target: menuTarget,
      singleIsDirectory: single?.kind === 'directory',
      inTrash,
      canPutBack: inTrash && selected.length > 0,
      canPaste: clipboardCount > 0,
      showHidden: prefs.showHidden,
      sidebarVisible: own.sidebar,
      indexRail: own.indexRail,
      toolbar: own.toolbar,
      view,
      cardAxis: own.cardAxis,
      iconSize: own.iconSize,
      sort,
      foldersFirst: prefs.foldersFirst,
      filter,
      canBack: canGoBack(history),
      canForward: canGoForward(history),
      canUp: path !== '/',
      isFavorite: first !== undefined && favorites.includes(first),
      openWithApps: single && single.kind === 'file' ? appsForFile(single.path) : [],
      places: [
        { label: 'Home', path: home, shortcut: 'Shift+Mod+H' },
        { label: 'Desktop', path: join(home, 'Desktop') },
        { label: 'Documents', path: join(home, 'Documents') },
        { label: 'Downloads', path: join(home, 'Downloads') },
        { label: 'Applications', path: '/Applications' },
        { label: 'Trash', path: TRASH_DIR },
      ],
    };
  }, [
    selected,
    menuTarget,
    inTrash,
    clipboardCount,
    prefs.showHidden,
    prefs.foldersFirst,
    own.sidebar,
    own.indexRail,
    own.toolbar,
    own.cardAxis,
    own.iconSize,
    view,
    sort,
    filter,
    history,
    path,
    favorites,
    home,
    entryFor,
  ]);

  useAppMenus(menubarFor(menuState, actions), [menuState, actions]);

  const openContextMenu = useCallback(
    (entry: DirEntry | null, e: MouseEvent) => {
      if (entry && !selection.keys.has(entry.path)) setSelection(selectOnly(entry.path));
      setMenuTarget(entry);
      menu.openAt(e);
    },
    [menu.openAt, selection],
  );

  // ── keyboard ────────────────────────────────────────────────────────────

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || isEditableTarget(e.target as Element)) return;
    if (e.key === 'Enter' && selected.length > 0) {
      e.preventDefault();
      actions.open();
    } else if (e.key === 'Backspace' && selected.length > 0 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      actions.trash();
    } else if (e.key === ' ' && selected.length > 0) {
      e.preventDefault();
      actions.quickLook();
    } else if (e.key === 'Escape') {
      if (quickLook) setQuickLook(null);
      else if (rawQuery) setRawQuery('');
      else setSelection(EMPTY_SELECTION);
    }
  };

  // ── views ───────────────────────────────────────────────────────────────

  const narrow = rootSize.width > 0 && rootSize.width < NARROW;
  const showSidebar = own.sidebar && !narrow;
  const filtering = isFiltering(filter);
  const showRail = own.indexRail && view !== 'columns' && entries.length > 0;

  const viewState: EntryViewState = {
    selection,
    renaming,
    cutPaths,
    dropTarget,
    focused: controls.focused,
  };
  const handlers = {
    onSelectionChange: setSelection,
    onOpen: openEntry,
    onContextMenu: openContextMenu,
    onDragStart: (entry: DirEntry, e: DragEvent) => {
      const paths = selection.keys.has(entry.path) ? [...selection.keys] : [entry.path];
      if (!selection.keys.has(entry.path)) setSelection(selectOnly(entry.path));
      beginDrag(e, paths);
    },
    onDragOver: (entry: DirEntry, e: DragEvent) => {
      if (entry.kind !== 'directory') return;
      dragOverFolder(entry.path, e);
    },
    onDrop: (entry: DirEntry, e: DragEvent) => {
      if (entry.kind !== 'directory') return;
      e.stopPropagation();
      dropOnFolder(entry.path, e);
    },
    onRenameCommit: commitRename,
    onRenameCancel: () => setRenaming(null),
  };

  const emptyState = dir.error ? (
    <EmptyState
      icon={<FolderOpen />}
      title={
        dir.error.code === 'ENOENT'
          ? 'This folder no longer exists'
          : 'This folder cannot be opened'
      }
      description={dir.error.message}
      action={
        <Button icon={<House className="size-3.5" />} onClick={() => go(home)}>
          Go Home
        </Button>
      }
    />
  ) : filtering && total > 0 ? (
    <EmptyState
      icon={<ListFilter />}
      title="Nothing here matches the filter"
      description={filterSummary(filter)}
      action={<Button onClick={actions.clearFilter}>Clear Filters</Button>}
    />
  ) : (
    <EmptyState
      icon={inTrash ? <Trash2 /> : <FolderOpen />}
      title={inTrash ? 'The Trash is empty' : 'Empty folder'}
      description={inTrash ? undefined : 'Drop files here, or make something with New Folder.'}
    />
  );

  const body = dir.error ? (
    emptyState
  ) : isSearch ? (
    <SearchResults
      entries={found}
      query={query}
      searching={searching}
      {...viewState}
      {...handlers}
    />
  ) : view === 'list' ? (
    <ListView
      entries={sorted}
      sort={sort}
      onSortChange={actions.setSort}
      width={contentSize.width}
      emptyState={emptyState}
      {...viewState}
      {...handlers}
    />
  ) : view === 'grid' ? (
    <GridView
      entries={sorted}
      iconSize={own.iconSize}
      emptyState={emptyState}
      {...viewState}
      {...handlers}
    />
  ) : view === 'cards' ? (
    <CardView
      entries={sorted}
      axis={own.cardAxis}
      iconSize={own.iconSize}
      emptyState={emptyState}
      {...viewState}
      {...handlers}
    />
  ) : (
    <ColumnView
      path={path}
      trail={trail}
      onTrailChange={setTrail}
      showHidden={prefs.showHidden}
      sort={sort}
      foldersFirst={prefs.foldersFirst}
      {...viewState}
      {...handlers}
    />
  );

  const content = (
    <div
      ref={contentBox}
      className="flex h-full min-h-0 flex-col"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (!(e.target as HTMLElement).closest('[data-path],[role="option"],[role="row"]'))
          setSelection(EMPTY_SELECTION);
      }}
      onClick={(e) => {
        if (!prefs.singleClickOpen || e.detail > 1) return;
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-path]');
        const entry = el?.dataset.path ? entryFor(el.dataset.path) : undefined;
        if (entry) openEntry(entry);
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('[data-path],[role="option"]')) return;
        openContextMenu(null, e);
      }}
      onDragOver={(e) => {
        if (!hasPayload(e) || (e.target as HTMLElement).closest('[role="option"],[role="row"]'))
          return;
        dragOverFolder(path, e);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
      onDrop={(e) => {
        if ((e.target as HTMLElement).closest('[role="option"],[role="row"]')) return;
        dropOnFolder(path, e);
      }}
    >
      <div className="flex min-h-0 flex-1">
        <div ref={contentRef} className="min-w-0 flex-1">
          {body}
        </div>
        {showRail && (
          <IndexRail
            entries={entries}
            cursor={selection.cursor}
            onJump={(target) => setSelection(selectOnly(target))}
          />
        )}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="h-full w-full">
      <AppFrame
        toolbar={
          <FilesToolbar
            path={path}
            home={home}
            canBack={canGoBack(history)}
            canForward={canGoForward(history)}
            view={view}
            sort={sort}
            query={rawQuery}
            onQueryChange={setRawQuery}
            inTrash={inTrash}
            sidebarVisible={own.sidebar}
            foldersFirst={prefs.foldersFirst}
            filter={filter}
            parts={own.toolbar}
            menuState={menuState}
            narrow={narrow}
            actions={actions}
            onDragOverFolder={dragOverFolder}
            onDropFolder={dropOnFolder}
          />
        }
        statusBar={
          <>
            <span className="tabular-nums">
              {statusText(entries.length, selection.keys.size, usage, total)}
            </span>
            {isSearch && <span className="text-ink-3">Results in {kernel.labelFor(path)}</span>}
            {filtering && <span className="text-ink-3">Filter: {filterSummary(filter)}</span>}
          </>
        }
      >
        <SplitPane
          storageKey="files.sidebar"
          initial={200}
          min={160}
          max={320}
          collapsed={!showSidebar}
          first={
            <FilesSidebar
              path={path}
              home={home}
              existing={places}
              favorites={favorites}
              dropTarget={dropTarget}
              onNavigate={(p) => {
                go(p);
                focusContent();
              }}
              onOpenNewWindow={(p) => launcher.launch('lumen.files', { path: p })}
              onRemoveFavorite={actions.toggleFavorite}
              onAddFavorites={(paths) => {
                for (const p of paths) if (!favorites.includes(p)) kernel.toggleFavorite(p);
                setFavorites([...kernel.state.favorites]);
                endDrag();
              }}
              onDragOverFolder={dragOverFolder}
              onDropFolder={dropOnFolder}
              onDragLeave={() => setDropTarget(null)}
            />
          }
          second={content}
        />
      </AppFrame>
      <AnchoredMenu
        open={menu.open}
        at={menu.at}
        onClose={menu.close}
        items={contextMenuFor(menuState, actions, shortcut)}
      />
      {infoPath && <InfoDialog path={infoPath} onClose={() => setInfoPath(null)} />}
      {quickLook && (
        <Dialog
          open
          onClose={() => setQuickLook(null)}
          title={basename(quickLook)}
          width={640}
          container={container}
          className="h-[70vh]"
        >
          <FilePreview path={quickLook} large />
        </Dialog>
      )}
    </div>
  );
}
