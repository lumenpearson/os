import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildCalendarMenus, type CalendarActions, type CalendarMenuState } from './menus';
import { VIEW_SHORTCUTS } from './view';

function actions(): CalendarActions {
  return {
    newEvent: vi.fn(),
    editEvent: vi.fn(),
    deleteEvent: vi.fn(),
    close: vi.fn(),
    find: vi.fn(),
    setView: vi.fn(),
    today: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

const state: CalendarMenuState = { view: 'month', hasSelection: false, showSidebar: true };

function item(menus: MenuTemplate[], menuId: string, itemId: string): MenuItemTemplate | undefined {
  return menus.find((m) => m.id === menuId)?.items.find((i) => i.id === itemId);
}

describe('buildCalendarMenus', () => {
  it('offers File, Edit and View', () => {
    expect(buildCalendarMenus(state, actions()).map((m) => m.id)).toEqual(['file', 'edit', 'view']);
  });

  it('greys out the commands that need an event', () => {
    const menus = buildCalendarMenus(state, actions());
    expect(item(menus, 'file', 'delete-event')?.enabled).toBe(false);
    expect(item(menus, 'file', 'edit-event')?.enabled).toBe(false);
    const selected = buildCalendarMenus({ ...state, hasSelection: true }, actions());
    expect(item(selected, 'file', 'delete-event')?.enabled).toBe(true);
  });

  it('checks the view that is on screen', () => {
    const menus = buildCalendarMenus({ ...state, view: 'week' }, actions());
    const views = menus
      .find((m) => m.id === 'view')
      ?.items.filter((i) => i.type === 'radio')
      .map((i) => [i.label, i.checked]);
    expect(views).toEqual([
      ['Month', false],
      ['Week', true],
      ['Day', false],
      ['Agenda', false],
    ]);
  });

  it('carries the same shortcuts the window binds', () => {
    const menus = buildCalendarMenus(state, actions());
    expect(item(menus, 'view', 'view-month')?.shortcut).toBe(VIEW_SHORTCUTS.month);
    expect(item(menus, 'view', 'view-agenda')?.shortcut).toBe('Mod+4');
    expect(item(menus, 'file', 'new-event')?.shortcut).toBe('Mod+N');
    expect(item(menus, 'edit', 'find')?.shortcut).toBe('Mod+F');
  });

  it('runs the action behind an item', () => {
    const api = actions();
    const menus = buildCalendarMenus(state, api);
    item(menus, 'view', 'today')?.onSelect?.();
    item(menus, 'view', 'view-day')?.onSelect?.();
    item(menus, 'file', 'new-event')?.onSelect?.();
    expect(api.today).toHaveBeenCalledOnce();
    expect(api.setView).toHaveBeenCalledWith('day');
    expect(api.newEvent).toHaveBeenCalledOnce();
  });

  it('mirrors the sidebar switch', () => {
    expect(item(buildCalendarMenus(state, actions()), 'view', 'sidebar')?.checked).toBe(true);
    expect(
      item(buildCalendarMenus({ ...state, showSidebar: false }, actions()), 'view', 'sidebar')
        ?.checked,
    ).toBe(false);
  });
});
