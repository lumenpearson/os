import { describe, expect, it, vi } from 'vitest';
import { buildSoftwareMenus, SECTIONS, type SoftwareActions } from './menus';

function actions(): SoftwareActions {
  return {
    installFromFile: vi.fn(),
    pasteManifest: vi.fn(),
    find: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  };
}

describe('buildSoftwareMenus', () => {
  it('contributes File, Edit and View', () => {
    expect(buildSoftwareMenus({ section: 'installed' }, actions()).map((m) => m.label)).toEqual([
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
    const find = (section: 'installed' | 'install' | 'catalogue') =>
      buildSoftwareMenus({ section }, actions())[1]?.items[0];
    expect(find('installed')?.enabled).toBe(true);
    expect(find('catalogue')?.enabled).toBe(true);
    expect(find('install')?.enabled).toBe(false);
    expect(find('installed')?.shortcut).toBe('Mod+F');
  });

  it('lists the three sections as radios, with the current one checked', () => {
    const [, , view] = buildSoftwareMenus({ section: 'catalogue' }, actions());
    expect(view?.items.map((i) => i.label)).toEqual(SECTIONS.map((s) => s.label));
    expect(view?.items.map((i) => i.type)).toEqual(['radio', 'radio', 'radio']);
    expect(view?.items.map((i) => i.checked)).toEqual([false, false, true]);
    expect(view?.items.map((i) => i.shortcut)).toEqual(['Mod+1', 'Mod+2', 'Mod+3']);
  });

  it('switches section from the View menu', () => {
    const spies = actions();
    const [, , view] = buildSoftwareMenus({ section: 'installed' }, spies);
    view?.items[1]?.onSelect?.();
    expect(spies.show).toHaveBeenCalledWith('install');
  });
});
