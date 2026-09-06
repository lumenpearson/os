import { useKernel, useSetting } from '@lumen/kernel/react';
import { EmptyState, type MenuEntry, useLatest } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Compass } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useFilePicker,
  useJsonFile,
  useNotify,
  useShortcut,
  useShortcutLabel,
  useTitle,
  useWindowControls,
} from '../_sdk';
import {
  addBookmark,
  type BrowserData,
  DEFAULT_DATA,
  findBookmark,
  nextId,
  normalizeData,
  removeBookmark,
  renameBookmark,
} from './data';
import { FavoritesBar } from './FavoritesBar';
import { Frame } from './Frame';
import { canGoBack, canGoForward, recordVisit, removeVisit } from './history';
import { type BrowserActions, menubarFor, SHORTCUTS, zoomResetLabel } from './menus';
import { NavigationBar } from './NavigationBar';
import { HistoryPage } from './pages/History';
import { Library } from './pages/Library';
import { BrowserSettingsPage } from './pages/Settings';
import { Start } from './pages/Start';
import {
  type BrowserSettings,
  displayPath,
  downloadsPath,
  engineFor,
  newTabUrl,
  sandboxFor,
  withHost,
  withoutHost,
} from './settings';
import { TabStrip } from './TabStrip';
import {
  activeTab,
  createTabsState,
  nextTabId,
  type TabDefaults,
  tabIndexFor,
  tabShortcut,
  tabsReducer,
} from './tabs';
import {
  BOOKMARKS_URL,
  HISTORY_URL,
  internalPage,
  isInternalUrl,
  opensExternally,
  SETTINGS_URL,
  START_URL,
  titleFor,
} from './url';

const DATA_FILE = '.config/browser.json';
const EXPORT_NAME = 'bookmarks.json';

/**
 * A browser over sandboxed frames. Nothing inside a frame can be read from
 * here — no title, no links, no text, no response headers — so a tab is named
 * after its host, and a page that never reports a load says what is known
 * about why rather than pretending.
 */
