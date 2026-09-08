import type { AppDefinition } from '@lumen/kernel';
import { join, MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  albumsOf,
  canEditWith,
  comparePhotos,
  countLabel,
  cursorAfterChange,
  formatDimensions,
  type Photo,
  parseScopeId,
  photoFrom,
  positionLabel,
  scanPictures,
  scopeId,
  selectPhotos,
  sortPhotos,
  stepIndex,
} from './library';

const ROOT = '/Users/ada/Pictures';

function photo(partial: Partial<Photo> & { name: string }): Photo {
  const album = partial.album ?? '';
  return {
    path: partial.path ?? join(ROOT, album, partial.name),
    name: partial.name,
    album,
    size: partial.size ?? 1000,
    modifiedAt: partial.modifiedAt ?? 0,
  };
}

describe('scanPictures', () => {
  let vfs: Vfs;

  beforeEach(async () => {
    vfs = new Vfs(new MemoryAdapter());
    await vfs.writeFile(join(ROOT, 'shore.png'), new Uint8Array([1]), { recursive: true });
    await vfs.writeFile(join(ROOT, 'notes.txt'), new Uint8Array([2]));
    await vfs.writeFile(join(ROOT, 'Trips', 'oslo.jpg'), new Uint8Array([3]), { recursive: true });
    await vfs.writeFile(join(ROOT, 'Trips', '2024', 'fjord.webp'), new Uint8Array([4]), {
      recursive: true,
    });
    await vfs.writeFile(join(ROOT, '.cache', 'thumb.png'), new Uint8Array([5]), {
      recursive: true,
    });
    await vfs.writeFile(join(ROOT, '.hidden.png'), new Uint8Array([6]));
  });

  it('finds pictures at every depth and nothing that is not a picture', async () => {
    const photos = await scanPictures(vfs, ROOT);
    expect(photos.map((p) => p.name).sort()).toEqual(['fjord.webp', 'oslo.jpg', 'shore.png']);
  });

  it('names the folder each picture is in, relative to Pictures', async () => {
    const photos = await scanPictures(vfs, ROOT);
    const albums = new Map(photos.map((p) => [p.name, p.album]));
    expect(albums.get('shore.png')).toBe('');
    expect(albums.get('oslo.jpg')).toBe('Trips');
    expect(albums.get('fjord.webp')).toBe('Trips/2024');
  });

  it('skips dot-folders and dot-files', async () => {
    const photos = await scanPictures(vfs, ROOT);
    expect(photos.some((p) => p.path.includes('.cache'))).toBe(false);
    expect(photos.some((p) => p.name === '.hidden.png')).toBe(false);
  });

  it('rejects a Pictures folder that is not there', async () => {
    await expect(scanPictures(vfs, '/Users/ada/Nothing')).rejects.toThrow();
  });

  it('reads the size and modified time the file system reports', async () => {
    const photos = await scanPictures(vfs, ROOT);
    const shore = photos.find((p) => p.name === 'shore.png');
    expect(shore?.size).toBe(1);
    expect(shore?.modifiedAt).toBeGreaterThan(0);
  });
});

describe('photoFrom', () => {
  it('gives a picture in Pictures itself the empty album', () => {
    const entry = {
      path: join(ROOT, 'a.png'),
      name: 'a.png',
      kind: 'file' as const,
      size: 4,
      modifiedAt: 10,
      createdAt: 10,
    };
    expect(photoFrom(entry, ROOT).album).toBe('');
  });
});

describe('albumsOf', () => {
  it('counts the pictures in each folder and orders them by path', () => {
    const albums = albumsOf([
      photo({ name: 'a.png', album: 'Trips' }),
      photo({ name: 'b.png' }),
      photo({ name: 'c.png', album: 'Trips/2024' }),
      photo({ name: 'd.png', album: 'Trips' }),
    ]);
    expect(albums).toEqual([
      { id: '', label: 'Pictures', count: 1 },
      { id: 'Trips', label: 'Trips', count: 2 },
      { id: 'Trips/2024', label: 'Trips/2024', count: 1 },
    ]);
  });

  it('has no albums when there are no pictures', () => {
    expect(albumsOf([])).toEqual([]);
  });
});

