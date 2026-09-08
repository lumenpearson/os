import { describe, expect, it } from 'vitest';
import { formatValue, parseValue, readPath, settingsPaths } from './settingsPath';

const settings = {
  appearance: { theme: 'auto', blur: 14, reduceMotion: false },
  taskbar: { items: ['start', 'search'], size: 44 },
  updates: { lastChecked: null },
};

describe('settingsPaths', () => {
  it('lists every leaf, and no sections', () => {
    expect(settingsPaths(settings)).toEqual([
      'appearance.theme',
      'appearance.blur',
      'appearance.reduceMotion',
      'taskbar.items',
      'taskbar.size',
      'updates.lastChecked',
    ]);
  });
});

describe('readPath', () => {
  it('reads a leaf of any type', () => {
    expect(readPath(settings, 'appearance.blur')).toEqual({ ok: true, value: 14 });
    expect(readPath(settings, 'taskbar.items')).toEqual({
      ok: true,
      value: ['start', 'search'],
    });
    expect(readPath(settings, 'updates.lastChecked')).toEqual({ ok: true, value: null });
  });

  it('refuses a section, and says so rather than printing an object', () => {
    expect(readPath(settings, 'appearance')).toEqual({
      ok: false,
      error: '"appearance" is a section, not a setting',
    });
  });

  it('names the path it could not find', () => {
    expect(readPath(settings, 'appearance.nonsense')).toEqual({
      ok: false,
      error: 'no setting named "appearance.nonsense"',
    });
    expect(readPath(settings, '')).toEqual({ ok: false, error: 'no setting named ""' });
  });
});

describe('parseValue', () => {
  it('keeps the type the setting already has', () => {
    expect(parseValue(14, '20')).toEqual({ ok: true, value: 20 });
    expect(parseValue(false, 'on')).toEqual({ ok: true, value: true });
    expect(parseValue('auto', 'dark')).toEqual({ ok: true, value: 'dark' });
    expect(parseValue(['a'], 'x, y ,z')).toEqual({ ok: true, value: ['x', 'y', 'z'] });
  });

  it('refuses a value of the wrong type instead of writing nonsense', () => {
    expect(parseValue(14, 'large')).toEqual({
      ok: false,
      error: 'expected a number, got "large"',
    });
    expect(parseValue(true, 'maybe')).toEqual({
      ok: false,
      error: 'expected true or false, got "maybe"',
    });
  });

  it('lets a null leaf be cleared or filled', () => {
    expect(parseValue(null, 'null')).toEqual({ ok: true, value: null });
    expect(parseValue(null, 'something')).toEqual({ ok: true, value: 'something' });
  });
});

describe('formatValue', () => {
  it('prints what a terminal would print', () => {
    expect(formatValue(true)).toBe('true');
    expect(formatValue(null)).toBe('null');
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue(44)).toBe('44');
  });
});
