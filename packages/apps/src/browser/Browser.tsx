import { matchesShortcut } from '@lumen/kernel';
import { useKernel, useSetting } from '@lumen/kernel/react';
import { EmptyState, type MenuEntry, useLatest } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Compass } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useJsonFile,
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
import { type BrowserActions, menubarFor, SHORTCUTS } from './menus';
import { NavigationBar } from './NavigationBar';
import { HistoryPage } from './pages/History';
import { Library } from './pages/Library';
import { BrowserSettings } from './pages/Settings';
import { Start } from './pages/Start';
import { TabStrip } from './TabStrip';
import {
  activeTab,
  createTabsState,
  formatZoom,
  nextTabId,
  tabIndexFor,
  tabShortcut,
  tabsReducer,
} from './tabs';
import {
  BOOKMARKS_URL,
  engineById,
  HISTORY_URL,
  internalPage,
  isInternalUrl,
  SETTINGS_URL,
  START_URL,
  titleFor,
} from './url';

const DATA_FILE = '.config/browser.json';

/**
 * A browser over sandboxed frames. Nothing inside a frame can be read from
 * here — no title, no links, no text — so a tab is named after its host, and
 * a page that never reports a load says so rather than pretending.
 */
export default function Browser({ args }: AppProps) {
  const kernel = useKernel();
  const [keyboard] = useSetting('keyboard');
  const shortcutLabel = useShortcutLabel();
  const { focused, close } = useWindowControls();
  const addressRef = useRef<HTMLInputElement>(null);

  const dataPath = useMemo(() => join(kernel.home, DATA_FILE), [kernel.home]);
  const [stored, setStored] = useJsonFile<BrowserData>(dataPath, DEFAULT_DATA);
  const data = useMemo(() => normalizeData(stored), [stored]);
  const engine = useMemo(() => engineById(data.searchEngine), [data.searchEngine]);

  const update = useCallback(
    (fn: (previous: BrowserData) => BrowserData) => {
      setStored((previous) => fn(normalizeData(previous)));
    },
    [setStored],
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

  // ── the visit log ───────────────────────────────────────────────────────

  // One entry per load, keyed by the generation the tab was on when it was
  // written, so a reload updates the entry instead of stacking duplicates.
  const logged = useRef(new Map<string, number>());
  useEffect(() => {
    const live = new Set(state.tabs.map((t) => t.id));
    for (const id of logged.current.keys()) if (!live.has(id)) logged.current.delete(id);
    for (const t of state.tabs) {
      if (isInternalUrl(t.url) || logged.current.get(t.id) === t.generation) continue;
      logged.current.set(t.id, t.generation);
      const visit = { id: nextId('visit'), url: t.url, title: t.title, visitedAt: Date.now() };
      update((d) => ({ ...d, history: recordVisit(d.history, visit) }));
    }
  }, [state.tabs, update]);

  // ── commands ────────────────────────────────────────────────────────────

  const go = useCallback((target: string) => dispatch({ type: 'navigate', url: target }), []);
  const openTab = useCallback(
    (target?: string) => dispatch({ type: 'open', id: nextTabId(), url: target }),
    [],
  );
  const onLoaded = useCallback((id: string) => dispatch({ type: 'loaded', id }), []);
  const onBlocked = useCallback((id: string) => dispatch({ type: 'blocked', id }), []);
  const onReloadTab = useCallback((id: string) => dispatch({ type: 'reload', id }), []);

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
    if (!current || isInternalUrl(current.url)) return;
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

  // The menubar keeps its item list between renders, so every command reaches
  // the current state through this ref rather than through a closure.
  const commands = useLatest({
    newTab: () => openTab(data.homepage === START_URL ? undefined : data.homepage),
    closeTab: () => closeTab(),
    back: () => dispatch({ type: 'back' }),
    forward: () => dispatch({ type: 'forward' }),
    reload: () => dispatch({ type: 'reload' }),
    stop: () => dispatch({ type: 'stop' }),
    home: () => go(data.homepage),
    showHistory: () => go(HISTORY_URL),
    toggleBookmark,
    showBookmarks: () => go(BOOKMARKS_URL),
    showSettings: () => go(SETTINGS_URL),
    toggleBookmarksBar: () => update((d) => ({ ...d, showBookmarksBar: !d.showBookmarksBar })),
    zoomIn: () => dispatch({ type: 'zoom', direction: 'in' }),
    zoomOut: () => dispatch({ type: 'zoom', direction: 'out' }),
    zoomReset: () => dispatch({ type: 'zoom', direction: 'reset' }),
    focusAddress: () => addressRef.current?.focus(),
  });

  const actions = useMemo<BrowserActions & { showSettings: () => void }>(
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
  const zoom = tab?.zoom ?? 1;
  const loading = tab?.status === 'loading';

  useAppMenus(
    menubarFor(
      {
        canBack: back,
        canForward: forward,
        loading,
        bookmarked: bookmark !== null,
        showBookmarksBar: data.showBookmarksBar,
        zoom,
      },
      actions,
    ),
    [actions, back, forward, loading, bookmark !== null, data.showBookmarksBar, zoom],
  );

  useShortcut(SHORTCUTS.focusAddress, () => commands.current.focusAddress());
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

  // ── Mod+W: the tab, not the window ──────────────────────────────────────

  // The shell owns Mod+W ("close window") and handles it in the capture phase,
  // so a menu shortcut in the app never sees the key. While more than one tab
  // is open the tab is what should close, so the key is claimed here and the
  // guard below — which answers a turn later, after this listener has run —
  // keeps the window. Anything else that asks to close (the title bar's ✕,
  // Quit) never sets the claim and closes the window as it should.
  const claimedClose = useRef(false);
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, SHORTCUTS.closeTab, keyboard.modifier)) return;
      const current = stateRef.current;
      if (current.tabs.length <= 1 || !current.activeId) return;
      e.preventDefault();
      claimedClose.current = true;
      setTimeout(() => {
        claimedClose.current = false;
      }, 0);
      dispatch({ type: 'close', id: current.activeId });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focused, keyboard.modifier, stateRef]);

  useCloseGuard(
    useCallback(
      () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(!claimedClose.current), 0);
        }),
      [],
    ),
  );

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
        label: zoom === 1 ? 'Actual Size' : `Actual Size (${formatZoom(zoom)})`,
        shortcut: shortcutLabel(SHORTCUTS.zoomReset),
        enabled: zoom !== 1,
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
        checked: data.showBookmarksBar,
        onSelect: actions.toggleBookmarksBar,
      },
      { type: 'separator' },
      { id: 'settings', label: 'Browser Settings', onSelect: actions.showSettings },
    ],
    [actions, shortcutLabel, zoom, data.showBookmarksBar],
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
          <BrowserSettings
            data={data}
            onChange={(patch) => update((d) => ({ ...d, ...patch }))}
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
        canBookmark={!internal}
        menuItems={menuItems}
        addressRef={addressRef}
        onNavigate={go}
        onBack={actions.back}
        onForward={actions.forward}
        onReload={actions.reload}
        onStop={actions.stop}
        onHome={actions.home}
        onToggleBookmark={actions.toggleBookmark}
      />
      {data.showBookmarksBar && (
        <FavoritesBar bookmarks={data.bookmarks} onOpen={go} onShowAll={actions.showBookmarks} />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        {state.tabs.map((t) =>
          isInternalUrl(t.url) ? null : (
            <Frame
              key={t.id}
              tab={t}
              active={t.id === state.activeId}
              onLoaded={onLoaded}
              onBlocked={onBlocked}
              onReload={onReloadTab}
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
