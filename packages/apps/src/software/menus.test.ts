import { describe, expect, it, vi } from 'vitest';
import {
  buildSoftwareMenus,
  SECTION_GROUPS,
  SECTIONS,
  type SectionId,
  type SoftwareActions,
} from './menus';

function actions(): SoftwareActions {
  return {
    installFromFile: vi.fn(),
    pasteManifest: vi.fn(),
    refresh: vi.fn(),
    find: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  };
}

describe('buildSoftwareMenus', () => {
  it('contributes File, Edit and View', () => {
    expect(buildSoftwareMenus({ section: 'discover' }, actions()).map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
    ]);
  });

  it('puts both install routes in File, with Close after a separator', () => {
    const [file] = buildSoftwareMenus({ section: 'installed' }, actions());
    expect(file?.items.map((i) => i.label)).toEqual([
      'Install from File…',
      'Paste Manifest…',
      undefined,
      'Close',
    ]);
    expect(file?.items[2]?.type).toBe('separator');
    expect(file?.items[0]?.shortcut).toBe('Mod+O');
    expect(file?.items[1]?.shortcut).toBe('Shift+Mod+V');
  });

  it('runs the action behind each File item', () => {
    const spies = actions();
    const [file] = buildSoftwareMenus({ section: 'installed' }, spies);
    file?.items[0]?.onSelect?.();
    file?.items[1]?.onSelect?.();
    file?.items[3]?.onSelect?.();
    expect(spies.installFromFile).toHaveBeenCalledOnce();
    expect(spies.pasteManifest).toHaveBeenCalledOnce();
    expect(spies.close).toHaveBeenCalledOnce();
  });

  it('offers Find where there is a search field, and stands it down where there is not', () => {
    const find = (section: SectionId) => buildSoftwareMenus({ section }, actions())[1]?.items[0];
    expect(find('installed')?.enabled).toBe(true);
    expect(find('discover')?.enabled).toBe(true);
    expect(find('install')?.enabled).toBe(false);
    expect(find('installed')?.shortcut).toBe('Mod+F');
  });

  it('mirrors the sidebar: every section, in its bands, current one checked', () => {
    const [, , view] = buildSoftwareMenus({ section: 'install' }, actions());
    const radios = view?.items.filter((i) => i.type === 'radio') ?? [];
    expect(radios.map((i) => i.label)).toEqual(SECTIONS.map((s) => s.label));
    expect(radios.filter((i) => i.checked).map((i) => i.label)).toEqual(['Add Package']);

    // A band boundary is a separator, so the menu reads in the same groups the
    // sidebar draws: three of them between four bands.
    const between = view?.items.filter((i) => i.type === 'separator') ?? [];
    expect(between.length).toBe(SECTION_GROUPS.length - 1 + 1);
  });

  it('numbers only the sections a key can reach', () => {
    // There is no Mod+10, and a shortcut printed beside an item that does not
    // answer to it is worse than no shortcut at all. Stated as the rule rather
    // than as a count, so it still holds as sections are added.
    const [, , view] = buildSoftwareMenus({ section: 'discover' }, actions());
    const radios = view?.items.filter((i) => i.type === 'radio') ?? [];
    radios.forEach((item, index) => {
      expect(item.shortcut, `${item.label}`).toBe(index < 9 ? `Mod+${index + 1}` : undefined);
    });
  });

  it('refreshes the catalogue from the View menu, after a separator', () => {
    const spies = actions();
    const [, , view] = buildSoftwareMenus({ section: 'discover' }, spies);
    const last = view?.items.at(-1);
    expect(view?.items.at(-2)?.type).toBe('separator');
    expect(last?.label).toBe('Refresh Catalogue');
    expect(last?.shortcut).toBe('Mod+R');
    last?.onSelect?.();
    expect(spies.refresh).toHaveBeenCalledOnce();
  });

  it('switches section from the View menu', () => {
    const spies = actions();
    const [, , view] = buildSoftwareMenus({ section: 'installed' }, spies);
    // By label rather than by index: the sections are grouped now, and a
    // position in the list is no longer the same thing as a section.
    view?.items.find((i) => i.label === 'Add Package')?.onSelect?.();
    expect(spies.show).toHaveBeenCalledWith('install');
  });
});