export default function Browser({ args }: AppProps) {
  const kernel = useKernel();
  const [keyboard] = useSetting('keyboard');
  const shortcutLabel = useShortcutLabel();
  const { focused, close } = useWindowControls();
  const notify = useNotify();
  const pickFile = useFilePicker();
  const addressRef = useRef<HTMLInputElement>(null);

  const dataPath = useMemo(() => join(kernel.home, DATA_FILE), [kernel.home]);
  const [stored, setStored] = useJsonFile<BrowserData>(dataPath, DEFAULT_DATA);
  const data = useMemo(() => normalizeData(stored), [stored]);
  const settings = data.settings;
  const engine = useMemo(() => engineFor(settings), [settings]);
  const sandbox = useMemo(() => sandboxFor(settings), [settings]);

  const update = useCallback(
    (fn: (previous: BrowserData) => BrowserData) => {
      setStored((previous) => fn(normalizeData(previous)));
    },
    [setStored],
  );

  const updateSettings = useCallback(
    (patch: Partial<BrowserSettings>) => {
      update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    },
    [update],
  );

  const [state, dispatch] = useReducer(tabsReducer, args, (launch) =>
    createTabsState(nextTabId(), typeof launch.url === 'string' ? launch.url : undefined),
  );
  const stateRef = useLatest(state);
  const tab = activeTab(state);
  const url = tab?.url ?? START_URL;
  const page = internalPage(url);
  const internal = isInternalUrl(url);
  const bookmark = findBookmark(data.bookmarks, url);

  useTitle(tab?.title ?? 'Browser');

  // ── launching ───────────────────────────────────────────────────────────

  const launched = useRef(typeof args.url === 'string' ? args.url : null);
  const launch = useArgs<{ url?: string }>(args);
  useEffect(() => {
    const next = launch.url;
    if (typeof next !== 'string' || next === launched.current) return;
    launched.current = next;
    dispatch({ type: 'open', id: nextTabId(), url: next });
  }, [launch.url]);

  // ── settings the tabs need ──────────────────────────────────────────────

  // The file arrives after the first render, so the tab list is told about the
  // zoom and the open-outside list once they are known, and again on a change.
  const defaults = useMemo<TabDefaults>(
    () => ({ zoom: settings.defaultZoom, externalHosts: settings.externalHosts }),
    [settings.defaultZoom, settings.externalHosts],
  );
  useEffect(() => dispatch({ type: 'defaults', defaults }), [defaults]);

  // ── the visit log ───────────────────────────────────────────────────────

  // One entry per load, keyed by the generation the tab was on when it was
  // written, so a reload updates the entry instead of stacking duplicates.
  const logged = useRef(new Map<string, number>());
  useEffect(() => {
    const live = new Set(state.tabs.map((t) => t.id));
    for (const id of logged.current.keys()) if (!live.has(id)) logged.current.delete(id);
    if (!settings.keepHistory) return;
    for (const t of state.tabs) {
      if (isInternalUrl(t.url) || logged.current.get(t.id) === t.generation) continue;
      logged.current.set(t.id, t.generation);
      const visit = { id: nextId('visit'), url: t.url, title: t.title, visitedAt: Date.now() };
      update((d) => ({ ...d, history: recordVisit(d.history, visit) }));
    }
  }, [state.tabs, settings.keepHistory, update]);

  // ── commands ────────────────────────────────────────────────────────────

  /** Hand an address to the browser Lumen itself is running in. */
  const openOutside = useCallback((target: string) => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') return;
    window.open(target, '_blank', 'noopener,noreferrer');
  }, []);

  const go = useCallback(
    (target: string) => {
      // Done here rather than in an effect so the window opens inside the
      // click or keystroke that asked for it, which is what keeps a pop-up
      // blocker out of the way.
      if (opensExternally(target, stateRef.current.defaults.externalHosts)) openOutside(target);
      dispatch({ type: 'navigate', url: target });
    },
    [openOutside, stateRef],
  );
  const openTab = useCallback(
    (target?: string) => dispatch({ type: 'open', id: nextTabId(), url: target }),
    [],
  );
  const onLoaded = useCallback((id: string) => dispatch({ type: 'loaded', id }), []);
  const onBlocked = useCallback((id: string) => dispatch({ type: 'blocked', id }), []);
  const onReloadTab = useCallback((id: string) => dispatch({ type: 'reload', id }), []);

  const alwaysOutside = useCallback(
    (target: string) =>
      updateSettings({ externalHosts: withHost(stateRef.current.defaults.externalHosts, target) }),
    [stateRef, updateSettings],
  );
  const stopOutside = useCallback(
    (target: string) =>
      updateSettings({
        externalHosts: withoutHost(stateRef.current.defaults.externalHosts, target),
      }),
    [stateRef, updateSettings],
  );

  const closeTab = useCallback(
    (id?: string) => {
      const current = stateRef.current;
      const target = id ?? current.activeId;
      if (!target) return;
      // Closing the last tab closes the window, as every browser does.
      if (current.tabs.length <= 1) void close();
      else dispatch({ type: 'close', id: target });
    },
    [stateRef, close],
  );

  const toggleBookmark = useCallback(() => {
    const current = activeTab(stateRef.current);
    if (!current) return;
    update((d) => {
      const existing = findBookmark(d.bookmarks, current.url);
      if (existing) return { ...d, bookmarks: removeBookmark(d.bookmarks, existing.id) };
      return {
        ...d,
        bookmarks: addBookmark(d.bookmarks, {
          id: nextId('bookmark'),
          url: current.url,
          title: current.title || titleFor(current.url),
          addedAt: Date.now(),
        }),
      };
    });
  }, [stateRef, update]);

  // ── the downloads folder ────────────────────────────────────────────────

  const chooseDownloads = useCallback(async () => {
    const chosen = await pickFile({
      mode: 'folder',
      title: 'Choose a downloads folder',
      startDir: kernel.home,
      confirmLabel: 'Use Folder',
    });
    if (typeof chosen === 'string') updateSettings({ downloadsDir: chosen });
  }, [pickFile, kernel.home, updateSettings]);

  const exportBookmarks = useCallback(async () => {
    const dir = downloadsPath(settings, kernel.home);
    try {
      await kernel.vfs.ensureDir(dir);
      const name = await kernel.vfs.freeName(dir, EXPORT_NAME);
      const path = join(dir, name);
      await kernel.vfs.writeJson(
        path,
        data.bookmarks.map((b) => ({ title: b.title, url: b.url, addedAt: b.addedAt })),
      );
      notify('Bookmarks exported', displayPath(path, kernel.home));
    } catch (error) {
      notify('Could not export bookmarks', error instanceof Error ? error.message : String(error));
    }
  }, [settings, kernel.home, kernel.vfs, data.bookmarks, notify]);

  // The menubar keeps its item list between renders, so every command reaches
  // the current state through this ref rather than through a closure.
  const commands = useLatest({
    newTab: () => openTab(newTabUrl(settings)),
    closeTab: () => closeTab(),
    back: () => dispatch({ type: 'back' }),
    forward: () => dispatch({ type: 'forward' }),
    reload: () => dispatch({ type: 'reload' }),
    stop: () => dispatch({ type: 'stop' }),
    home: () => go(settings.homepage),
    showHistory: () => go(HISTORY_URL),
    toggleBookmark,
    showBookmarks: () => go(BOOKMARKS_URL),
    showSettings: () => go(SETTINGS_URL),
    toggleBookmarksBar: () => updateSettings({ showBookmarksBar: !settings.showBookmarksBar }),
    zoomIn: () => dispatch({ type: 'zoom', direction: 'in' }),
    zoomOut: () => dispatch({ type: 'zoom', direction: 'out' }),
    zoomReset: () => dispatch({ type: 'zoom', direction: 'reset' }),
    focusAddress: () => addressRef.current?.focus(),
  });

  const actions = useMemo<BrowserActions>(
    () => ({
      newTab: () => commands.current.newTab(),
      closeTab: () => commands.current.closeTab(),
      back: () => commands.current.back(),
      forward: () => commands.current.forward(),
      reload: () => commands.current.reload(),
      stop: () => commands.current.stop(),
      home: () => commands.current.home(),
      showHistory: () => commands.current.showHistory(),
      toggleBookmark: () => commands.current.toggleBookmark(),
      showBookmarks: () => commands.current.showBookmarks(),
      showSettings: () => commands.current.showSettings(),
      toggleBookmarksBar: () => commands.current.toggleBookmarksBar(),
      zoomIn: () => commands.current.zoomIn(),
      zoomOut: () => commands.current.zoomOut(),
      zoomReset: () => commands.current.zoomReset(),
    }),
    [commands],
  );

  // ── keyboard ────────────────────────────────────────────────────────────

  const back = canGoBack(tab?.stack ?? { entries: [], index: 0 });
  const forward = canGoForward(tab?.stack ?? { entries: [], index: 0 });
  const zoom = tab?.zoom ?? settings.defaultZoom;
  const loading = tab?.status === 'loading';

  useAppMenus(
    menubarFor(
      {
        canBack: back,
        canForward: forward,
        loading,
        bookmarked: bookmark !== null,
        showBookmarksBar: settings.showBookmarksBar,
        zoom,
        defaultZoom: settings.defaultZoom,
      },
      actions,
    ),
    [
      actions,
      back,
      forward,
      loading,
      bookmark !== null,
      settings.showBookmarksBar,
      zoom,
      settings.defaultZoom,
    ],
  );

  useShortcut(SHORTCUTS.focusAddress, () => commands.current.focusAddress());
  useShortcut(SHORTCUTS.settings, () => commands.current.showSettings());
  // The `+` key carries Shift on most layouts, so Mod+= alone does not catch it.
  useShortcut('Mod+Shift+plus', () => commands.current.zoomIn());

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const action = tabShortcut(e, keyboard.modifier);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'next') dispatch({ type: 'cycle', delta: 1 });
      else if (action.type === 'previous') dispatch({ type: 'cycle', delta: -1 });
      else {
        const tabs = stateRef.current.tabs;
        const target = tabs[tabIndexFor(action.index, tabs.length)];
        if (target) dispatch({ type: 'activate', id: target.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, keyboard.modifier, stateRef]);

  // ── the toolbar's overflow menu ─────────────────────────────────────────

  const menuItems = useMemo<MenuEntry[]>(
    () => [
      {
        id: 'new-tab',
        label: 'New Tab',
        shortcut: shortcutLabel(SHORTCUTS.newTab),
        onSelect: actions.newTab,
      },
      { type: 'separator' },
      {
        id: 'zoom-out',
        label: 'Zoom Out',
        shortcut: shortcutLabel(SHORTCUTS.zoomOut),
        onSelect: actions.zoomOut,
      },
      {
        id: 'zoom-in',
        label: 'Zoom In',
        shortcut: shortcutLabel(SHORTCUTS.zoomIn),
        onSelect: actions.zoomIn,
      },
      {
        id: 'zoom-reset',
        label: zoomResetLabel(zoom, settings.defaultZoom),
        shortcut: shortcutLabel(SHORTCUTS.zoomReset),
        enabled: zoom !== settings.defaultZoom,
        onSelect: actions.zoomReset,
      },
      { type: 'separator' },
      {
        id: 'history',
        label: 'History',
        shortcut: shortcutLabel(SHORTCUTS.showHistory),
        onSelect: actions.showHistory,
      },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        shortcut: shortcutLabel(SHORTCUTS.showBookmarks),
        onSelect: actions.showBookmarks,
      },
      {
        id: 'bookmarks-bar',
        type: 'checkbox',
        label: 'Show Bookmarks Bar',
        shortcut: shortcutLabel(SHORTCUTS.bookmarksBar),
        checked: settings.showBookmarksBar,
        onSelect: actions.toggleBookmarksBar,
      },
      { type: 'separator' },
      {
        id: 'settings',
        label: 'Browser Settings',
        shortcut: shortcutLabel(SHORTCUTS.settings),
        onSelect: actions.showSettings,
      },
    ],
    [actions, shortcutLabel, zoom, settings.defaultZoom, settings.showBookmarksBar],
  );

  // ── the page ────────────────────────────────────────────────────────────

  const internalBody = () => {
    switch (page) {
      case 'start':
        return (
          <Start
            bookmarks={data.bookmarks}
            history={data.history}
            engine={engine}
            onNavigate={go}
          />
        );
      case 'blank':
        return <div className="h-full w-full bg-surface" />;
      case 'history':
        return (
          <HistoryPage
            history={data.history}
            onNavigate={go}
            onRemove={(id) => update((d) => ({ ...d, history: removeVisit(d.history, id) }))}
            onClearAll={() => update((d) => ({ ...d, history: [] }))}
          />
        );
      case 'bookmarks':
        return (
          <Library
            bookmarks={data.bookmarks}
            engine={engine}
            onNavigate={go}
            onAdd={(target, title) =>
              update((d) => ({
                ...d,
                bookmarks: addBookmark(d.bookmarks, {
                  id: nextId('bookmark'),
                  url: target,
                  title,
                  addedAt: Date.now(),
                }),
              }))
            }
            onRename={(id, title) =>
              update((d) => ({ ...d, bookmarks: renameBookmark(d.bookmarks, id, title) }))
            }
            onRemove={(id) => update((d) => ({ ...d, bookmarks: removeBookmark(d.bookmarks, id) }))}
          />
        );
      case 'settings':
        return (
          <BrowserSettingsPage
            settings={settings}
            home={kernel.home}
            bookmarkCount={data.bookmarks.length}
            historyCount={data.history.length}
            onChange={updateSettings}
            onChooseDownloads={() => void chooseDownloads()}
            onExportBookmarks={() => void exportBookmarks()}
            onClearHistory={() => update((d) => ({ ...d, history: [] }))}
            onClearBookmarks={() => update((d) => ({ ...d, bookmarks: [] }))}
          />
        );
      default:
        return (
          <EmptyState
            icon={<Compass />}
            title="No page at this address"
            description={`Lumen has no internal page called ${url}.`}
          />
        );
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-surface text-ink">
      <TabStrip
        tabs={state.tabs}
        activeId={state.activeId}
        onSelect={(id) => dispatch({ type: 'activate', id })}
        onClose={closeTab}
        onNew={() => actions.newTab()}
      />
      <NavigationBar
        url={url}
        status={tab?.status ?? 'idle'}
        engine={engine}
        bookmarks={data.bookmarks}
        history={data.history}
        canBack={back}
        canForward={forward}
        bookmarked={bookmark !== null}
        menuItems={menuItems}
        addressRef={addressRef}
        onNavigate={go}
        onBack={actions.back}
        onForward={actions.forward}
        onReload={actions.reload}
        onStop={actions.stop}
        onHome={actions.home}
        onToggleBookmark={actions.toggleBookmark}
        onSettings={actions.showSettings}
        onSettingsPage={page === 'settings'}
      />
      {settings.showBookmarksBar && (
        <FavoritesBar bookmarks={data.bookmarks} onOpen={go} onShowAll={actions.showBookmarks} />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        {state.tabs.map((t) =>
          isInternalUrl(t.url) ? null : (
            <Frame
              key={t.id}
              tab={t}
              active={t.id === state.activeId}
              sandbox={sandbox}
              timeoutMs={settings.frameTimeoutMs}
              onLoaded={onLoaded}
              onBlocked={onBlocked}
              onReload={onReloadTab}
              onOpenOutside={openOutside}
              onAlwaysOutside={alwaysOutside}
              onStopOutside={stopOutside}
            />
          ),
        )}
        {internal && (
          <div className="absolute inset-0" style={{ zoom }}>
            {internalBody()}
          </div>
        )}
      </div>
    </div>
  );
}
