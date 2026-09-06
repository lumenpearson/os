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

describe('Shift chords over digits and punctuation', () => {
  const chord = (key: string, code: string) => ({
    key,
    code,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
  });

  it('matches Shift+Mod+Period, which arrives as ">"', () => {
    // Files binds Show Hidden Files to this. Without the physical-key fallback
    // the definition's "." is compared against the shifted glyph and never hits.
    expect(matchesShortcut(chord('>', 'Period'), 'Shift+Mod+Period', 'ctrl')).toBe(true);
  });

  it('matches Shift+Mod+8, which arrives as "*"', () => {
    expect(matchesShortcut(chord('*', 'Digit8'), 'Shift+Mod+8', 'ctrl')).toBe(true);
  });

  it('does not match a different physical key that prints the same glyph', () => {
    expect(matchesShortcut(chord('>', 'Comma'), 'Shift+Mod+Period', 'ctrl')).toBe(false);
  });

  it('still needs Shift when the chord asks for it', () => {
    expect(
      matchesShortcut(
        { key: '.', code: 'Period', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        'Shift+Mod+Period',
        'ctrl',
      ),
    ).toBe(false);
  });
});

describe('formatShortcut with no key', () => {
  it('renders a modifier-only chord without a dangling separator', () => {
    // The Start menu is bound to Meta on its own.
    expect(formatShortcut('Meta', 'ctrl')).toBe('Win');
  });
});
