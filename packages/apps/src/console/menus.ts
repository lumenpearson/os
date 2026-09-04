/**
 * The menubar for the Console window, built from one snapshot of state so a
 * command reads the same whether it is clicked in a menu, typed as a
 * shortcut, or pressed in the toolbar.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
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

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Warnings',
  error: 'Errors',
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
      label: 'File',
      items: [
        {
          id: 'file.export',
          label: 'Export…',
          shortcut: 'Mod+S',
          enabled: state.rowCount > 0,
          onSelect: actions.exportLog,
        },
        separator,
        { id: 'file.clear', label: 'Clear', shortcut: 'Mod+K', onSelect: actions.clear },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'edit.copy',
          label: 'Copy Selected',
          shortcut: 'Mod+C',
          enabled: state.hasSelection,
          onSelect: actions.copySelected,
        },
        separator,
        { id: 'edit.find', label: 'Find', shortcut: 'Mod+F', onSelect: actions.find },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view.follow',
          type: 'checkbox',
          label: 'Follow Tail',
          shortcut: 'Mod+T',
          checked: state.follow,
          onSelect: actions.toggleFollow,
        },
        {
          id: 'view.levels',
          type: 'submenu',
          label: 'Levels',
          submenu: LEVELS.map((level) => ({
            id: `view.levels.${level}`,
            type: 'checkbox' as const,
            label: LEVEL_LABEL[level],
            checked: shown.has(level),
            onSelect: () => actions.toggleLevel(level),
          })),
        },
        separator,
        {
          id: 'view.pause',
          label: state.paused ? 'Resume Capture' : 'Pause Capture',
          shortcut: 'Mod+P',
          onSelect: actions.togglePaused,
        },
      ],
    },
  ];
}
