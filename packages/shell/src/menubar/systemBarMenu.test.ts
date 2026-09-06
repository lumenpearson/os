import { describe, expect, it, vi } from 'vitest';
import { type SystemBarMenuActions, systemBarMenuItems } from './systemBarMenu';

const shortcut = (id: string) => `[${id}]`;

const noActions: SystemBarMenuActions = {
  controlCenter: () => {},
  notifications: () => {},
  search: () => {},
  settings: () => {},
};

const byId = (items: ReturnType<typeof systemBarMenuItems>, id: string) =>
  items.find((i) => i.id === id);

describe('systemBarMenuItems', () => {
  it('offers what the bar can open, with the keys bound to each', () => {
    const items = systemBarMenuItems({ unread: 0 }, noActions, shortcut);
    expect(items.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Control Center',
      'Notifications',
      'Search',
      'Menubar Settings…',
    ]);
    expect(byId(items, 'control-center')?.shortcut).toBe('[shell.controlCenter]');
    expect(byId(items, 'search')?.shortcut).toBe('[shell.spotlight]');
  });

  it('runs the command the item names', () => {
    const actions = { ...noActions, notifications: vi.fn() };
    systemBarMenuItems({ unread: 0 }, actions, shortcut)
      .find((i) => i.id === 'notifications')
      ?.onSelect?.();
    expect(actions.notifications).toHaveBeenCalledOnce();
  });

  it('says how many notifications are waiting, and stays quiet when none are', () => {
    const waiting = systemBarMenuItems({ unread: 3 }, noActions, shortcut);
    expect(byId(waiting, 'notifications')?.hint).toBe('3 unread');
    const empty = systemBarMenuItems({ unread: 0 }, noActions, shortcut);
    expect(byId(empty, 'notifications')?.hint).toBeUndefined();
  });
});
