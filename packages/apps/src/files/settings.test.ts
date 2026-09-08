import { describe, expect, it } from 'vitest';
import { NO_FILTER } from './filters';
import { DEFAULT_PREFS, normalizePrefs, prefsPath } from './settings';

describe('prefsPath', () => {
  it('sits with the other apps under the home directory', () => {
    expect(prefsPath('/home/ada')).toBe('/home/ada/.config/files.json');
  });
});

describe('normalizePrefs', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('list')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(undefined).filter).toEqual(NO_FILTER);
  });

  it('takes the view from Settings until the window has saved its own', () => {
    expect(normalizePrefs({}, 'columns').view).toBe('columns');
    expect(normalizePrefs({ view: 'cards' }, 'columns').view).toBe('cards');
    expect(normalizePrefs({ view: 'gallery' }, 'grid').view).toBe('grid');
  });

  it('keeps every field it recognises and drops the rest', () => {
    const prefs = normalizePrefs({
      view: 'cards',
      cardAxis: 'vertical',
      iconSize: 'large',
      sidebar: false,
      indexRail: true,
      toolbar: { search: false, sort: 'yes' },
      sort: { column: 'size', direction: 'desc' },
      filter: { kind: 'images', size: 'nope', modified: 'week', pattern: '*.png' },
    });
    expect(prefs).toEqual({
      view: 'cards',
      cardAxis: 'vertical',
      iconSize: 'large',
      sidebar: false,
      indexRail: true,
      toolbar: {
        navigation: true,
        view: true,
        sort: true,
        filter: true,
        newFolder: true,
        sidebar: true,
        search: false,
      },
      sort: { column: 'size', direction: 'desc' },
      filter: { kind: 'images', size: 'any', modified: 'week', pattern: '*.png' },
    });
  });

  it('holds a hand-edited file to what the app can render', () => {
    const prefs = normalizePrefs({
      cardAxis: 'diagonal',
      iconSize: 42,
      sort: { column: 'colour', direction: 'sideways' },
      filter: { pattern: 'x'.repeat(500) },
    });
    expect(prefs.cardAxis).toBe('horizontal');
    expect(prefs.iconSize).toBe('medium');
    expect(prefs.sort).toEqual({ column: 'name', direction: 'asc' });
    expect(prefs.filter.pattern).toHaveLength(200);
  });
});
