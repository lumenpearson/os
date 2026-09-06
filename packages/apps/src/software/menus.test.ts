import { describe, expect, it, vi } from 'vitest';
import { buildSoftwareMenus, SECTIONS, type SoftwareActions } from './menus';

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
    expect(buildSoftwareMenus({ section: 'store' }, actions()).map((m) => m.label)).toEqual([
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
    const find = (section: 'installed' | 'install' | 'store') =>
      buildSoftwareMenus({ section }, actions())[1]?.items[0];
    expect(find('installed')?.enabled).toBe(true);
    expect(find('store')?.enabled).toBe(true);
    expect(find('install')?.enabled).toBe(false);
    expect(find('installed')?.shortcut).toBe('Mod+F');
  });

  it('lists the three sections as radios, with the current one checked', () => {
    const [, , view] = buildSoftwareMenus({ section: 'install' }, actions());
    expect(view?.items.slice(0, 3).map((i) => i.label)).toEqual(SECTIONS.map((s) => s.label));
    expect(view?.items.slice(0, 3).map((i) => i.type)).toEqual(['radio', 'radio', 'radio']);
    expect(view?.items.slice(0, 3).map((i) => i.checked)).toEqual([false, false, true]);
    expect(view?.items.slice(0, 3).map((i) => i.shortcut)).toEqual(['Mod+1', 'Mod+2', 'Mod+3']);
  });

  it('refreshes the catalogue from the View menu, after a separator', () => {
    const spies = actions();
    const [, , view] = buildSoftwareMenus({ section: 'store' }, spies);
    expect(view?.items[3]?.type).toBe('separator');
    expect(view?.items[4]?.label).toBe('Refresh Catalogue');
    expect(view?.items[4]?.shortcut).toBe('Mod+R');
    view?.items[4]?.onSelect?.();
    expect(spies.refresh).toHaveBeenCalledOnce();
  });

  it('switches section from the View menu', () => {
    const spies = actions();
    const [, , view] = buildSoftwareMenus({ section: 'installed' }, spies);
    view?.items[2]?.onSelect?.();
    expect(spies.show).toHaveBeenCalledWith('install');
  });
});
