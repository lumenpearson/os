import { describe, expect, it } from 'vitest';
import { canGoBack, canGoForward } from './history';
import {
  activeTab,
  createTab,
  createTabsState,
  DEFAULT_TAB_DEFAULTS,
  DEFAULT_ZOOM,
  EMPTY_TABS,
  nextTabId,
  statusFor,
  type TabDefaults,
  type TabsState,
  tabById,
  tabIndexFor,
  tabShortcut,
  tabsReducer,
  ZOOM_LEVELS,
  zoomIn,
  zoomOut,
} from './tabs';
import { START_URL } from './url';

const A = 'https://a.example/';
const B = 'https://b.example/';

const outside: TabDefaults = { zoom: DEFAULT_ZOOM, externalHosts: ['a.example'] };

/** Apply a list of actions in order, so a scenario reads as one block. */
function run(state: TabsState, ...actions: Parameters<typeof tabsReducer>[1][]): TabsState {
  return actions.reduce(tabsReducer, state);
}

describe('createTab', () => {
  it('opens the new-tab page by default, idle because nothing loads', () => {
    const tab = createTab('t1');
    expect(tab.url).toBe(START_URL);
    expect(tab.title).toBe('New Tab');
    expect(tab.status).toBe('idle');
    expect(tab.zoom).toBe(DEFAULT_ZOOM);
    expect(tab.stack.entries).toEqual([START_URL]);
  });

  it('starts loading for a web address and titles it with the host', () => {
    const tab = createTab('t1', 'https://www.example.com/x');
    expect(tab.status).toBe('loading');
    expect(tab.title).toBe('example.com');
  });
});

describe('statusFor', () => {
  it('draws internal pages, loads the web and keeps the list out of the frame', () => {
    expect(statusFor(START_URL, DEFAULT_TAB_DEFAULTS)).toBe('idle');
    expect(statusFor(A, DEFAULT_TAB_DEFAULTS)).toBe('loading');
    expect(statusFor(A, outside)).toBe('external');
    expect(statusFor(B, outside)).toBe('loading');
  });
});

describe('tab defaults', () => {
  it('gives a new tab the default zoom and the open-outside rule', () => {
    const state = createTabsState('t1', A, { zoom: 1.25, externalHosts: ['a.example'] });
    expect(activeTab(state)?.zoom).toBe(1.25);
    expect(activeTab(state)?.status).toBe('external');
  });

  it('carries the defaults to every tab opened after them', () => {
    const state = run(
      createTabsState('t1'),
      { type: 'defaults', defaults: outside },
      {
        type: 'open',
        id: 't2',
        url: A,
      },
    );
    expect(tabById(state, 't2')?.status).toBe('external');
  });

  it('sends a tab that is waiting or blocked outside as soon as the list changes', () => {
    const loading = createTabsState('t1', A);
    expect(activeTab(loading)?.status).toBe('loading');
    const now = tabsReducer(loading, { type: 'defaults', defaults: outside });
    expect(activeTab(now)?.status).toBe('external');

    const blocked = run(createTabsState('t1', A), { type: 'blocked', id: 't1' });
    expect(activeTab(tabsReducer(blocked, { type: 'defaults', defaults: outside }))?.status).toBe(
      'external',
    );
  });

  it('leaves a tab that is already showing a page where it is', () => {
    const idle = run(createTabsState('t1', A), { type: 'loaded', id: 't1' });
    expect(activeTab(tabsReducer(idle, { type: 'defaults', defaults: outside }))?.status).toBe(
      'idle',
    );
  });

  it('loads a tab again once its host comes off the list', () => {
    const external = createTabsState('t1', A, outside);
    const back = tabsReducer(external, { type: 'defaults', defaults: DEFAULT_TAB_DEFAULTS });
    expect(activeTab(back)?.status).toBe('loading');
    expect(activeTab(back)?.generation).toBe(1);
  });

  it('ignores a load event for a tab that has no frame', () => {
    const external = createTabsState('t1', A, outside);
    expect(tabsReducer(external, { type: 'loaded', id: 't1' })).toBe(external);
  });

  it('returns the same state when nothing about the defaults changed', () => {
    const state = createTabsState('t1', A, outside);
    expect(
      tabsReducer(state, { type: 'defaults', defaults: { zoom: 1, externalHosts: ['a.example'] } }),
    ).toBe(state);
  });

  it('resets the zoom to the default rather than to 100%', () => {
    const state = run(
      createTabsState('t1'),
      { type: 'defaults', defaults: { zoom: 1.25, externalHosts: [] } },
      { type: 'zoom', direction: 'in' },
      { type: 'zoom', direction: 'reset' },
    );
    expect(activeTab(state)?.zoom).toBe(1.25);
  });
});

describe('nextTabId', () => {
  it('never repeats', () => {
    const ids = new Set([nextTabId(), nextTabId(), nextTabId()]);
    expect(ids.size).toBe(3);
  });
});

