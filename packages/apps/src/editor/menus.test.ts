import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildEditorMenus, type EditorActions, type EditorMenuState } from './menus';

const state: EditorMenuState = {
  hasPath: true,
  readOnly: false,
  fieldFocused: false,
  canUndo: true,
  canRedo: false,
  hasSelection: false,
  wordWrap: false,
  lineNumbers: true,
  preview: false,
  isMarkdown: false,
};

function actions(): EditorActions {
  return {
    newWindow: vi.fn(),
    open: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    close: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    find: vi.fn(),
    replace: vi.fn(),
    goToLine: vi.fn(),
    toggleWordWrap: vi.fn(),
    toggleLineNumbers: vi.fn(),
    togglePreview: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    help: vi.fn(),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate | undefined {
  return menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
}

describe('buildEditorMenus', () => {
  it('has the four menus in order', () => {
    expect(buildEditorMenus(state, actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'view',
      'help',
    ]);
  });

  it('gives every command a unique shortcut', () => {
    const shortcuts = buildEditorMenus(state, actions())
      .flatMap((menu) => menu.items)
      .map((entry) => entry.shortcut)
      .filter((keys): keys is string => Boolean(keys));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('runs the action behind an item', () => {
    const run = actions();
    const menus = buildEditorMenus(state, run);
    item(menus, 'file', 'save')?.onSelect?.();
    item(menus, 'edit', 'go-to-line')?.onSelect?.();
    expect(run.save).toHaveBeenCalledOnce();
    expect(run.goToLine).toHaveBeenCalledOnce();
  });

  it('follows undo and redo availability', () => {
    const menus = buildEditorMenus(state, actions());
    expect(item(menus, 'edit', 'undo')?.enabled).toBe(true);
    expect(item(menus, 'edit', 'redo')?.enabled).toBe(false);
  });

  it('disables what a selection or a writable file is needed for', () => {
    const menus = buildEditorMenus({ ...state, readOnly: true }, actions());
    expect(item(menus, 'file', 'save')?.enabled).toBe(false);
    expect(item(menus, 'edit', 'paste')?.enabled).toBe(false);
    expect(item(menus, 'edit', 'copy')?.enabled).toBe(false);
    expect(item(menus, 'edit', 'find')?.enabled).not.toBe(false);
    const withSelection = buildEditorMenus({ ...state, hasSelection: true }, actions());
    expect(item(withSelection, 'edit', 'copy')?.enabled).toBe(true);
  });

  it('stands down while the find field has focus', () => {
    const menus = buildEditorMenus({ ...state, fieldFocused: true, hasSelection: true }, actions());
    for (const id of ['undo', 'cut', 'copy', 'paste', 'select-all']) {
      expect(item(menus, 'edit', id)?.enabled).toBe(false);
    }
    expect(item(menus, 'edit', 'find')?.enabled).not.toBe(false);
  });

  it('checks the view toggles and only offers preview for Markdown', () => {
    const menus = buildEditorMenus({ ...state, wordWrap: true, isMarkdown: false }, actions());
    expect(item(menus, 'view', 'word-wrap')).toMatchObject({ type: 'checkbox', checked: true });
    expect(item(menus, 'view', 'line-numbers')?.checked).toBe(true);
    expect(item(menus, 'view', 'preview')?.enabled).toBe(false);
    const markdown = buildEditorMenus({ ...state, isMarkdown: true, preview: true }, actions());
    expect(item(markdown, 'view', 'preview')).toMatchObject({ enabled: true, checked: true });
  });
});
