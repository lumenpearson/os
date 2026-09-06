import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildPaintMenus, type PaintActions, type PaintMenuState } from './menus';

const state: PaintMenuState = {
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  hasClipboard: false,
  showGrid: true,
  gridAvailable: false,
};

const actions = (): PaintActions => ({
  newDocument: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
  exportPng: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
  deselect: vi.fn(),
  crop: vi.fn(),
  canvasSize: vi.fn(),
  scaleImage: vi.fn(),
  flipHorizontal: vi.fn(),
  flipVertical: vi.fn(),
  rotateLeft: vi.fn(),
  rotateRight: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  actualSize: vi.fn(),
  fitToWindow: vi.fn(),
  toggleGrid: vi.fn(),
});

const items = (menus: MenuTemplate[], id: string): MenuItemTemplate[] =>
  menus.find((menu) => menu.id === id)?.items ?? [];

const item = (menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate | undefined =>
  items(menus, menu).find((entry) => entry.id === id);

describe('buildPaintMenus', () => {
  it('has the four menus in order', () => {
    expect(buildPaintMenus(state, actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'image',
      'view',
    ]);
  });

  it('gives every command an id, a label and a handler', () => {
    for (const menu of buildPaintMenus(state, actions())) {
      for (const entry of menu.items) {
        if (entry.type === 'separator') continue;
        expect(entry.id).toBeTruthy();
        expect(entry.label).toBeTruthy();
        expect(typeof entry.onSelect).toBe('function');
      }
    }
  });

  it('uses each shortcut once across the whole bar', () => {
    const keys = buildPaintMenus(state, actions())
      .flatMap((menu) => menu.items)
      .map((entry) => entry.shortcut)
      .filter((keys): keys is string => Boolean(keys));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('runs the action it was given', () => {
    const handlers = actions();
    const menus = buildPaintMenus({ ...state, canUndo: true }, handlers);
    item(menus, 'edit', 'undo')?.onSelect?.();
    item(menus, 'file', 'export')?.onSelect?.();
    expect(handlers.undo).toHaveBeenCalledOnce();
    expect(handlers.exportPng).toHaveBeenCalledOnce();
  });

  it('greys out undo and redo until there is history', () => {
    const empty = buildPaintMenus(state, actions());
    expect(item(empty, 'edit', 'undo')?.enabled).toBe(false);
    expect(item(empty, 'edit', 'redo')?.enabled).toBe(false);
    const full = buildPaintMenus({ ...state, canUndo: true, canRedo: true }, actions());
    expect(item(full, 'edit', 'undo')?.enabled).toBe(true);
    expect(item(full, 'edit', 'redo')?.enabled).toBe(true);
  });

  it('greys out the selection commands until there is a selection', () => {
    const none = buildPaintMenus(state, actions());
    for (const id of ['cut', 'copy', 'deselect', 'crop']) {
      expect(item(none, 'edit', id)?.enabled).toBe(false);
    }
    expect(item(none, 'edit', 'select-all')?.enabled).toBeUndefined();
    const some = buildPaintMenus({ ...state, hasSelection: true }, actions());
    for (const id of ['cut', 'copy', 'deselect', 'crop']) {
      expect(item(some, 'edit', id)?.enabled).toBe(true);
    }
  });

  it('greys out paste until something has been copied', () => {
    expect(item(buildPaintMenus(state, actions()), 'edit', 'paste')?.enabled).toBe(false);
    expect(
      item(buildPaintMenus({ ...state, hasClipboard: true }, actions()), 'edit', 'paste')?.enabled,
    ).toBe(true);
  });

  it('shows the grid as a checkbox, live but disabled when zoomed out', () => {
    const out = item(buildPaintMenus(state, actions()), 'view', 'grid');
    expect(out?.type).toBe('checkbox');
    expect(out?.checked).toBe(true);
    expect(out?.enabled).toBe(false);
    const inClose = item(
      buildPaintMenus({ ...state, gridAvailable: true, showGrid: false }, actions()),
      'view',
      'grid',
    );
    expect(inClose?.checked).toBe(false);
    expect(inClose?.enabled).toBe(true);
  });

  it('carries the standard shortcuts', () => {
    const menus = buildPaintMenus(state, actions());
    expect(item(menus, 'file', 'save')?.shortcut).toBe('Mod+S');
    expect(item(menus, 'edit', 'undo')?.shortcut).toBe('Mod+Z');
    expect(item(menus, 'edit', 'redo')?.shortcut).toBe('Shift+Mod+Z');
    expect(item(menus, 'view', 'zoom-in')?.shortcut).toBe('Mod+=');
    expect(item(menus, 'view', 'actual-size')?.shortcut).toBe('Mod+0');
  });

  it('offers the image commands the spec asks for', () => {
    const ids = items(buildPaintMenus(state, actions()), 'image')
      .map((entry) => entry.id)
      .filter(Boolean);
    expect(ids).toEqual([
      'canvas-size',
      'scale',
      'flip-h',
      'flip-v',
      'rotate-left',
      'rotate-right',
    ]);
  });
});