describe('open / activate / cycle', () => {
  it('appends and focuses the new tab', () => {
    const state = run(createTabsState('t1'), { type: 'open', id: 't2', url: A });
    expect(state.tabs.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(state.activeId).toBe('t2');
  });

  it('can open in the background', () => {
    const state = run(createTabsState('t1'), { type: 'open', id: 't2', url: A, activate: false });
    expect(state.activeId).toBe('t1');
  });

  it('ignores an id that is already open', () => {
    const before = createTabsState('t1');
    expect(tabsReducer(before, { type: 'open', id: 't1' })).toBe(before);
  });

  it('activates an existing tab and ignores an unknown one', () => {
    const state = run(createTabsState('t1'), { type: 'open', id: 't2' });
    expect(tabsReducer(state, { type: 'activate', id: 't1' }).activeId).toBe('t1');
    expect(tabsReducer(state, { type: 'activate', id: 'nope' })).toBe(state);
  });

  it('cycles forward and wraps', () => {
    let state = run(createTabsState('t1'), { type: 'open', id: 't2' }, { type: 'open', id: 't3' });
    state = tabsReducer(state, { type: 'activate', id: 't1' });
    expect(tabsReducer(state, { type: 'cycle', delta: 1 }).activeId).toBe('t2');
    state = tabsReducer(state, { type: 'activate', id: 't3' });
    expect(tabsReducer(state, { type: 'cycle', delta: 1 }).activeId).toBe('t1');
  });

  it('cycles backward and wraps', () => {
    let state = run(createTabsState('t1'), { type: 'open', id: 't2' }, { type: 'open', id: 't3' });
    state = tabsReducer(state, { type: 'activate', id: 't1' });
    expect(tabsReducer(state, { type: 'cycle', delta: -1 }).activeId).toBe('t3');
  });

  it('has nothing to cycle with no tabs', () => {
    expect(tabsReducer(EMPTY_TABS, { type: 'cycle', delta: 1 })).toBe(EMPTY_TABS);
  });
});

describe('close', () => {
  const three = () =>
    run(createTabsState('t1'), { type: 'open', id: 't2' }, { type: 'open', id: 't3' });

  it('gives focus to the tab on the right', () => {
    const state = tabsReducer(tabsReducer(three(), { type: 'activate', id: 't2' }), {
      type: 'close',
      id: 't2',
    });
    expect(state.tabs.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(state.activeId).toBe('t3');
  });

  it('falls back to the tab on the left when the last one closes', () => {
    const state = tabsReducer(three(), { type: 'close', id: 't3' });
    expect(state.activeId).toBe('t2');
  });

  it('leaves focus alone when another tab closes', () => {
    const state = tabsReducer(three(), { type: 'close', id: 't1' });
    expect(state.activeId).toBe('t3');
  });

  it('ends with no tabs and no active tab', () => {
    const state = tabsReducer(createTabsState('t1'), { type: 'close', id: 't1' });
    expect(state).toEqual(EMPTY_TABS);
    expect(activeTab(state)).toBeNull();
  });

  it('ignores an unknown id', () => {
    const before = three();
    expect(tabsReducer(before, { type: 'close', id: 'nope' })).toBe(before);
  });
});

describe('navigate / back / forward', () => {
  it('pushes onto the active tab and starts loading', () => {
    const state = tabsReducer(createTabsState('t1'), { type: 'navigate', url: A });
    const tab = activeTab(state);
    expect(tab?.url).toBe(A);
    expect(tab?.status).toBe('loading');
    expect(canGoBack(tab?.stack ?? { entries: [], index: 0 })).toBe(true);
  });

  it('navigates a named tab that is not active', () => {
    const state = run(
      createTabsState('t1'),
      { type: 'open', id: 't2' },
      {
        type: 'navigate',
        id: 't1',
        url: A,
      },
    );
    expect(tabById(state, 't1')?.url).toBe(A);
    expect(tabById(state, 't2')?.url).toBe(START_URL);
  });

  it('walks back and forward and updates the title with the address', () => {
    let state = run(
      createTabsState('t1'),
      { type: 'navigate', url: A },
      { type: 'navigate', url: B },
    );
    state = tabsReducer(state, { type: 'back' });
    expect(activeTab(state)?.url).toBe(A);
    expect(activeTab(state)?.title).toBe('a.example');
    expect(canGoForward(activeTab(state)?.stack ?? { entries: [], index: 0 })).toBe(true);

    state = tabsReducer(state, { type: 'forward' });
    expect(activeTab(state)?.url).toBe(B);
  });

  it('does nothing at the ends of the stack', () => {
    const state = createTabsState('t1');
    expect(tabsReducer(state, { type: 'back' })).toBe(state);
    expect(tabsReducer(state, { type: 'forward' })).toBe(state);
  });

  it('throws away the forward entries after navigating from the middle', () => {
    let state = run(
      createTabsState('t1', A),
      { type: 'navigate', url: B },
      { type: 'back' },
      { type: 'navigate', url: 'https://c.example/' },
    );
    expect(activeTab(state)?.stack.entries).toEqual([A, 'https://c.example/']);
    state = tabsReducer(state, { type: 'forward' });
    expect(activeTab(state)?.url).toBe('https://c.example/');
  });

  it('is idle again on an internal page', () => {
    const state = run(
      createTabsState('t1'),
      { type: 'navigate', url: A },
      {
        type: 'navigate',
        url: 'lumen://history',
      },
    );
    expect(activeTab(state)?.status).toBe('idle');
    expect(activeTab(state)?.title).toBe('History');
  });

  it('does nothing without an active tab', () => {
    expect(tabsReducer(EMPTY_TABS, { type: 'navigate', url: A })).toBe(EMPTY_TABS);
  });
});

describe('loading status', () => {
  it('reload asks the frame for the same address again', () => {
    const before = createTabsState('t1', A);
    const state = tabsReducer(tabsReducer(before, { type: 'loaded', id: 't1' }), {
      type: 'reload',
    });
    expect(activeTab(state)?.status).toBe('loading');
    expect(activeTab(state)?.generation).toBe((activeTab(before)?.generation ?? 0) + 1);
  });

  it('stop ends a load without a result', () => {
    const state = tabsReducer(createTabsState('t1', A), { type: 'stop' });
    expect(activeTab(state)?.status).toBe('idle');
  });

  it('blocked only applies while loading', () => {
    const loading = createTabsState('t1', A);
    expect(tabsReducer(loading, { type: 'blocked', id: 't1' }).tabs[0]?.status).toBe('blocked');
    const idle = tabsReducer(loading, { type: 'loaded', id: 't1' });
    expect(tabsReducer(idle, { type: 'blocked', id: 't1' })).toBe(idle);
  });

  it('a late load clears the blocked panel', () => {
    const state = run(
      createTabsState('t1', A),
      { type: 'blocked', id: 't1' },
      {
        type: 'loaded',
        id: 't1',
      },
    );
    expect(activeTab(state)?.status).toBe('idle');
  });

  it('sets a title we were told about', () => {
    const state = tabsReducer(createTabsState('t1', A), { type: 'title', id: 't1', title: 'Ay' });
    expect(activeTab(state)?.title).toBe('Ay');
    expect(tabsReducer(state, { type: 'title', id: 't1', title: 'Ay' })).toBe(state);
  });
});

describe('zoom', () => {
  it('steps through the levels and stops at the ends', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(ZOOM_LEVELS[ZOOM_LEVELS.length - 1] as number)).toBe(2);
    expect(zoomOut(ZOOM_LEVELS[0] as number)).toBe(0.5);
  });

  it('is per tab and resets to actual size', () => {
    let state = run(createTabsState('t1'), { type: 'open', id: 't2' });
    state = run(state, { type: 'zoom', direction: 'in' }, { type: 'zoom', direction: 'in' });
    expect(tabById(state, 't2')?.zoom).toBe(1.25);
    expect(tabById(state, 't1')?.zoom).toBe(1);

    state = tabsReducer(state, { type: 'zoom', direction: 'reset' });
    expect(tabById(state, 't2')?.zoom).toBe(1);
  });

  it('returns the same state when the zoom cannot change', () => {
    const state = createTabsState('t1');
    expect(tabsReducer(state, { type: 'zoom', direction: 'reset' })).toBe(state);
  });
});

