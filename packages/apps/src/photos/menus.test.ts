import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPhotosMenus,
  type PhotosActions,
  type PhotosMenuState,
  pictureContextMenu,
} from './menus';

function actions(): PhotosActions {
  return {
    openInPreview: vi.fn(),
    openInPaint: vi.fn(),
    reveal: vi.fn(),
    trash: vi.fn(),
    refresh: vi.fn(),
    close: vi.fn(),
    toggleFavourite: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    openLightbox: vi.fn(),
    closeLightbox: vi.fn(),
    setSort: vi.fn(),
    setAscending: vi.fn(),
    setSize: vi.fn(),
    toggleInfo: vi.fn(),
    toggleSidebar: vi.fn(),
    focusSearch: vi.fn(),
  };
}

const state: PhotosMenuState = {
  hasSelection: true,
  favourite: false,
  canEdit: true,
  hasPrevious: false,
  hasNext: true,
  lightbox: false,
  sort: 'date',
  ascending: false,
  size: 'medium',
  info: false,
  sidebar: true,
};

function find(menus: MenuTemplate[], menu: string, item: string): MenuItemTemplate | undefined {
  return menus.find((m) => m.id === menu)?.items.find((i) => i.id === item);
}

describe('buildPhotosMenus', () => {
  it('turns off everything that needs a picture when there is none', () => {
    const menus = buildPhotosMenus({ ...state, hasSelection: false }, actions());
    for (const id of ['open-preview', 'open-paint', 'reveal', 'trash']) {
      expect(find(menus, 'file', id)?.enabled).toBe(false);
    }
    expect(find(menus, 'picture', 'favourite')?.enabled).toBe(false);
    // Refresh and Close act on the window, not on a picture.
    expect(find(menus, 'file', 'refresh')?.enabled).toBeUndefined();
  });

  it('follows the ends of the list', () => {
    const menus = buildPhotosMenus(state, actions());
    expect(find(menus, 'picture', 'previous')?.enabled).toBe(false);
    expect(find(menus, 'picture', 'next')?.enabled).toBe(true);
  });

  it('checks the sort, the order and the thumbnail size that are in force', () => {
    const menus = buildPhotosMenus(state, actions());
    expect(find(menus, 'view', 'sort-date')?.checked).toBe(true);
    expect(find(menus, 'view', 'sort-name')?.checked).toBe(false);
    expect(find(menus, 'view', 'descending')?.checked).toBe(true);
    expect(find(menus, 'view', 'ascending')?.checked).toBe(false);
    expect(find(menus, 'view', 'size-medium')?.checked).toBe(true);
  });

  it('names the lightbox command after what it will do', () => {
    expect(find(buildPhotosMenus(state, actions()), 'picture', 'lightbox')?.label).toBe(
      'View Full Window',
    );
    expect(
      find(buildPhotosMenus({ ...state, lightbox: true }, actions()), 'picture', 'lightbox')?.label,
    ).toBe('Back to Library');
  });

  it('sends the lightbox command to the matching action', () => {
    const act = actions();
    find(buildPhotosMenus(state, act), 'picture', 'lightbox')?.onSelect?.();
    expect(act.openLightbox).toHaveBeenCalledOnce();
    find(buildPhotosMenus({ ...state, lightbox: true }, act), 'picture', 'lightbox')?.onSelect?.();
    expect(act.closeLightbox).toHaveBeenCalledOnce();
  });

  it('passes the chosen sort key and size through', () => {
    const act = actions();
    const menus = buildPhotosMenus(state, act);
    find(menus, 'view', 'sort-size')?.onSelect?.();
    find(menus, 'view', 'size-large')?.onSelect?.();
    find(menus, 'view', 'ascending')?.onSelect?.();
    expect(act.setSort).toHaveBeenCalledWith('size');
    expect(act.setSize).toHaveBeenCalledWith('large');
    expect(act.setAscending).toHaveBeenCalledWith(true);
  });

  it('offers Paint only for the files Paint can edit', () => {
    const menus = buildPhotosMenus({ ...state, canEdit: false }, actions());
    expect(find(menus, 'file', 'open-paint')?.enabled).toBe(false);
    expect(find(menus, 'file', 'open-preview')?.enabled).toBe(true);
  });

  it('gives every item that is not a separator an id and a label', () => {
    for (const menu of buildPhotosMenus(state, actions())) {
      for (const item of menu.items) {
        if (item.type === 'separator') continue;
        expect(item.id).toBeTruthy();
        expect(item.label).toBeTruthy();
      }
    }
  });

  it('marks moving to the trash as destructive and as a question', () => {
    const trash = find(buildPhotosMenus(state, actions()), 'file', 'trash');
    expect(trash?.danger).toBe(true);
    expect(trash?.label).toMatch(/…$/);
  });
});

describe('pictureContextMenu', () => {
  it('offers the commands that act on the picture under the pointer', () => {
    const items = pictureContextMenu(state, actions());
    expect(items.map((i) => i.id).filter(Boolean)).toEqual([
      'view',
      'open-preview',
      'open-paint',
      'reveal',
      'favourite',
      'trash',
    ]);
  });

  it('shows whether the picture is already a favourite', () => {
    const items = pictureContextMenu({ ...state, favourite: true }, actions());
    expect(items.find((i) => i.id === 'favourite')?.checked).toBe(true);
  });
});
