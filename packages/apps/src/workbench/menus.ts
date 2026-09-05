/**
 * The menubar for the Workbench window, built from one snapshot of state so a
 * command does the same thing whether it is clicked in the toolbar, picked
 * from a menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { TOOL_LABEL, TOOL_SHORTCUT, TOOLS, type ToolId } from './tools';

export interface WorkbenchMenuState {
  tool: ToolId;
  /** The current pane has produced output worth copying. */
  hasOutput: boolean;
  /** The current pane has something to clear. */
  hasInput: boolean;
}

export interface WorkbenchActions {
  close: () => void;
  copyOutput: () => void;
  clear: () => void;
  setTool: (tool: ToolId) => void;
  nextTool: () => void;
  previousTool: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildWorkbenchMenus(
  state: WorkbenchMenuState,
  actions: WorkbenchActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [{ id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close }],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'copy-output',
          label: 'Copy Output',
          shortcut: 'Shift+Mod+C',
          enabled: state.hasOutput,
          onSelect: actions.copyOutput,
        },
        separator,
        {
          id: 'clear',
          label: 'Clear',
          shortcut: 'Shift+Mod+K',
          enabled: state.hasInput,
          onSelect: actions.clear,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...TOOLS.map<MenuItemTemplate>((tool) => ({
          id: `tool-${tool}`,
          type: 'radio',
          label: TOOL_LABEL[tool],
          shortcut: TOOL_SHORTCUT[tool],
          checked: state.tool === tool,
          onSelect: () => actions.setTool(tool),
        })),
        separator,
        {
          id: 'next-tool',
          label: 'Next Tool',
          shortcut: 'Mod+]',
          onSelect: actions.nextTool,
        },
        {
          id: 'previous-tool',
          label: 'Previous Tool',
          shortcut: 'Mod+[',
          onSelect: actions.previousTool,
        },
      ],
    },
  ];
}
