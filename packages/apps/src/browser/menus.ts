/**
 * The menubar, built from one snapshot of state and one set of actions, so a
 * command does the same thing from the menu, the toolbar and the keyboard.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { DEFAULT_ZOOM, formatZoom } from './tabs';

export interface BrowserActions {
  newTab: () => void;
  closeTab: () => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  stop: () => void;
  home: () => void;
  showHistory: () => void;
  toggleBookmark: () => void;
  showBookmarks: () => void;
  toggleBookmarksBar: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

export interface BrowserMenuState {
  canBack: boolean;
  canForward: boolean;
  loading: boolean;
  bookmarked: boolean;
  showBookmarksBar: boolean;
  zoom: number;
}

export const SHORTCUTS = {
  newTab: 'Mod+T',
  closeTab: 'Mod+W',
  back: 'Alt+ArrowLeft',
  forward: 'Alt+ArrowRight',
  reload: 'Mod+R',
  home: 'Alt+Home',
  showHistory: 'Mod+Y',
  bookmark: 'Mod+D',
  showBookmarks: 'Mod+Shift+O',
  bookmarksBar: 'Mod+Shift+B',
  zoomIn: 'Mod+=',
  zoomOut: 'Mod+-',
  zoomReset: 'Mod+0',
  focusAddress: 'Mod+L',
  nextTab: 'Ctrl+Tab',
  previousTab: 'Ctrl+Shift+Tab',
} as const;

export function menubarFor(state: BrowserMenuState, actions: BrowserActions): MenuTemplate[] {
  const file: MenuItemTemplate[] = [
    { id: 'new-tab', label: 'New Tab', shortcut: SHORTCUTS.newTab, onSelect: actions.newTab },
    { type: 'separator' },
    {
      id: 'close-tab',
      label: 'Close Tab',
      shortcut: SHORTCUTS.closeTab,
      onSelect: actions.closeTab,
    },
  ];

  const history: MenuItemTemplate[] = [
    {
      id: 'back',
      label: 'Back',
      shortcut: SHORTCUTS.back,
      enabled: state.canBack,
      onSelect: actions.back,
    },
    {
      id: 'forward',
      label: 'Forward',
      shortcut: SHORTCUTS.forward,
      enabled: state.canForward,
      onSelect: actions.forward,
    },
    { type: 'separator' },
    {
      id: 'reload',
      label: 'Reload',
      shortcut: SHORTCUTS.reload,
      enabled: !state.loading,
      onSelect: actions.reload,
    },
    { id: 'stop', label: 'Stop', enabled: state.loading, onSelect: actions.stop },
    { id: 'home', label: 'Home', shortcut: SHORTCUTS.home, onSelect: actions.home },
    { type: 'separator' },
    {
      id: 'show-history',
      label: 'Show History',
      shortcut: SHORTCUTS.showHistory,
      onSelect: actions.showHistory,
    },
  ];

  const bookmarks: MenuItemTemplate[] = [
    {
      id: 'bookmark',
      label: state.bookmarked ? 'Remove Bookmark' : 'Add Bookmark',
      shortcut: SHORTCUTS.bookmark,
      onSelect: actions.toggleBookmark,
    },
    {
      id: 'show-bookmarks',
      label: 'Show All Bookmarks',
      shortcut: SHORTCUTS.showBookmarks,
      onSelect: actions.showBookmarks,
    },
    { type: 'separator' },
    {
      id: 'bookmarks-bar',
      type: 'checkbox',
      label: 'Show Bookmarks Bar',
      shortcut: SHORTCUTS.bookmarksBar,
      checked: state.showBookmarksBar,
      onSelect: actions.toggleBookmarksBar,
    },
  ];

  const view: MenuItemTemplate[] = [
    { id: 'zoom-in', label: 'Zoom In', shortcut: SHORTCUTS.zoomIn, onSelect: actions.zoomIn },
    { id: 'zoom-out', label: 'Zoom Out', shortcut: SHORTCUTS.zoomOut, onSelect: actions.zoomOut },
    {
      id: 'zoom-reset',
      label:
        state.zoom === DEFAULT_ZOOM ? 'Actual Size' : `Actual Size (${formatZoom(state.zoom)})`,
      shortcut: SHORTCUTS.zoomReset,
      enabled: state.zoom !== DEFAULT_ZOOM,
      onSelect: actions.zoomReset,
    },
  ];

  return [
    { id: 'file', label: 'File', items: file },
    { id: 'history', label: 'History', items: history },
    { id: 'bookmarks', label: 'Bookmarks', items: bookmarks },
    { id: 'view', label: 'View', items: view },
  ];
}
