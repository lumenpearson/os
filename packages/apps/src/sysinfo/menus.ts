/**
 * The menubar for the System Information window. Every command needs a
 * finished reading behind it, so they all stand down until the first snapshot
 * has been taken and while the next one is being measured.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface SysInfoMenuState {
  /** A snapshot has been taken, so there is something to copy or save. */
  ready: boolean;
  /** A new reading is being measured. */
  reading: boolean;
}

export interface SysInfoActions {
  copyReport: () => void;
  saveReport: () => void;
  refresh: () => void;
  close: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildSysInfoMenus(
  state: SysInfoMenuState,
  actions: SysInfoActions,
): MenuTemplate[] {
  const hasReport = state.ready && !state.reading;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'file.save',
          label: 'Save Report to Documents',
          shortcut: 'Mod+S',
          enabled: hasReport,
          onSelect: actions.saveReport,
        },
        separator,
        { id: 'file.close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'edit.copy',
          label: 'Copy Report',
          shortcut: 'Shift+Mod+C',
          enabled: hasReport,
          onSelect: actions.copyReport,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view.refresh',
          label: 'Take Readings Again',
          shortcut: 'Mod+R',
          enabled: !state.reading,
          onSelect: actions.refresh,
        },
      ],
    },
  ];
}
