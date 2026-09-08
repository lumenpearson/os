import { describe, expect, it, vi } from 'vitest';
import { type WindowMenuState, windowMenuItems } from './windowMenu';

const shortcut = (id: string) => `[${id}]`;

const noActions = {
  minimize: () => {},
  zoom: () => {},
  snapLeft: () => {},
  snapRight: () => {},
  close: () => {},
};

function state(over: Partial<WindowMenuState> = {}): WindowMenuState {
  return {
    minimizable: true,
    maximizable: true,
    closable: true,
    snapping: true,
    snap: null,
    fullscreen: false,
    ...over,
  };
}

const labels = (items: ReturnType<typeof windowMenuItems>) =>
  items.filter((i) => i.type !== 'separator').map((i) => i.label);
const byId = (items: ReturnType<typeof windowMenuItems>, id: string) =>
  items.find((i) => i.id === id);

describe('windowMenuItems', () => {
  it('offers the window commands with the keys the system is bound to', () => {
    const items = windowMenuItems(state(), noActions, shortcut);
    expect(labels(items)).toEqual(['Minimize', 'Zoom', 'Snap Left', 'Snap Right', 'Close']);
    expect(byId(items, 'minimize')?.shortcut).toBe('[window.minimize]');
    expect(byId(items, 'close')?.shortcut).toBe('[window.close]');
  });

  it('runs the store action the item names', () => {
    const actions = { ...noActions, zoom: vi.fn() };
    windowMenuItems(state(), actions, shortcut)
      .find((i) => i.id === 'zoom')
      ?.onSelect?.();
    expect(actions.zoom).toHaveBeenCalledOnce();
  });

  it('leaves out the halves when snapping is off', () => {
    const items = windowMenuItems(state({ snapping: false }), noActions, shortcut);
    expect(labels(items)).toEqual(['Minimize', 'Zoom', 'Close']);
  });

  it('turns off the half the window is already on', () => {
    const items = windowMenuItems(state({ snap: 'left' }), noActions, shortcut);
    expect(byId(items, 'snap-left')?.enabled).toBe(false);
    expect(byId(items, 'snap-right')?.enabled).toBe(true);
  });

  it('follows what the window itself allows', () => {
    const items = windowMenuItems(
      state({ minimizable: false, maximizable: false, closable: false }),
      noActions,
      shortcut,
    );
    expect(byId(items, 'minimize')?.enabled).toBe(false);
    expect(byId(items, 'zoom')?.enabled).toBe(false);
    expect(byId(items, 'close')?.enabled).toBe(false);
  });

  it('offers nothing but close while the window owns the display', () => {
    const items = windowMenuItems(state({ fullscreen: true }), noActions, shortcut);
    expect(byId(items, 'minimize')?.enabled).toBe(false);
    expect(byId(items, 'zoom')?.enabled).toBe(false);
    expect(byId(items, 'snap-left')?.enabled).toBe(false);
    expect(byId(items, 'close')?.enabled).toBe(true);
  });
});