describe('scope ids', () => {
  it('round-trips every scope', () => {
    const scopes = [
      { kind: 'all' as const },
      { kind: 'favourites' as const },
      { kind: 'album' as const, album: '' },
      { kind: 'album' as const, album: 'Trips/2024' },
    ];
    for (const scope of scopes) expect(parseScopeId(scopeId(scope))).toEqual(scope);
  });

  it('falls back to everything for an id it does not know', () => {
    expect(parseScopeId('nonsense')).toEqual({ kind: 'all' });
  });
});

describe('selectPhotos', () => {
  const library = [
    photo({ name: 'beach.png', album: 'Trips', size: 300, modifiedAt: 30 }),
    photo({ name: 'Anchor.jpg', size: 100, modifiedAt: 10 }),
    photo({ name: 'cliff.png', album: 'Trips', size: 200, modifiedAt: 20 }),
  ];
  const base = {
    scope: { kind: 'all' as const },
    query: '',
    favourites: new Set<string>(),
    sort: 'name' as const,
    order: 'ascending' as const,
  };

  it('sorts by name without regard to case', () => {
    expect(selectPhotos(library, base).map((p) => p.name)).toEqual([
      'Anchor.jpg',
      'beach.png',
      'cliff.png',
    ]);
  });

  it('sorts by date and by size, newest and largest first when descending', () => {
    const byDate = selectPhotos(library, { ...base, sort: 'date', order: 'descending' });
    expect(byDate.map((p) => p.name)).toEqual(['beach.png', 'cliff.png', 'Anchor.jpg']);
    const bySize = selectPhotos(library, { ...base, sort: 'size', order: 'ascending' });
    expect(bySize.map((p) => p.size)).toEqual([100, 200, 300]);
  });

  it('keeps only the chosen album', () => {
    const trips = selectPhotos(library, { ...base, scope: { kind: 'album', album: 'Trips' } });
    expect(trips.map((p) => p.name)).toEqual(['beach.png', 'cliff.png']);
    const root = selectPhotos(library, { ...base, scope: { kind: 'album', album: '' } });
    expect(root.map((p) => p.name)).toEqual(['Anchor.jpg']);
  });

  it('keeps only favourites when that is the scope', () => {
    const favourites = new Set([library[2]?.path ?? '']);
    const kept = selectPhotos(library, { ...base, scope: { kind: 'favourites' }, favourites });
    expect(kept.map((p) => p.name)).toEqual(['cliff.png']);
  });

  it('searches file names without regard to case or surrounding spaces', () => {
    expect(selectPhotos(library, { ...base, query: '  CLIF ' }).map((p) => p.name)).toEqual([
      'cliff.png',
    ]);
    expect(selectPhotos(library, { ...base, query: 'zzz' })).toEqual([]);
    expect(selectPhotos(library, { ...base, query: '   ' })).toHaveLength(3);
  });
});

