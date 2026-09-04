import { matchesShortcut } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import { canonicalKeys, findConflict, keyToken, recordKey } from './shortcutRecorder';

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {},
  code?: string,
) => ({
  key: k,
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe('recordKey', () => {
  it('maps Ctrl to Mod when Ctrl is the primary modifier', () => {
    expect(recordKey(key('k', { ctrl: true, shift: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Mod+Shift+K',
    });
  });

  it('keeps Ctrl literal when Meta is the primary modifier', () => {
    expect(recordKey(key('k', { ctrl: true, shift: true }), { modIsMeta: true })).toEqual({
      type: 'keys',
      keys: 'Ctrl+Shift+K',
    });
  });

  it('maps Meta to Mod on macOS-style preference and keeps it literal otherwise', () => {
    expect(recordKey(key('k', { meta: true }), { modIsMeta: true })).toEqual({
      type: 'keys',
      keys: 'Mod+K',
    });
    expect(recordKey(key('k', { meta: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Meta+K',
    });
  });

  it('orders modifiers Mod, Ctrl/Meta, Alt, Shift', () => {
    expect(
      recordKey(key('ArrowUp', { ctrl: true, meta: true, alt: true, shift: true }), {
        modIsMeta: false,
      }),
    ).toEqual({ type: 'keys', keys: 'Mod+Meta+Alt+Shift+ArrowUp' });
  });

  it('ignores lone modifiers', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'OS', 'CapsLock']) {
      expect(recordKey(key(k, { shift: k === 'Shift' }), { modIsMeta: false })).toEqual({
        type: 'ignore',
      });
    }
  });

  it('ignores dead and unidentified keys', () => {
    expect(recordKey(key('Dead', { alt: true }), { modIsMeta: false })).toEqual({ type: 'ignore' });
    expect(recordKey(key('Unidentified'), { modIsMeta: false })).toEqual({ type: 'ignore' });
  });

  it('cancels on a lone Escape but records Escape with modifiers', () => {
    expect(recordKey(key('Escape'), { modIsMeta: false })).toEqual({ type: 'cancel' });
    expect(recordKey(key('Escape', { ctrl: true, shift: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Mod+Shift+Escape',
    });
  });

  it('names punctuation the way the kernel aliases expect', () => {
    expect(recordKey(key(' ', { ctrl: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Mod+Space',
    });
    expect(recordKey(key(',', { ctrl: true, alt: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Mod+Alt+Comma',
    });
    expect(recordKey(key('Tab', { alt: true }), { modIsMeta: false })).toEqual({
      type: 'keys',
      keys: 'Alt+Tab',
    });
  });

  it('uses the physical key for letters when Alt changes the character', () => {
    expect(recordKey(key('å', { alt: true }, 'KeyA'), { modIsMeta: true })).toEqual({
      type: 'keys',
      keys: 'Alt+A',
    });
    expect(keyToken({ key: '!', code: 'Digit1' })).toBe('1');
  });

  it('produces strings the kernel matcher accepts for the same event', () => {
    const events = [
      key('s', { ctrl: true }, 'KeyS'),
      key('S', { ctrl: true, shift: true }, 'KeyS'),
      key(' ', { ctrl: true }),
      key(',', { ctrl: true, alt: true }),
      key('ArrowLeft', { meta: true }),
      key('F11'),
      key('Escape', { ctrl: true, shift: true }),
    ];
    for (const e of events) {
      const r = recordKey(e, { modIsMeta: false });
      expect(r.type).toBe('keys');
      if (r.type === 'keys') expect(matchesShortcut(e, r.keys, 'ctrl')).toBe(true);
    }
  });
});

describe('canonicalKeys / findConflict', () => {
  it('compares bindings regardless of order and case', () => {
    expect(canonicalKeys('Shift+Mod+K')).toBe(canonicalKeys('mod+shift+k'));
    expect(canonicalKeys('Mod+K')).not.toBe(canonicalKeys('Mod+Shift+K'));
  });

  it('finds another action bound to the same keys', () => {
    const bindings = { 'window.close': 'Mod+W', 'window.quit': 'Mod+Q' };
    expect(findConflict('mod+w', 'window.quit', bindings)).toBe('window.close');
    expect(findConflict('Mod+W', 'window.close', bindings)).toBeNull();
    expect(findConflict('Mod+E', 'window.close', bindings)).toBeNull();
  });
});
