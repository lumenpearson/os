/**
 * The menubar, built from one snapshot of state so a command does the same
 * thing whether it is clicked, picked from a menu or typed as a shortcut.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import type { Notation } from './model';
import { NOTATIONS } from './model';
import type { PanelId } from './palette';

export interface ColourMenuState {
  panel: PanelId;
  hasSwatches: boolean;
  /** The clipboard holds text that parses as a colour. */
  canPaste: boolean;
}

export interface ColourMenuActions {
  close: () => void;
  copy: (notation: Notation) => void;
  paste: () => void;
  addToPalette: () => void;
  clearPalette: () => void;
  swapWithComparison: () => void;
  setPanel: (panel: PanelId) => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

const PANELS: ReadonlyArray<{ id: PanelId; label: string; shortcut: string }> = [
  { id: 'contrast', label: 'Contrast', shortcut: 'Mod+1' },
  { id: 'palette', label: 'Palette', shortcut: 'Mod+2' },
  { id: 'vision', label: 'Colour Vision', shortcut: 'Mod+3' },
];

export function buildColourMenus(
  state: ColourMenuState,
  actions: ColourMenuActions,
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
          id: 'copy-hex',
          label: 'Copy Hex',
          shortcut: 'Mod+C',
          onSelect: () => actions.copy('hex'),
        },
        {
          id: 'copy-as',
          label: 'Copy As',
          type: 'submenu',
          submenu: NOTATIONS.map<MenuItemTemplate>((notation) => ({
            id: `copy-${notation.id}`,
            label: notation.label,
            onSelect: () => actions.copy(notation.id),
          })),
        },
        separator,
        {
          id: 'paste',
          label: 'Paste Colour',
          shortcut: 'Mod+V',
          enabled: state.canPaste,
          onSelect: actions.paste,
        },
      ],
    },
    {
      id: 'colour',
      label: 'Colour',
      items: [
        {
          id: 'add-swatch',
          label: 'Add to Palette',
          shortcut: 'Mod+D',
          onSelect: actions.addToPalette,
        },
        {
          id: 'swap',
          label: 'Swap With Comparison',
          shortcut: 'Mod+E',
          onSelect: actions.swapWithComparison,
        },
        separator,
        {
          id: 'clear-palette',
          label: 'Remove All Swatches',
          danger: true,
          enabled: state.hasSwatches,
          onSelect: actions.clearPalette,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: PANELS.map<MenuItemTemplate>((panel) => ({
        id: `panel-${panel.id}`,
        type: 'radio',
        label: panel.label,
        shortcut: panel.shortcut,
        checked: state.panel === panel.id,
        onSelect: () => actions.setPanel(panel.id),
      })),
    },
  ];
}
