import { describe, expect, it } from 'vitest';
import type { MenuTemplate } from '../types';
import { findMenuShortcut, menusClaimShortcut } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {},
) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

const menus: MenuTemplate[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'new-tab', label: 'New Tab', shortcut: 'Mod+T', onSelect: () => {} },
      { id: 'close-tab', label: 'Close Tab', shortcut: 'Mod+W', onSelect: () => {} },
      { id: 'print', label: 'Print', shortcut: 'Mod+P', enabled: false, onSelect: () => {} },
      {
        id: 'share',
        label: 'Share',
        submenu: [{ id: 'copy-link', label: 'Copy Link', shortcut: 'Mod+L', onSelect: () => {} }],
      },
    ],
  },
];

describe('findMenuShortcut', () => {
  it('finds the item bound to a chord', () => {
    expect(findMenuShortcut(menus, key('w', { ctrl: true }), 'ctrl')?.id).toBe('close-tab');
  });

  it('descends into submenus', () => {
    expect(findMenuShortcut(menus, key('l', { ctrl: true }), 'ctrl')?.id).toBe('copy-link');
  });

  it('ignores a disabled item, so its chord falls through to whatever else binds it', () => {
    expect(findMenuShortcut(menus, key('p', { ctrl: true }), 'ctrl')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findMenuShortcut(menus, key('q', { ctrl: true }), 'ctrl')).toBeNull();
  });

  it('respects the modifier preference', () => {
    // The same chord written "Mod+W" is Ctrl on Windows and Cmd on macOS; the
    // other modifier must not match, or the shell would stand aside for a key
    // the app never claimed.
    expect(findMenuShortcut(menus, key('w', { meta: true }), 'meta')?.id).toBe('close-tab');
    expect(findMenuShortcut(menus, key('w', { meta: true }), 'ctrl')).toBeNull();
  });
});

describe('menusClaimShortcut', () => {
  it('is how the shell decides to yield a window chord to the focused app', () => {
    expect(menusClaimShortcut(menus, key('w', { ctrl: true }), 'ctrl')).toBe(true);
  });

  it('does not claim a chord the app has not bound', () => {
    expect(menusClaimShortcut(menus, key('m', { ctrl: true }), 'ctrl')).toBe(false);
  });

  it('treats a window with no menus as claiming nothing', () => {
    expect(menusClaimShortcut(undefined, key('w', { ctrl: true }), 'ctrl')).toBe(false);
  });
});
