import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, normalizePrefs } from './prefs';

describe('normalizePrefs', () => {
  it('keeps a well-formed file', () => {
    expect(normalizePrefs({ filmstrip: true })).toEqual({ filmstrip: true });
  });

  it('falls back to the defaults for anything else', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('filmstrip')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs([])).toEqual(DEFAULT_PREFS);
  });

  it('replaces a value of the wrong type rather than passing it on', () => {
    expect(normalizePrefs({ filmstrip: 'yes' })).toEqual(DEFAULT_PREFS);
  });

  it('drops keys it does not know', () => {
    expect(normalizePrefs({ filmstrip: true, zoom: 3 })).toEqual({ filmstrip: true });
  });
});
