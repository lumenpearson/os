/**
 * The menubar for the calculator window, built from one snapshot of state so
 * a command does the same thing whether it is clicked or typed.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import type { AngleUnit } from './expression';
import { MODE_LABEL, type Mode } from './storage';

export interface CalculatorMenuState {
  mode: Mode;
  angle: AngleUnit;
  showTape: boolean;
  hasTape: boolean;
}

export interface CalculatorMenuActions {
  copy: () => void;
  copyResult: () => void;
  paste: () => void;
  clear: () => void;
  clearTape: () => void;
  setMode: (mode: Mode) => void;
  setAngle: (angle: AngleUnit) => void;
  toggleTape: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildCalculatorMenus(
  state: CalculatorMenuState,
  actions: CalculatorMenuActions,
): MenuTemplate[] {
  const angleEnabled = state.mode !== 'programmer';
  return [
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'copy', label: 'Copy', shortcut: 'Mod+C', onSelect: actions.copy },
        {
          id: 'copy-result',
          label: 'Copy Result',
          shortcut: 'Shift+Mod+C',
          onSelect: actions.copyResult,
        },
        { id: 'paste', label: 'Paste', shortcut: 'Mod+V', onSelect: actions.paste },
        separator,
        { id: 'clear', label: 'Clear', shortcut: 'Escape', onSelect: actions.clear },
        {
          id: 'clear-tape',
          label: 'Clear Tape',
          enabled: state.hasTape,
          onSelect: actions.clearTape,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...(['basic', 'scientific', 'programmer'] as const).map((mode, index) => ({
          id: mode,
          type: 'radio' as const,
          label: MODE_LABEL[mode],
          shortcut: `Mod+${index + 1}`,
          checked: state.mode === mode,
          onSelect: () => actions.setMode(mode),
        })),
        separator,
        {
          id: 'tape',
          type: 'checkbox',
          label: 'Show Tape',
          shortcut: 'Mod+T',
          checked: state.showTape,
          onSelect: actions.toggleTape,
        },
        separator,
        {
          id: 'degrees',
          type: 'radio',
          label: 'Degrees',
          enabled: angleEnabled,
          checked: state.angle === 'deg',
          onSelect: () => actions.setAngle('deg'),
        },
        {
          id: 'radians',
          type: 'radio',
          label: 'Radians',
          enabled: angleEnabled,
          checked: state.angle === 'rad',
          onSelect: () => actions.setAngle('rad'),
        },
      ],
    },
  ];
}
