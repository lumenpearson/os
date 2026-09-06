import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildPreviewMenus, type PreviewActions, type PreviewMenuState } from './menus';

const actions = (): PreviewActions => ({
  open: vi.fn(),
  reveal: vi.fn(),
  previous: vi.fn(),
  next: vi.fn(),
  close: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  actualSize: vi.fn(),
  fitToWindow: vi.fn(),
  rotateLeft: vi.fn(),
  rotateRight: vi.fn(),
  flipHorizontal: vi.fn(),
  flipVertical: vi.fn(),
  toggleFullScreen: vi.fn(),
  toggleFilmstrip: vi.fn(),
  toggleSource: vi.fn(),
});

const state = (patch: Partial<PreviewMenuState> = {}): PreviewMenuState => ({
  hasFile: true,
  zoomable: true,
  hasPrevious: true,
  hasNext: true,
  hasSource: false,
  showingSource: false,
  canFilmstrip: true,
  filmstrip: false,
  fullScreen: false,
  ...patch,
});

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('buildPreviewMenus', () => {
  it('contributes File and View', () => {
    expect(buildPreviewMenus(state(), actions()).map((m) => m.label)).toEqual(['File', 'View']);
  });

  it('runs the action behind each command', () => {
    const acts = actions();
    const menus = buildPreviewMenus(state(), acts);
    item(menus, 'file', 'reveal').onSelect?.();
    item(menus, 'view', 'rotate-left').onSelect?.();
    item(menus, 'view', 'full-screen').onSelect?.();
    expect(acts.reveal).toHaveBeenCalledOnce();
    expect(acts.rotateLeft).toHaveBeenCalledOnce();
    expect(acts.toggleFullScreen).toHaveBeenCalledOnce();
  });

  it('turns the zoom commands off for viewers that do not draw pixels', () => {
    const menus = buildPreviewMenus(state({ zoomable: false }), actions());
    for (const id of ['zoom-in', 'zoom-out', 'actual-size', 'fit', 'rotate-right', 'flip-vertical'])
      expect(item(menus, 'view', id).enabled).toBe(false);
  });

  it('disables the arrows at the ends of the folder', () => {
    const menus = buildPreviewMenus(state({ hasPrevious: false, hasNext: false }), actions());
    expect(item(menus, 'file', 'previous').enabled).toBe(false);
    expect(item(menus, 'file', 'next').enabled).toBe(false);
  });

  it('offers View Source only where there is source to read', () => {
    expect(item(buildPreviewMenus(state(), actions()), 'view', 'source').enabled).toBe(false);
    const svg = buildPreviewMenus(state({ hasSource: true, showingSource: true }), actions());
    expect(item(svg, 'view', 'source')).toMatchObject({ enabled: true, checked: true });
  });

  it('marks the toggles that are on', () => {
    const menus = buildPreviewMenus(state({ filmstrip: true, fullScreen: true }), actions());
    expect(item(menus, 'view', 'filmstrip')).toMatchObject({ type: 'checkbox', checked: true });
    expect(item(menus, 'view', 'full-screen').checked).toBe(true);
  });

  it('publishes the shortcuts the window binds', () => {
    const menus = buildPreviewMenus(state(), actions());
    expect(item(menus, 'view', 'zoom-in').shortcut).toBe('Mod+=');
    expect(item(menus, 'view', 'actual-size').shortcut).toBe('Mod+0');
    expect(item(menus, 'view', 'fit').shortcut).toBe('Mod+9');
    expect(item(menus, 'view', 'full-screen').shortcut).toBe('F');
    expect(item(menus, 'file', 'next').shortcut).toBe('Mod+Right');
    expect(item(menus, 'file', 'previous').shortcut).toBe('Mod+Left');
  });

  it('uses each shortcut once', () => {
    const keys = buildPreviewMenus(state(), actions())
      .flatMap((m) => m.items)
      .map((i) => i.shortcut)
      .filter((s): s is string => Boolean(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps Open available with no file loaded', () => {
    const menus = buildPreviewMenus(state({ hasFile: false }), actions());
    expect(item(menus, 'file', 'open').enabled).toBeUndefined();
    expect(item(menus, 'file', 'reveal').enabled).toBe(false);
  });
});
