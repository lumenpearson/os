import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildMenus, type SheetsMenuActions, type SheetsMenuState } from './menus';

const state: SheetsMenuState = {
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  align: undefined,
  format: 'general',
  canDeleteSheet: true,
};

function actions(): SheetsMenuActions {
  return {
    newWindow: vi.fn(),
    open: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    exportCsv: vi.fn(),
    close: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    selectAll: vi.fn(),
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    setAlign: vi.fn(),
    setFormat: vi.fn(),
    insertRowAbove: vi.fn(),
    insertRowBelow: vi.fn(),
    insertColumnLeft: vi.fn(),
    insertColumnRight: vi.fn(),
    deleteRow: vi.fn(),
    deleteColumn: vi.fn(),
    addSheet: vi.fn(),
    renameSheet: vi.fn(),
    deleteSheet: vi.fn(),
    showFunctions: vi.fn(),
  };
}

function menu(menus: MenuTemplate[], id: string): MenuTemplate {
  const found = menus.find((m) => m.id === id);
  if (!found) throw new Error(`no menu ${id}`);
  return found;
}

function item(menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate {
  const walk = (items: MenuItemTemplate[]): MenuItemTemplate | undefined => {
    for (const it of items) {
      if (it.id === itemId) return it;
      const nested = it.submenu ? walk(it.submenu) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  const found = walk(menu(menus, menuId).items);
  if (!found) throw new Error(`no item ${itemId}`);
  return found;
}

describe('buildMenus', () => {
  it('has the six menus in order', () => {
    expect(buildMenus(state, actions()).map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'Format',
      'Insert',
      'Sheet',
      'Help',
    ]);
  });

  it('gives the documented shortcuts', () => {
    const menus = buildMenus(state, actions());
    const shortcuts: Record<string, string> = {
      new: 'Mod+N',
      open: 'Mod+O',
      save: 'Mod+S',
      'save-as': 'Shift+Mod+S',
      close: 'Mod+W',
      undo: 'Mod+Z',
      redo: 'Shift+Mod+Z',
      cut: 'Mod+X',
      copy: 'Mod+C',
      paste: 'Mod+V',
      'select-all': 'Mod+A',
      bold: 'Mod+B',
      italic: 'Mod+I',
    };
    for (const [id, keys] of Object.entries(shortcuts)) {
      const found = ['file', 'edit', 'format'].map((m) => {
        try {
          return item(menus, m, id);
        } catch {
          return null;
        }
      });
      expect(found.find(Boolean)?.shortcut, id).toBe(keys);
    }
  });

  it('runs the action behind each item', () => {
    const a = actions();
    const menus = buildMenus(state, a);
    item(menus, 'file', 'save').onSelect?.();
    item(menus, 'edit', 'copy').onSelect?.();
    item(menus, 'insert', 'row-above').onSelect?.();
    item(menus, 'sheet', 'add-sheet').onSelect?.();
    item(menus, 'help', 'functions').onSelect?.();
    expect(a.save).toHaveBeenCalledOnce();
    expect(a.copy).toHaveBeenCalledOnce();
    expect(a.insertRowAbove).toHaveBeenCalledOnce();
    expect(a.addSheet).toHaveBeenCalledOnce();
    expect(a.showFunctions).toHaveBeenCalledOnce();
  });

  it('disables undo and redo until there is history', () => {
    const menus = buildMenus(state, actions());
    expect(item(menus, 'edit', 'undo').enabled).toBe(false);
    expect(item(menus, 'edit', 'redo').enabled).toBe(false);
    const withHistory = buildMenus({ ...state, canUndo: true, canRedo: true }, actions());
    expect(item(withHistory, 'edit', 'undo').enabled).toBe(true);
    expect(item(withHistory, 'edit', 'redo').enabled).toBe(true);
  });

  it('ticks Bold and Italic from the active cell', () => {
    const menus = buildMenus({ ...state, bold: true }, actions());
    expect(item(menus, 'format', 'bold').checked).toBe(true);
    expect(item(menus, 'format', 'italic').checked).toBe(false);
  });

  it('offers the alignments as a radio submenu', () => {
    const menus = buildMenus({ ...state, align: 'center' }, actions());
    const align = item(menus, 'format', 'align');
    expect(align.submenu?.map((i) => i.label)).toEqual(['Left', 'Center', 'Right']);
    expect(item(menus, 'format', 'align-center').checked).toBe(true);
    expect(item(menus, 'format', 'align-left').checked).toBe(false);
  });

  it('offers every number format', () => {
    const menus = buildMenus({ ...state, format: 'currency' }, actions());
    expect(item(menus, 'format', 'number').submenu?.map((i) => i.label)).toEqual([
      'General',
      'Number',
      'Percent',
      'Currency',
      'Date',
    ]);
    expect(item(menus, 'format', 'format-currency').checked).toBe(true);
  });

  it('picks an alignment and a format through the submenu', () => {
    const a = actions();
    const menus = buildMenus(state, a);
    item(menus, 'format', 'align-right').onSelect?.();
    item(menus, 'format', 'format-percent').onSelect?.();
    expect(a.setAlign).toHaveBeenCalledWith('right');
    expect(a.setFormat).toHaveBeenCalledWith('percent');
  });

  it('will not delete the last sheet', () => {
    const menus = buildMenus({ ...state, canDeleteSheet: false }, actions());
    expect(item(menus, 'sheet', 'delete-sheet').enabled).toBe(false);
  });

  it('separates the groups of the File and Edit menus', () => {
    const menus = buildMenus(state, actions());
    expect(menu(menus, 'file').items.filter((i) => i.type === 'separator')).toHaveLength(2);
    expect(menu(menus, 'edit').items.filter((i) => i.type === 'separator')).toHaveLength(2);
  });
});
