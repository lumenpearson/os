/**
 * The tab list as a reducer. Every command the browser can run on tabs —
 * open, close, navigate, back, forward, reload, zoom — is an action here, so
 * the menu, the toolbar, a keyboard shortcut and a middle click all take the
 * same path.
 */

import { type KeyLike, type ModifierPreference, matchesShortcut } from '@lumen/kernel';
import {
  canGoBack,
  canGoForward,
  createStack,
  currentEntry,
  goBack,
  goForward,
  type NavStack,
  pushEntry,
} from './history';
import { isInternalUrl, START_URL, titleFor } from './url';

/**
 * `loading` covers a frame that has been handed an address; `blocked` is what
 * we show when it never reported back (most sites refuse to be framed).
 */
export type TabStatus = 'idle' | 'loading' | 'blocked';

export interface Tab {
  id: string;
  url: string;
  /** The best title known: the host until the page tells us otherwise. */
  title: string;
  stack: NavStack;
  status: TabStatus;
  zoom: number;
  /** Bumped to make the frame load the same address again. */
  generation: number;
}

export interface TabsState {
  tabs: Tab[];
  activeId: string | null;
}

export const ZOOM_LEVELS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const DEFAULT_ZOOM = 1;

export function zoomIn(zoom: number): number {
  return ZOOM_LEVELS.find((z) => z > zoom + 0.001) ?? zoom;
}

export function zoomOut(zoom: number): number {
  const below = ZOOM_LEVELS.filter((z) => z < zoom - 0.001);
  return below[below.length - 1] ?? zoom;
}

/** "125%" — the zoom as it reads in a menu or the toolbar. */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

let sequence = 0;

/** Ids only have to be unique within one window. */
export function nextTabId(): string {
  sequence += 1;
  return `tab-${sequence}`;
}

export function createTab(id: string, url: string = START_URL): Tab {
  return {
    id,
    url,
    title: titleFor(url),
    stack: createStack(url),
    status: isInternalUrl(url) ? 'idle' : 'loading',
    zoom: DEFAULT_ZOOM,
    generation: 0,
  };
}

export const EMPTY_TABS: TabsState = { tabs: [], activeId: null };

export function createTabsState(id: string, url?: string): TabsState {
  return { tabs: [createTab(id, url)], activeId: id };
}

export function activeTab(state: TabsState): Tab | null {
  return state.tabs.find((t) => t.id === state.activeId) ?? null;
}

export function tabById(state: TabsState, id: string): Tab | null {
  return state.tabs.find((t) => t.id === id) ?? null;
}

export type TabsAction =
  /** `id` is the id the new tab takes; the caller owns id generation. */
  | { type: 'open'; id: string; url?: string; activate?: boolean }
  | { type: 'close'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'cycle'; delta: number }
  | { type: 'navigate'; url: string; id?: string }
  | { type: 'back'; id?: string }
  | { type: 'forward'; id?: string }
  | { type: 'reload'; id?: string }
  | { type: 'stop'; id?: string }
  | { type: 'loaded'; id: string }
  | { type: 'blocked'; id: string }
  | { type: 'title'; id: string; title: string }
  | { type: 'zoom'; direction: 'in' | 'out' | 'reset'; id?: string };

function statusFor(url: string): TabStatus {
  return isInternalUrl(url) ? 'idle' : 'loading';
}

/** Move to `url` without touching the back/forward list (used by back/forward). */
function at(tab: Tab, stack: NavStack): Tab {
  const url = currentEntry(stack);
  return {
    ...tab,
    stack,
    url,
    title: titleFor(url),
    status: statusFor(url),
    generation: tab.generation + 1,
  };
}

