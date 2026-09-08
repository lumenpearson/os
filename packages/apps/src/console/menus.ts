/**
 * The menubar for the Console window, built from one snapshot of state so a
 * command reads the same whether it is clicked in a menu, typed as a
 * shortcut, or pressed in the toolbar.
 */
import type { MenuItemTemplate, MenuTemplate, MessageKey } from '@lumen/kernel';
import { t } from '@lumen/kernel';
import { LEVELS, type LogLevel } from './types';

export interface ConsoleMenuState {
  levels: readonly LogLevel[];
  follow: boolean;
  paused: boolean;
  /** Rows the filter keeps, which is what Export writes. */
  rowCount: number;
  hasSelection: boolean;
}

export interface ConsoleActions {
  exportLog: () => void;
  clear: () => void;
  toggleFollow: () => void;
  toggleLevel: (level: LogLevel) => void;
  togglePaused: () => void;
  find: () => void;
  copySelected: () => void;
}

const LEVEL_KEY: Record<LogLevel, MessageKey> = {
  debug: 'consoleApp.levelDebug',
  info: 'consoleApp.levelInfo',
  warn: 'consoleApp.levelWarn',
  error: 'consoleApp.levelError',
};

const separator: MenuItemTemplate = { type: 'separator' };

export function buildConsoleMenus(
  state: ConsoleMenuState,
  actions: ConsoleActions,
): MenuTemplate[] {
  const shown = new Set(state.levels);
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        {
          id: 'file.export',
          label: t('console.export'),
          shortcut: 'Mod+S',
          enabled: state.rowCount > 0,
          onSelect: actions.exportLog,
        },
        separator,
        { id: 'file.clear', label: t('menu.clear'), shortcut: 'Mod+K', onSelect: actions.clear },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        {
          id: 'edit.copy',
          label: t('console.copySelected'),
          shortcut: 'Mod+C',
          enabled: state.hasSelection,
          onSelect: actions.copySelected,
        },
        separator,
        { id: 'edit.find', label: t('menu.find'), shortcut: 'Mod+F', onSelect: actions.find },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'view.follow',
          type: 'checkbox',
          label: t('console.followTail'),
          shortcut: 'Mod+T',
          checked: state.follow,
          onSelect: actions.toggleFollow,
        },
        {
          id: 'view.levels',
          type: 'submenu',
          label: t('console.levels'),
          submenu: LEVELS.map((level) => ({
            id: `view.levels.${level}`,
            type: 'checkbox' as const,
            label: t(LEVEL_KEY[level]),
            checked: shown.has(level),
            onSelect: () => actions.toggleLevel(level),
          })),
        },
        separator,
        {
          id: 'view.pause',
          label: t(state.paused ? 'consoleApp.resumeCapture' : 'consoleApp.pauseCapture'),
          shortcut: 'Mod+P',
          onSelect: actions.togglePaused,
        },
      ],
    },
  ];
}
