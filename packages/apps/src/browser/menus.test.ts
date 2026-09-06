import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  type BrowserActions,
  type BrowserMenuState,
  menubarFor,
  SHORTCUTS,
  zoomResetLabel,
} from './menus';

const actions = (): BrowserActions => ({
  newTab: vi.fn(),
  closeTab: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  reload: vi.fn(),
  stop: vi.fn(),
  home: vi.fn(),
  showHistory: vi.fn(),
  toggleBookmark: vi.fn(),
  showBookmarks: vi.fn(),
  showSettings: vi.fn(),
  toggleBookmarksBar: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomReset: vi.fn(),
});

const state = (patch: Partial<BrowserMenuState> = {}): BrowserMenuState => ({
  canBack: true,
  canForward: true,
  loading: false,
  bookmarked: false,
  showBookmarksBar: true,
  zoom: 1,
  defaultZoom: 1,
  ...patch,
});

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('menubarFor', () => {
  it('contributes File, History, Bookmarks and View', () => {
    expect(menubarFor(state(), actions()).map((m) => m.label)).toEqual([
      'File',
      'History',
      'Bookmarks',
      'View',
    ]);
  });

  it('runs the action behind each command', () => {
    const acts = actions();
    const menus = menubarFor(state(), acts);
    item(menus, 'file', 'new-tab').onSelect?.();
    item(menus, 'history', 'back').onSelect?.();
    item(menus, 'bookmarks', 'bookmark').onSelect?.();
    item(menus, 'view', 'zoom-in').onSelect?.();
    expect(acts.newTab).toHaveBeenCalledOnce();
    expect(acts.back).toHaveBeenCalledOnce();
    expect(acts.toggleBookmark).toHaveBeenCalledOnce();
    expect(acts.zoomIn).toHaveBeenCalledOnce();
  });

  it('disables the steps a tab cannot take', () => {
    const menus = menubarFor(state({ canBack: false, canForward: false }), actions());
    expect(item(menus, 'history', 'back').enabled).toBe(false);
    expect(item(menus, 'history', 'forward').enabled).toBe(false);
  });

  it('swaps Reload and Stop while a page is loading', () => {
    const idle = menubarFor(state(), actions());
    expect(item(idle, 'history', 'reload').enabled).toBe(true);
    expect(item(idle, 'history', 'stop').enabled).toBe(false);

    const busy = menubarFor(state({ loading: true }), actions());
    expect(item(busy, 'history', 'reload').enabled).toBe(false);
    expect(item(busy, 'history', 'stop').enabled).toBe(true);
  });

  it('names the bookmark command after what it will do', () => {
    expect(item(menubarFor(state(), actions()), 'bookmarks', 'bookmark').label).toBe(
      'Add Bookmark',
    );
    expect(
      item(menubarFor(state({ bookmarked: true }), actions()), 'bookmarks', 'bookmark').label,
    ).toBe('Remove Bookmark');
  });

  it('checks the bookmarks bar item when the bar is showing', () => {
    expect(item(menubarFor(state(), actions()), 'bookmarks', 'bookmarks-bar').checked).toBe(true);
    expect(
      item(menubarFor(state({ showBookmarksBar: false }), actions()), 'bookmarks', 'bookmarks-bar')
        .checked,
    ).toBe(false);
  });

  it('shows the current zoom on Actual Size, and disables it at 100%', () => {
    const plain = item(menubarFor(state(), actions()), 'view', 'zoom-reset');
    expect(plain.label).toBe('Actual Size');
    expect(plain.enabled).toBe(false);

    const zoomed = item(menubarFor(state({ zoom: 1.25 }), actions()), 'view', 'zoom-reset');
    expect(zoomed.label).toBe('Actual Size (125%)');
    expect(zoomed.enabled).toBe(true);
  });

  it('says which zoom the reset returns to once that is not 100%', () => {
    expect(zoomResetLabel(1, 1)).toBe('Actual Size');
    expect(zoomResetLabel(1.5, 1)).toBe('Actual Size (150%)');
    expect(zoomResetLabel(1.25, 1.25)).toBe('Default Zoom (125%)');

    const item0 = item(
      menubarFor(state({ zoom: 1.25, defaultZoom: 1.25 }), actions()),
      'view',
      'zoom-reset',
    );
    expect(item0.enabled).toBe(false);
  });

  it('opens the settings page from the File menu', () => {
    const acts = actions();
    item(menubarFor(state(), acts), 'file', 'settings').onSelect?.();
    expect(acts.showSettings).toHaveBeenCalledOnce();
    expect(item(menubarFor(state(), acts), 'file', 'settings').shortcut).toBe(SHORTCUTS.settings);
  });

  it('carries the shortcut for every command that has one', () => {
    const menus = menubarFor(state(), actions());
    expect(item(menus, 'file', 'new-tab').shortcut).toBe(SHORTCUTS.newTab);
    expect(item(menus, 'file', 'close-tab').shortcut).toBe(SHORTCUTS.closeTab);
    expect(item(menus, 'history', 'back').shortcut).toBe('Alt+ArrowLeft');
    expect(item(menus, 'view', 'zoom-reset').shortcut).toBe('Mod+0');
  });
});
