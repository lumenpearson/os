import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, parseShortcut } from './shortcuts';

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('shortcuts', () => {
  it('parses modifiers and aliases', () => {
    expect(parseShortcut('Mod+Shift+S')).toMatchObject({ mod: true, shift: true, key: 's' });
    expect(parseShortcut('Ctrl+Alt+Del')).toMatchObject({ ctrl: true, alt: true, key: 'delete' });
    expect(parseShortcut('Esc')).toMatchObject({ key: 'escape' });
  });

  it('matches Mod as Ctrl when preference is ctrl and as Meta when meta', () => {
    expect(matchesShortcut(ev('s', { ctrlKey: true }), 'Mod+S', 'ctrl')).toBe(true);
    expect(matchesShortcut(ev('s', { metaKey: true }), 'Mod+S', 'ctrl')).toBe(false);
    expect(matchesShortcut(ev('s', { metaKey: true }), 'Mod+S', 'meta')).toBe(true);
    expect(matchesShortcut(ev('S', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+S', 'ctrl')).toBe(
      true,
    );
    expect(matchesShortcut(ev('s', { ctrlKey: true, shiftKey: true }), 'Mod+S', 'ctrl')).toBe(
      false,
    );
  });

  it('formats for Windows and macOS conventions', () => {
    expect(formatShortcut('Mod+Shift+S', 'ctrl')).toBe('Ctrl+Shift+S');
    expect(formatShortcut('Mod+Shift+S', 'meta')).toBe('⇧⌘S');
    expect(formatShortcut('Alt+ArrowUp', 'ctrl')).toBe('Alt+↑');
  });
});
