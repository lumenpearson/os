import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import { INITIAL_EDITOR_STATE } from './editing';
import { buildMenus, type WriterActions, type WriterMenuState } from './menus';

function stubActions(calls: string[]): WriterActions {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length > 0 ? `${name}:${String(args[0])}` : name);
    };
  return {
    newDocument: record('newDocument'),
    open: record('open'),
    save: record('save'),
    saveAs: record('saveAs'),
    exportAs: record('exportAs'),
    closeWindow: record('closeWindow'),
    undo: record('undo'),
    redo: record('redo'),
    cut: record('cut'),
    copy: record('copy'),
    paste: record('paste'),
    selectAll: record('selectAll'),
    find: record('find'),
    findNext: record('findNext'),
    findPrevious: record('findPrevious'),
    setBlock: record('setBlock'),
    toggleMark: record('toggleMark'),
    toggleList: record('toggleList'),
    setAlignment: record('setAlignment'),
    indent: record('indent'),
    outdent: record('outdent'),
    link: record('link'),
    removeLink: record('removeLink'),
    clearFormatting: record('clearFormatting'),
    insertRule: record('insertRule'),
    insertDate: record('insertDate'),
    toggleReadingMode: record('toggleReadingMode'),
    toggleFullScreen: record('toggleFullScreen'),
    showShortcuts: record('showShortcuts'),
    showAbout: record('showAbout'),
  };
}

const baseState: WriterMenuState = {
  editor: INITIAL_EDITOR_STATE,
  readOnly: false,
  readingMode: false,
  fullscreen: false,
  hasMatches: false,
};

function flatten(menus: MenuTemplate[]): MenuItemTemplate[] {
  const out: MenuItemTemplate[] = [];
  const walk = (items: MenuItemTemplate[]) => {
    for (const item of items) {
      out.push(item);
      if (item.submenu) walk(item.submenu);
    }
  };
  for (const menu of menus) walk(menu.items);
  return out;
}

function item(menus: MenuTemplate[], id: string): MenuItemTemplate {
  const found = flatten(menus).find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no menu item ${id}`);
  return found;
}

describe('buildMenus', () => {
  it('has the five menus in order', () => {
    const menus = buildMenus(baseState, stubActions([]));
    expect(menus.map((menu) => menu.label)).toEqual(['File', 'Edit', 'Format', 'View', 'Help']);
  });

  it('binds the documented shortcuts', () => {
    const menus = buildMenus(baseState, stubActions([]));
    expect(item(menus, 'save').shortcut).toBe('Mod+S');
    expect(item(menus, 'save-as').shortcut).toBe('Shift+Mod+S');
    expect(item(menus, 'find').shortcut).toBe('Mod+F');
    expect(item(menus, 'mark-bold').shortcut).toBe('Mod+B');
    expect(item(menus, 'mark-italic').shortcut).toBe('Mod+I');
    expect(item(menus, 'mark-underline').shortcut).toBe('Mod+U');
    expect(item(menus, 'mark-strikeThrough').shortcut).toBe('Shift+Mod+X');
    expect(item(menus, 'link').shortcut).toBe('Mod+K');
    expect(item(menus, 'bullet-list').shortcut).toBe('Shift+Mod+8');
    expect(item(menus, 'number-list').shortcut).toBe('Shift+Mod+7');
    expect(item(menus, 'reading-mode').shortcut).toBe('Shift+Mod+R');
  });

  it('leaves cut, copy and paste to the platform shortcuts', () => {
    const menus = buildMenus(baseState, stubActions([]));
    for (const id of ['cut', 'copy', 'paste']) {
      expect(item(menus, id).shortcut).toBeUndefined();
    }
  });

  it('dispatches to the actions', () => {
    const calls: string[] = [];
    const menus = buildMenus(baseState, stubActions(calls));
    item(menus, 'save').onSelect?.();
    item(menus, 'export-markdown').onSelect?.();
    item(menus, 'block-h2').onSelect?.();
    item(menus, 'align-center').onSelect?.();
    item(menus, 'bullet-list').onSelect?.();
    item(menus, 'mark-bold').onSelect?.();
    expect(calls).toEqual([
      'save',
      'exportAs:markdown',
      'setBlock:h2',
      'setAlignment:center',
      'toggleList:bullet',
      'toggleMark:bold',
    ]);
  });

  it('checks the state of the current selection', () => {
    const menus = buildMenus(
      {
        ...baseState,
        editor: { ...INITIAL_EDITOR_STATE, bold: true, block: 'h1', align: 'right' },
      },
      stubActions([]),
    );
    expect(item(menus, 'mark-bold').checked).toBe(true);
    expect(item(menus, 'block-h1').checked).toBe(true);
    expect(item(menus, 'align-right').checked).toBe(true);
    expect(item(menus, 'align-left').checked).toBe(false);
  });

  it('disables editing commands for a read-only document', () => {
    const menus = buildMenus({ ...baseState, readOnly: true }, stubActions([]));
    expect(item(menus, 'save').enabled).toBe(false);
    expect(item(menus, 'mark-bold').enabled).toBe(false);
    expect(item(menus, 'insert-date').enabled).toBe(false);
    expect(item(menus, 'save-as').enabled).toBeUndefined();
  });

  it('rests the editing commands in reading mode but still saves', () => {
    const menus = buildMenus({ ...baseState, readingMode: true }, stubActions([]));
    expect(item(menus, 'mark-bold').enabled).toBe(false);
    expect(item(menus, 'undo').enabled).toBe(false);
    expect(item(menus, 'save').enabled).toBe(true);
    expect(item(menus, 'reading-mode').checked).toBe(true);
  });

  it('enables find next only once there are matches', () => {
    expect(item(buildMenus(baseState, stubActions([])), 'find-next').enabled).toBe(false);
    const withMatches = buildMenus({ ...baseState, hasMatches: true }, stubActions([]));
    expect(item(withMatches, 'find-next').enabled).toBe(true);
  });
});
