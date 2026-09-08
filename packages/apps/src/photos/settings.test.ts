import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  normalizeData,
  normalizeFavourites,
  normalizePrefs,
  toggleFavourite,
  withoutFavourites,
} from './settings';

describe('normalizePrefs', () => {
  it('takes the values it recognises', () => {
    expect(
      normalizePrefs({
        sort: 'size',
        order: 'ascending',
        size: 'large',
        info: true,
        sidebar: false,
      }),
    ).toEqual({ sort: 'size', order: 'ascending', size: 'large', info: true, sidebar: false });
  });

  it('replaces a field it does not recognise, and keeps the rest', () => {
    expect(normalizePrefs({ sort: 'colour', size: 'small' })).toEqual({
      ...DEFAULT_PREFS,
      size: 'small',
    });
  });

  it('falls back entirely for a document of the wrong shape', () => {
    for (const value of [null, undefined, 7, 'prefs', [], true]) {
      expect(normalizePrefs(value)).toEqual(DEFAULT_PREFS);
    }
  });
});

describe('normalizeFavourites', () => {
  it('keeps absolute paths in the order they were marked', () => {
    expect(normalizeFavourites(['/Users/ada/Pictures/b.png', '/Users/ada/Pictures/a.png'])).toEqual(
      ['/Users/ada/Pictures/b.png', '/Users/ada/Pictures/a.png'],
    );
  });

  it('drops repeats, blanks, relative paths and anything that is not a string', () => {
    expect(
      normalizeFavourites(['/a.png', '/a.png', '', '   ', 'a.png', 4, null, { path: '/b.png' }]),
    ).toEqual(['/a.png']);
  });

  /** An unreadable file means no favourites — never a crash, never a guess. */
  it('answers with no favourites for anything that is not a list', () => {
    for (const value of [null, undefined, 0, 'nope', { paths: ['/a.png'] }, Number.NaN]) {
      expect(normalizeFavourites(value)).toEqual([]);
    }
  });
});

describe('normalizeData', () => {
  it('reads a whole document', () => {
    expect(normalizeData({ version: 1, prefs: { sort: 'name' }, favourites: ['/a.png'] })).toEqual({
      version: 1,
      prefs: { ...DEFAULT_PREFS, sort: 'name' },
      favourites: ['/a.png'],
    });
  });

  it('survives a document that is half-written or of another version', () => {
    expect(normalizeData('{"favourites"')).toEqual({
      version: 1,
      prefs: DEFAULT_PREFS,
      favourites: [],
    });
    expect(normalizeData({ version: -3 }).version).toBe(1);
  });
});

describe('toggleFavourite', () => {
  it('marks a picture, putting the newest mark last', () => {
    expect(toggleFavourite(['/a.png'], '/b.png')).toEqual(['/a.png', '/b.png']);
  });

  it('unmarks one that was already marked', () => {
    expect(toggleFavourite(['/a.png', '/b.png'], '/a.png')).toEqual(['/b.png']);
  });

  it('leaves the list it was given alone', () => {
    const before = ['/a.png'];
    toggleFavourite(before, '/b.png');
    expect(before).toEqual(['/a.png']);
  });

  it('returns to where it started after two toggles', () => {
    expect(toggleFavourite(toggleFavourite(['/a.png'], '/b.png'), '/b.png')).toEqual(['/a.png']);
  });
});

describe('withoutFavourites', () => {
  it('forgets pictures that are gone and keeps the rest', () => {
    expect(withoutFavourites(['/a.png', '/b.png', '/c.png'], ['/b.png', '/missing.png'])).toEqual([
      '/a.png',
      '/c.png',
    ]);
  });
});