describe('sortPhotos', () => {
  const library: Photo[] = [
    photo({ name: 'a.png', size: 10, modifiedAt: 5 }),
    photo({ name: 'b.png', size: 10, modifiedAt: 5 }),
    photo({ name: 'c.png', size: 10, modifiedAt: 5 }),
    photo({ name: 'd.png', size: 3, modifiedAt: 9 }),
  ];

  it('does not modify the list it was given', () => {
    const input = [...library];
    sortPhotos(input, 'size', 'descending');
    expect(input).toEqual(library);
  });

  /**
   * The property that catches a comparator which only looks at the sort key:
   * with four pictures sharing a size, such a comparator leaves the result at
   * the mercy of the input order, and the grid reshuffles on every refresh.
   */
  it('gives the same order whatever order it is handed', () => {
    const shuffles = [
      [3, 1, 0, 2],
      [2, 3, 1, 0],
      [1, 0, 3, 2],
    ];
    for (const keys of ['name', 'date', 'size'] as const) {
      const expected = sortPhotos(library, keys, 'ascending').map((p) => p.path);
      for (const order of shuffles) {
        const shuffled = order.map((i) => library[i] as Photo);
        expect(sortPhotos(shuffled, keys, 'ascending').map((p) => p.path)).toEqual(expected);
      }
    }
  });

  it('is a permutation: nothing is lost and nothing is invented', () => {
    const sorted = sortPhotos(library, 'date', 'descending');
    expect(sorted).toHaveLength(library.length);
    expect(new Set(sorted.map((p) => p.path))).toEqual(new Set(library.map((p) => p.path)));
  });

  it('orders every neighbouring pair the way the comparator says', () => {
    for (const key of ['name', 'date', 'size'] as const) {
      for (const order of ['ascending', 'descending'] as const) {
        const sorted = sortPhotos(library, key, order);
        for (let i = 1; i < sorted.length; i++) {
          const before = sorted[i - 1] as Photo;
          const after = sorted[i] as Photo;
          expect(comparePhotos(before, after, key, order)).toBeLessThan(0);
        }
      }
    }
  });
});

describe('stepIndex', () => {
  it('does not wrap at either end', () => {
    expect(stepIndex(0, 3, -1)).toBeNull();
    expect(stepIndex(2, 3, 1)).toBeNull();
    expect(stepIndex(1, 3, 1)).toBe(2);
  });

  it('starts at an end when nothing is selected', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
  });

  it('has nowhere to go in an empty list', () => {
    expect(stepIndex(-1, 0, 1)).toBeNull();
  });
});

describe('cursorAfterChange', () => {
  const next = [photo({ name: 'a.png' }), photo({ name: 'b.png' })];

  it('keeps the same picture when it is still there', () => {
    expect(cursorAfterChange(next[1]?.path ?? null, 1, next)).toBe(next[1]?.path);
  });

  it('takes the picture that filled the gap', () => {
    expect(cursorAfterChange('/gone.png', 0, next)).toBe(next[0]?.path);
  });

  it('clamps to the last picture when the end was deleted', () => {
    expect(cursorAfterChange('/gone.png', 7, next)).toBe(next[1]?.path);
  });

  it('selects nothing when nothing is left', () => {
    expect(cursorAfterChange('/gone.png', 0, [])).toBeNull();
  });
});

describe('canEditWith', () => {
  const paint = {
    id: 'lumen.paint',
    name: 'Paint',
    description: 'Draw',
    category: 'media',
    icon: () => null,
    component: () => null,
    window: { width: 100, height: 100 },
    fileAssociations: [
      { extensions: ['.png', '.jpg'], role: 'editor' as const, priority: 1 },
      { extensions: ['.svg'], role: 'viewer' as const },
    ],
  } as unknown as AppDefinition;

  it('asks the other app what it edits rather than keeping a list here', () => {
    expect(canEditWith(paint, '/Users/ada/Pictures/a.png')).toBe(true);
    expect(canEditWith(paint, '/Users/ada/Pictures/a.PNG')).toBe(true);
  });

  it('says no for a format that app only views, or does not claim at all', () => {
    expect(canEditWith(paint, '/a.svg')).toBe(false);
    expect(canEditWith(paint, '/a.avif')).toBe(false);
  });

  it('says no when the app is not installed', () => {
    expect(canEditWith(undefined, '/a.png')).toBe(false);
  });
});

describe('labels', () => {
  it('writes dimensions only when both are real', () => {
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
    expect(formatDimensions(0, 1080)).toBe('—');
    expect(formatDimensions(-4, -4)).toBe('—');
  });

  it('counts in the singular and the plural', () => {
    expect(countLabel(0)).toBe('0 pictures');
    expect(countLabel(1)).toBe('1 picture');
    expect(countLabel(12)).toBe('12 pictures');
  });

  it('writes a position only when there is one', () => {
    expect(positionLabel(0, 3)).toBe('1 of 3');
    expect(positionLabel(-1, 3)).toBe('');
    expect(positionLabel(0, 0)).toBe('');
  });
});
