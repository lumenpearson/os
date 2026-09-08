import { t } from '@lumen/kernel';
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
  { id: 'discover', label: t('software.discover'), group: 'store' },
  { id: 'categories', label: t('software.categories'), group: 'store' },
  { id: 'collections', label: t('software.collections'), group: 'store' },
  { id: 'deals', label: t('software.offers'), group: 'store' },
  { id: 'installed', label: t('software.installed'), group: 'library' },
  { id: 'updates', label: t('software.updates'), group: 'library' },
  { id: 'account', label: t('software.account'), group: 'account' },
  { id: 'subscription', label: t('software.subscription'), group: 'account' },
  { id: 'purchases', label: t('software.purchases'), group: 'account' },
  { id: 'install', label: t('software.addPackage'), group: 'system' },
  { id: 'settings', label: t('software.storeSettings'), group: 'system' },
];

/*
 * The list above is what the store HAS, and a section joins it in the commit
 * that builds its view — a sidebar entry that leads nowhere is a worse store
 * than a short sidebar. All eleven are built.
 */

/** The sidebar's bands, in order, with the heading each one carries. */
export const SECTION_GROUPS: ReadonlyArray<{ id: SectionMeta['group']; title: string }> = [
  { id: 'store', title: t('software.storeGroup') },
  { id: 'library', title: t('software.libraryGroup') },
  { id: 'account', title: t('software.accountGroup') },
  { id: 'system', title: t('software.manageGroup') },
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
      label: t('menu.file'),
      items: [
        {
          id: 'file.install',
          label: t('software.installFromFile'),
          shortcut: 'Mod+O',
          onSelect: actions.installFromFile,
        },
        {
          id: 'file.paste',
          label: t('software.pasteManifest'),
          shortcut: 'Shift+Mod+V',
          onSelect: actions.pasteManifest,
        },
        { type: 'separator' },
        { id: 'file.close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        {
          id: 'edit.find',
          label: t('menu.find'),
          shortcut: 'Mod+F',
          enabled: state.section !== 'install',
          onSelect: actions.find,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
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
          label: t('software.refreshCatalogue'),
          shortcut: 'Mod+R',
          onSelect: actions.refresh,
        },
      ],
    },
  ];
}
