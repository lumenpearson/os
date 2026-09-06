/**
 * The menubar for the Software Center window. The install commands take the
 * window to the Install section first, so a menu choice and a click on the
 * same control end in the same place, and Refresh takes it to the Store,
 * because that is the thing being refreshed.
 */

import type { MenuTemplate } from '@lumen/kernel';

export type SectionId = 'store' | 'installed' | 'install';

export const SECTIONS: ReadonlyArray<{ id: SectionId; label: string }> = [
  { id: 'store', label: 'Store' },
  { id: 'installed', label: 'Installed' },
  { id: 'install', label: 'Install' },
];

export interface SoftwareMenuState {
  section: SectionId;
}

export interface SoftwareActions {
  installFromFile: () => void;
  pasteManifest: () => void;
  refresh: () => void;
  find: () => void;
  show: (section: SectionId) => void;
  close: () => void;
}

export function buildSoftwareMenus(
  state: SoftwareMenuState,
  actions: SoftwareActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'file.install',
          label: 'Install from File…',
          shortcut: 'Mod+O',
          onSelect: actions.installFromFile,
        },
        {
          id: 'file.paste',
          label: 'Paste Manifest…',
          shortcut: 'Shift+Mod+V',
          onSelect: actions.pasteManifest,
        },
        { type: 'separator' },
        { id: 'file.close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'edit.find',
          label: 'Find',
          shortcut: 'Mod+F',
          enabled: state.section !== 'install',
          onSelect: actions.find,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...SECTIONS.map((s, index) => ({
          id: `view.${s.id}`,
          type: 'radio' as const,
          label: s.label,
          shortcut: `Mod+${index + 1}`,
          checked: state.section === s.id,
          onSelect: () => actions.show(s.id),
        })),
        { type: 'separator' },
        {
          id: 'view.refresh',
          label: 'Refresh Catalogue',
          shortcut: 'Mod+R',
          onSelect: actions.refresh,
        },
      ],
    },
  ];
}