function mapTab(state: TabsState, id: string | undefined, fn: (tab: Tab) => Tab): TabsState {
  const target = id ?? state.activeId;
  if (!target) return state;
  let changed = false;
  const tabs = state.tabs.map((t) => {
    if (t.id !== target) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...state, tabs } : state;
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      if (state.tabs.some((t) => t.id === action.id)) return state;
      const tab = createTab(action.id, action.url);
      return {
        tabs: [...state.tabs, tab],
        activeId: action.activate === false && state.activeId ? state.activeId : tab.id,
      };
    }
    case 'close': {
      const index = state.tabs.findIndex((t) => t.id === action.id);
      if (index < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) return EMPTY_TABS;
      if (state.activeId !== action.id) return { ...state, tabs };
      // The neighbour on the right takes over, or the new last tab.
      const next = tabs[index] ?? tabs[tabs.length - 1];
      return { tabs, activeId: next?.id ?? null };
    }
    case 'activate':
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      return state.activeId === action.id ? state : { ...state, activeId: action.id };
    case 'cycle': {
      if (state.tabs.length === 0) return state;
      const from = state.tabs.findIndex((t) => t.id === state.activeId);
      const count = state.tabs.length;
      const index = ((((from < 0 ? 0 : from) + action.delta) % count) + count) % count;
      const next = state.tabs[index];
      return next ? { ...state, activeId: next.id } : state;
    }
    case 'navigate':
      return mapTab(state, action.id, (tab) => {
        const stack = pushEntry(tab.stack, action.url);
        return {
          ...tab,
          stack,
          url: action.url,
          title: titleFor(action.url),
          status: statusFor(action.url),
          generation: tab.generation + 1,
        };
      });
    case 'back':
      return mapTab(state, action.id, (tab) =>
        canGoBack(tab.stack) ? at(tab, goBack(tab.stack)) : tab,
      );
    case 'forward':
      return mapTab(state, action.id, (tab) =>
        canGoForward(tab.stack) ? at(tab, goForward(tab.stack)) : tab,
      );
    case 'reload':
      return mapTab(state, action.id, (tab) => ({
        ...tab,
        status: statusFor(tab.url),
        generation: tab.generation + 1,
      }));
    case 'stop':
      return mapTab(state, action.id, (tab) =>
        tab.status === 'loading' ? { ...tab, status: 'idle' } : tab,
      );
    case 'loaded':
      return mapTab(state, action.id, (tab) =>
        tab.status === 'idle' ? tab : { ...tab, status: 'idle' },
      );
    case 'blocked':
      return mapTab(state, action.id, (tab) =>
        tab.status === 'loading' ? { ...tab, status: 'blocked' } : tab,
      );
    case 'title':
      return mapTab(state, action.id, (tab) =>
        tab.title === action.title ? tab : { ...tab, title: action.title },
      );
    case 'zoom':
      return mapTab(state, action.id, (tab) => {
        const zoom =
          action.direction === 'in'
            ? zoomIn(tab.zoom)
            : action.direction === 'out'
              ? zoomOut(tab.zoom)
              : DEFAULT_ZOOM;
        return zoom === tab.zoom ? tab : { ...tab, zoom };
      });
    default:
      return state;
  }
}

// ── keyboard ──────────────────────────────────────────────────────────────

export type TabKeyAction =
  | { type: 'next' }
  | { type: 'previous' }
  /** Zero-based; the ninth key (Mod+9) means the last tab, as browsers do. */
  | { type: 'select'; index: number };

/**
 * Tab cycling and Mod+1…9. Nine numbered items would bury the useful
 * commands, so these stay out of the menus and the component binds them.
 */
export function tabShortcut(event: KeyLike, modifier: ModifierPreference): TabKeyAction | null {
  if (matchesShortcut(event, 'Ctrl+Shift+Tab', modifier)) return { type: 'previous' };
  if (matchesShortcut(event, 'Ctrl+Tab', modifier)) return { type: 'next' };
  for (let n = 1; n <= 9; n++) {
    if (matchesShortcut(event, `Mod+${n}`, modifier)) return { type: 'select', index: n - 1 };
  }
  return null;
}

/** Which tab Mod+1…9 lands on: the ninth key is always the last tab. */
export function tabIndexFor(index: number, count: number): number {
  if (count === 0) return -1;
  return index >= 8 ? count - 1 : Math.min(index, count - 1);
}
