/**
 * The menubar for the Task Manager window, built from one snapshot of state so
 * a command reads the same whether it is clicked or typed.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { REFRESH_RATES, type TabId } from './config';
import { formatInterval } from './format';

export interface TaskManagerMenuState {
  tab: TabId;
  refreshMs: number;
  /** Rows selected in the process table. */
  selectionCount: number;
  /** The single selected process has a window to focus. */
  canFocusWindow: boolean;
}

export interface TaskManagerActions {
  showTab: (tab: TabId) => void;
  setRefreshMs: (ms: number) => void;
  endProcess: () => void;
  focusWindow: () => void;
  quitApp: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildTaskManagerMenus(
  state: TaskManagerMenuState,
  actions: TaskManagerActions,
): MenuTemplate[] {
  // The process commands act on the table, so they stand down on other tabs
  // rather than acting on a selection the user cannot see.
  const onTable = state.tab === 'processes';
  const hasSelection = onTable && state.selectionCount > 0;
  const endLabel =
    state.selectionCount > 1 ? `End ${state.selectionCount} Processes` : 'End Process';
  return [
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view.processes',
          type: 'radio',
          label: 'Processes',
          shortcut: 'Mod+1',
          checked: state.tab === 'processes',
          onSelect: () => actions.showTab('processes'),
        },
        {
          id: 'view.performance',
          type: 'radio',
          label: 'Performance',
          shortcut: 'Mod+2',
          checked: state.tab === 'performance',
          onSelect: () => actions.showTab('performance'),
        },
        {
          id: 'view.apps',
          type: 'radio',
          label: 'Apps',
          shortcut: 'Mod+3',
          checked: state.tab === 'apps',
          onSelect: () => actions.showTab('apps'),
        },
        separator,
        {
          id: 'view.refresh',
          type: 'submenu',
          label: 'Refresh Rate',
          submenu: REFRESH_RATES.map((ms) => ({
            id: `view.refresh.${ms}`,
            type: 'radio' as const,
            label: formatInterval(ms),
            checked: state.refreshMs === ms,
            onSelect: () => actions.setRefreshMs(ms),
          })),
        },
      ],
    },
    {
      id: 'process',
      label: 'Process',
      items: [
        {
          id: 'process.focus',
          label: 'Focus Window',
          shortcut: 'Mod+Enter',
          enabled: onTable && state.canFocusWindow,
          onSelect: actions.focusWindow,
        },
        // No shortcut: Mod+Q is the shell's "quit the focused app", which is
        // this window.
        {
          id: 'process.quit',
          label: 'Quit App',
          enabled: hasSelection,
          onSelect: actions.quitApp,
        },
        separator,
        {
          id: 'process.end',
          label: endLabel,
          shortcut: 'Delete',
          danger: true,
          enabled: hasSelection,
          onSelect: actions.endProcess,
        },
      ],
    },
  ];
}
