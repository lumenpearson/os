/**
 * The menubar for the Software Center window. The install commands take the
 * window to the Install section first, so a menu choice and a click on the
 * same control end in the same place, and Refresh takes it to the Store,
 * because that is the thing being refreshed.
 */

import type { MenuTemplate } from '@lumen/kernel';

export type SectionId =
  | 'discover'
  | 'categories'
  | 'collections'
  | 'deals'
  | 'installed'
  | 'updates'
  | 'account'
  | 'subscription'
  | 'purchases'
  | 'settings'
  | 'install';

export interface SectionMeta {
  id: SectionId;
  label: string;
  /** Which band of the sidebar it sits in. */
  group: 'store' | 'library' | 'account' | 'system';
}

/**
 * Every place the store can be, in sidebar order.
 *
 * Three sections in a segmented control was the whole of it: a catalogue, a
 * list of what was installed, and a file picker. Everything else the store
 * already knew — the plan, the subscription, the receipts, the collections
 * the catalogue ships — had nowhere to be shown. These are the places for it,
 * and each one answers a question a person actually arrives with.
 */
export const SECTIONS: ReadonlyArray<SectionMeta> = [
  { id: 'discover', label: 'Discover', group: 'store' },
  { id: 'installed', label: 'Installed', group: 'library' },
  { id: 'install', label: 'Add Package', group: 'system' },
];

/*
 * The list above is what the store HAS, and a section joins it in the commit
 * that builds its view — a sidebar entry that leads nowhere is a worse store
 * than a short sidebar. The remaining ids in `SectionId` are the ones being
 * built: categories, collections, deals, updates, account, subscription,
 * purchases and settings.
 */

/** The sidebar's bands, in order, with the heading each one carries. */
export const SECTION_GROUPS: ReadonlyArray<{ id: SectionMeta['group']; title: string }> = [
  { id: 'store', title: 'Store' },
  { id: 'library', title: 'Library' },
  { id: 'account', title: 'Account' },
  { id: 'system', title: 'Manage' },
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
        /*
         * The View menu mirrors the sidebar, bands and all, so the two ways
         * of moving around the store name the same places in the same order.
         * Only the first nine carry a number: there is no Mod+10 key, and a
         * shortcut printed beside an item that does not answer to it is worse
         * than no shortcut at all.
         */
        ...SECTION_GROUPS.flatMap((group, groupIndex) => [
          ...(groupIndex > 0 ? [{ type: 'separator' as const }] : []),
          ...SECTIONS.filter((s) => s.group === group.id).map((s) => {
            const index = SECTIONS.indexOf(s);
            return {
              id: `view.${s.id}`,
              type: 'radio' as const,
              label: s.label,
              ...(index < 9 ? { shortcut: `Mod+${index + 1}` } : {}),
              checked: state.section === s.id,
              onSelect: () => actions.show(s.id),
            };
          }),
        ]),
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
