import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { RATES } from './config';
import { buildMediaMenus, type MediaActions, type MediaMenuState } from './menus';

const base: MediaMenuState = {
  hasTracks: true,
  hasTrack: true,
  playing: false,
  loop: 'off',
  shuffle: false,
  rate: 1,
  fullscreen: false,
  showPlaylist: true,
  showVisualiser: true,
  canVisualise: true,
};

function actions(): MediaActions {
  return {
    open: vi.fn(),
    addFiles: vi.fn(),
    addFolder: vi.fn(),
    clear: vi.fn(),
    toggle: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    setRate: vi.fn(),
    setLoop: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleFullscreen: vi.fn(),
    togglePlaylist: vi.fn(),
    toggleVisualiser: vi.fn(),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate | undefined {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  return found;
}

describe('buildMediaMenus', () => {
  it('has File, Playback and View', () => {
    expect(buildMediaMenus(base, actions()).map((m) => m.id)).toEqual(['file', 'playback', 'view']);
  });

  it('gives every shortcut to one command only', () => {
    const shortcuts = buildMediaMenus(base, actions())
      .flatMap((m) => m.items)
      .flatMap((i) => [i, ...(i.submenu ?? [])])
      .map((i) => i.shortcut)
      .filter((s): s is string => Boolean(s));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('names the play command after what it will do', () => {
    expect(item(buildMediaMenus(base, actions()), 'playback', 'toggle')?.label).toBe('Play');
    expect(
      item(buildMediaMenus({ ...base, playing: true }, actions()), 'playback', 'toggle')?.label,
    ).toBe('Pause');
  });

  it('disables what an empty playlist cannot do', () => {
    const menus = buildMediaMenus({ ...base, hasTracks: false, hasTrack: false }, actions());
    expect(item(menus, 'file', 'clear')?.enabled).toBe(false);
    expect(item(menus, 'playback', 'toggle')?.enabled).toBe(false);
    expect(item(menus, 'playback', 'next')?.enabled).toBe(false);
    expect(item(menus, 'file', 'open')?.enabled).not.toBe(false);
  });

  it('offers every rate and marks the current one', () => {
    const rate = item(buildMediaMenus({ ...base, rate: 1.5 }, actions()), 'playback', 'rate');
    expect(rate?.submenu?.map((i) => i.label)).toEqual([
      '0.5×',
      '0.75×',
      '1×',
      '1.25×',
      '1.5×',
      '1.75×',
      '2×',
    ]);
    expect(rate?.submenu?.filter((i) => i.checked)).toHaveLength(1);
    expect(rate?.submenu?.find((i) => i.checked)?.label).toBe('1.5×');
    expect(rate?.submenu).toHaveLength(RATES.length);
  });

  it('sets the rate that was chosen', () => {
    const handlers = actions();
    const rate = item(buildMediaMenus(base, handlers), 'playback', 'rate');
    rate?.submenu?.find((i) => i.id === 'rate-2')?.onSelect?.();
    expect(handlers.setRate).toHaveBeenCalledWith(2);
  });

  it('marks the loop mode and sets the one that was chosen', () => {
    const handlers = actions();
    const loop = item(buildMediaMenus({ ...base, loop: 'all' }, handlers), 'playback', 'loop');
    expect(loop?.submenu?.find((i) => i.checked)?.id).toBe('loop-all');
    loop?.submenu?.find((i) => i.id === 'loop-one')?.onSelect?.();
    expect(handlers.setLoop).toHaveBeenCalledWith('one');
  });

  it('checks the view toggles against state', () => {
    const menus = buildMediaMenus(
      { ...base, fullscreen: true, showPlaylist: false, showVisualiser: false },
      actions(),
    );
    expect(item(menus, 'view', 'fullscreen')?.checked).toBe(true);
    expect(item(menus, 'view', 'playlist')?.checked).toBe(false);
    expect(item(menus, 'view', 'visualiser')?.checked).toBe(false);
  });

  it('disables the visualiser toggle when there is no audio graph', () => {
    const menus = buildMediaMenus({ ...base, canVisualise: false }, actions());
    expect(item(menus, 'view', 'visualiser')?.enabled).toBe(false);
  });

  it('runs the action behind each command', () => {
    const handlers = actions();
    const menus = buildMediaMenus(base, handlers);
    item(menus, 'file', 'open')?.onSelect?.();
    item(menus, 'file', 'add-files')?.onSelect?.();
    item(menus, 'file', 'add-folder')?.onSelect?.();
    item(menus, 'file', 'clear')?.onSelect?.();
    item(menus, 'playback', 'toggle')?.onSelect?.();
    item(menus, 'playback', 'next')?.onSelect?.();
    item(menus, 'playback', 'previous')?.onSelect?.();
    item(menus, 'playback', 'shuffle')?.onSelect?.();
    item(menus, 'view', 'fullscreen')?.onSelect?.();
    item(menus, 'view', 'playlist')?.onSelect?.();
    item(menus, 'view', 'visualiser')?.onSelect?.();
    expect(handlers.open).toHaveBeenCalled();
    expect(handlers.addFiles).toHaveBeenCalled();
    expect(handlers.addFolder).toHaveBeenCalled();
    expect(handlers.clear).toHaveBeenCalled();
    expect(handlers.toggle).toHaveBeenCalled();
    expect(handlers.next).toHaveBeenCalled();
    expect(handlers.previous).toHaveBeenCalled();
    expect(handlers.toggleShuffle).toHaveBeenCalled();
    expect(handlers.toggleFullscreen).toHaveBeenCalled();
    expect(handlers.togglePlaylist).toHaveBeenCalled();
    expect(handlers.toggleVisualiser).toHaveBeenCalled();
  });
});
