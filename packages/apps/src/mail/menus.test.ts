import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildMailMenus, type MailActions, type MailMenuState } from './menus';

const state: MailMenuState = {
  hasSelection: true,
  unread: false,
  flagged: false,
  inTrash: false,
  inFolder: false,
  composing: false,
  canGoBack: false,
  sort: 'date',
  sidebar: true,
};

function actions(): MailActions {
  return {
    newMessage: vi.fn(),
    saveDraft: vi.fn(),
    newFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    emptyTrash: vi.fn(),
    close: vi.fn(),
    find: vi.fn(),
    reply: vi.fn(),
    replyAll: vi.fn(),
    forward: vi.fn(),
    toggleRead: vi.fn(),
    toggleFlag: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
    setSort: vi.fn(),
    back: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('buildMailMenus', () => {
  it('offers the four menus the window needs', () => {
    expect(buildMailMenus(state, actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'message',
      'view',
    ]);
  });

  it('gives every command a shortcut or a place a click can reach it', () => {
    const menus = buildMailMenus(state, actions());
    const shortcuts = menus
      .flatMap((m) => m.items)
      .map((i) => i.shortcut)
      .filter(Boolean);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(item(menus, 'message', 'reply').shortcut).toBe('Mod+R');
    expect(item(menus, 'message', 'reply-all').shortcut).toBe('Shift+Mod+R');
    expect(item(menus, 'edit', 'find').shortcut).toBe('Mod+F');
  });

  it('stands the message commands down when nothing is selected', () => {
    const menus = buildMailMenus({ ...state, hasSelection: false }, actions());
    for (const id of [
      'reply',
      'reply-all',
      'forward',
      'toggle-read',
      'flag',
      'archive',
      'delete',
    ]) {
      expect(item(menus, 'message', id).enabled).toBe(false);
    }
  });

  it('hands the message commands to the draft while one is being written', () => {
    const menus = buildMailMenus({ ...state, composing: true }, actions());
    expect(item(menus, 'message', 'reply').enabled).toBe(false);
    expect(item(menus, 'file', 'save-draft').enabled).toBe(true);
  });

  it('offers Archive outside the Trash and Restore inside it', () => {
    const outside = buildMailMenus(state, actions());
    expect(item(outside, 'message', 'archive').enabled).toBe(true);
    expect(item(outside, 'message', 'restore').enabled).toBe(false);
    const inside = buildMailMenus({ ...state, inTrash: true }, actions());
    expect(item(inside, 'message', 'archive').enabled).toBe(false);
    expect(item(inside, 'message', 'restore').enabled).toBe(true);
  });

  it('flips the read command to match the selection', () => {
    expect(item(buildMailMenus(state, actions()), 'message', 'toggle-read').label).toBe(
      'Mark as Unread',
    );
    expect(
      item(buildMailMenus({ ...state, unread: true }, actions()), 'message', 'toggle-read').label,
    ).toBe('Mark as Read');
  });

  it('says plainly that Delete is final inside the Trash', () => {
    expect(item(buildMailMenus(state, actions()), 'message', 'delete').label).toBe('Delete');
    expect(
      item(buildMailMenus({ ...state, inTrash: true }, actions()), 'message', 'delete').label,
    ).toBe('Delete Permanently');
  });

  it('only offers to rename or delete a folder while one is open', () => {
    const closed = buildMailMenus(state, actions());
    expect(item(closed, 'file', 'rename-folder').enabled).toBe(false);
    const open = buildMailMenus({ ...state, inFolder: true }, actions());
    expect(item(open, 'file', 'rename-folder').enabled).toBe(true);
    expect(item(open, 'file', 'delete-folder').enabled).toBe(true);
  });

  it('saves a draft only while one is open', () => {
    expect(item(buildMailMenus(state, actions()), 'file', 'save-draft').enabled).toBe(false);
    expect(
      item(buildMailMenus({ ...state, composing: true }, actions()), 'file', 'save-draft').enabled,
    ).toBe(true);
  });

  it('offers the way back to the list only when the list is out of sight', () => {
    expect(item(buildMailMenus(state, actions()), 'view', 'back').enabled).toBe(false);
    const folded = buildMailMenus({ ...state, canGoBack: true }, actions());
    expect(item(folded, 'view', 'back').enabled).toBe(true);
    expect(item(folded, 'view', 'back').shortcut).toBe('Escape');
  });

  it('checks the sort in force and the sidebar switch', () => {
    const menus = buildMailMenus({ ...state, sort: 'subject' }, actions());
    const sort = item(menus, 'view', 'sort').submenu ?? [];
    expect(sort.find((i) => i.id === 'sort-subject')?.checked).toBe(true);
    expect(sort.find((i) => i.id === 'sort-date')?.checked).toBe(false);
    expect(item(menus, 'view', 'sidebar').checked).toBe(true);
  });

  it('runs the action it was built with', () => {
    const on = actions();
    const menus = buildMailMenus(state, on);
    item(menus, 'file', 'new-message').onSelect?.();
    item(menus, 'message', 'archive').onSelect?.();
    (item(menus, 'view', 'sort').submenu ?? []).find((i) => i.id === 'sort-from')?.onSelect?.();
    expect(on.newMessage).toHaveBeenCalledOnce();
    expect(on.archive).toHaveBeenCalledOnce();
    expect(on.setSort).toHaveBeenCalledWith('from');
  });
});