describe('tabShortcut', () => {
  const key = (
    k: string,
    mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  });

  it('cycles forwards and backwards on Ctrl+Tab', () => {
    expect(tabShortcut(key('Tab', { ctrl: true }), 'ctrl')).toEqual({ type: 'next' });
    expect(tabShortcut(key('Tab', { ctrl: true, shift: true }), 'ctrl')).toEqual({
      type: 'previous',
    });
  });

  it('cycles with Ctrl even when the modifier preference is Cmd', () => {
    expect(tabShortcut(key('Tab', { ctrl: true }), 'meta')).toEqual({ type: 'next' });
  });

  it('selects a tab with the number keys, zero-based', () => {
    expect(tabShortcut(key('1', { ctrl: true }), 'ctrl')).toEqual({ type: 'select', index: 0 });
    expect(tabShortcut(key('9', { meta: true }), 'meta')).toEqual({ type: 'select', index: 8 });
  });

  it('ignores a bare key and an unrelated combination', () => {
    expect(tabShortcut(key('1'), 'ctrl')).toBeNull();
    expect(tabShortcut(key('t', { ctrl: true }), 'ctrl')).toBeNull();
  });
});

describe('tabIndexFor', () => {
  it('lands on the tab under the key', () => {
    expect(tabIndexFor(0, 5)).toBe(0);
    expect(tabIndexFor(3, 5)).toBe(3);
  });

  it('sends the ninth key to the last tab, however many there are', () => {
    expect(tabIndexFor(8, 3)).toBe(2);
    expect(tabIndexFor(8, 20)).toBe(19);
  });

  it('clamps to the last tab and reports nothing for an empty strip', () => {
    expect(tabIndexFor(6, 3)).toBe(2);
    expect(tabIndexFor(0, 0)).toBe(-1);
  });
});
