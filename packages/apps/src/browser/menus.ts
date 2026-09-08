import { t } from '@lumen/kernel';
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
  showSettings: () => void;
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
  /** The zoom a tab starts at, which is what the reset command returns to. */
  defaultZoom: number;
}

/**
 * What the reset command is called. With the default left at 100% it is the
 * familiar Actual Size; once a person has chosen a different default, saying
 * "actual size" for it would be a lie.
 */
export function zoomResetLabel(zoom: number, defaultZoom: number): string {
  if (defaultZoom !== DEFAULT_ZOOM) return `Default Zoom (${formatZoom(defaultZoom)})`;
  return zoom === defaultZoom ? 'Actual Size' : `Actual Size (${formatZoom(zoom)})`;
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
  settings: 'Mod+,',
  focusAddress: 'Mod+L',
  nextTab: 'Ctrl+Tab',
  previousTab: 'Ctrl+Shift+Tab',
} as const;

export function menubarFor(state: BrowserMenuState, actions: BrowserActions): MenuTemplate[] {
  const file: MenuItemTemplate[] = [
    {
      id: 'new-tab',
      label: t('browser.newTab'),
      shortcut: SHORTCUTS.newTab,
      onSelect: actions.newTab,
    },
    { type: 'separator' },
    {
      id: 'settings',
      label: t('browser.settings'),
      shortcut: SHORTCUTS.settings,
      onSelect: actions.showSettings,
    },
    { type: 'separator' },
    {
      id: 'close-tab',
      label: t('browser.closeTab'),
      shortcut: SHORTCUTS.closeTab,
      onSelect: actions.closeTab,
    },
  ];

  const history: MenuItemTemplate[] = [
    {
      id: 'back',
      label: t('menu.back'),
      shortcut: SHORTCUTS.back,
      enabled: state.canBack,
      onSelect: actions.back,
    },
    {
      id: 'forward',
      label: t('menu.forward'),
      shortcut: SHORTCUTS.forward,
      enabled: state.canForward,
      onSelect: actions.forward,
    },
    { type: 'separator' },
    {
      id: 'reload',
      label: t('browser.reload'),
      shortcut: SHORTCUTS.reload,
      enabled: !state.loading,
      onSelect: actions.reload,
    },
    { id: 'stop', label: t('browser.stop'), enabled: state.loading, onSelect: actions.stop },
    { id: 'home', label: t('browser.home'), shortcut: SHORTCUTS.home, onSelect: actions.home },
    { type: 'separator' },
    {
      id: 'show-history',
      label: t('browser.showHistory'),
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
      label: t('browser.showBookmarks'),
      shortcut: SHORTCUTS.showBookmarks,
      onSelect: actions.showBookmarks,
    },
    { type: 'separator' },
    {
      id: 'bookmarks-bar',
      type: 'checkbox',
      label: t('browser.showBookmarksBar'),
      shortcut: SHORTCUTS.bookmarksBar,
      checked: state.showBookmarksBar,
      onSelect: actions.toggleBookmarksBar,
    },
  ];

  const view: MenuItemTemplate[] = [
    {
      id: 'zoom-in',
      label: t('menu.zoomIn'),
      shortcut: SHORTCUTS.zoomIn,
      onSelect: actions.zoomIn,
    },
    {
      id: 'zoom-out',
      label: t('menu.zoomOut'),
      shortcut: SHORTCUTS.zoomOut,
      onSelect: actions.zoomOut,
    },
    {
      id: 'zoom-reset',
      label: zoomResetLabel(state.zoom, state.defaultZoom),
      shortcut: SHORTCUTS.zoomReset,
      enabled: state.zoom !== state.defaultZoom,
      onSelect: actions.zoomReset,
    },
  ];

  return [
    { id: 'file', label: t('menu.file'), items: file },
    { id: 'history', label: t('browser.history'), items: history },
    { id: 'bookmarks', label: t('browser.bookmarks'), items: bookmarks },
    { id: 'view', label: t('menu.view'), items: view },
  ];
}
