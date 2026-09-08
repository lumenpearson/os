import type { DirEntry } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  comparePlan,
  dateFloor,
  filterSummary,
  globToRegExp,
  isFiltering,
  kindLabel,
  matchesFilter,
  matchesKind,
  matchesPattern,
  matchesSize,
  NO_FILTER,
  sortPlanFor,
  sortWithPlan,
} from './filters';
import type { SortState } from './logic';

const MB = 1024 * 1024;
/** 2026-09-05T14:30:00Z, a fixed "now" so date buckets are not clock-dependent. */
const NOW = Date.UTC(2026, 8, 5, 14, 30);
const DAY = 24 * 60 * 60 * 1000;

function entry(name: string, extra: Partial<DirEntry> = {}): DirEntry {
  return {
    path: `/d/${name}`,
    name,
    kind: 'file',
    size: 0,
    modifiedAt: NOW,
    createdAt: 0,
    ...extra,
  };
}

const dir = (name: string, extra: Partial<DirEntry> = {}) =>
  entry(name, { kind: 'directory', ...extra });

describe('kindLabel', () => {
  it('names folders and file types', () => {
    expect(kindLabel(dir('x'))).toBe('Folder');
    expect(kindLabel(entry('a.md'))).toBe('Markdown');
    expect(kindLabel(entry('a.xyz'))).toBe('XYZ File');
  });
});

describe('matchesKind', () => {
  it('sorts files into buckets by category', () => {
    expect(matchesKind(entry('shot.png'), 'images')).toBe(true);
    expect(matchesKind(entry('shot.png'), 'documents')).toBe(false);
    expect(matchesKind(entry('notes.md'), 'documents')).toBe(true);
    expect(matchesKind(entry('main.ts'), 'code')).toBe(true);
    expect(matchesKind(entry('songs.zip'), 'archives')).toBe(true);
  });

  it('keeps folders out of every file bucket and in their own', () => {
    expect(matchesKind(dir('Work'), 'folders')).toBe(true);
    expect(matchesKind(dir('Work'), 'documents')).toBe(false);
    expect(matchesKind(entry('a.txt'), 'folders')).toBe(false);
  });

  it('lets everything through when no kind is chosen', () => {
    expect(matchesKind(dir('Work'), 'any')).toBe(true);
    expect(matchesKind(entry('a.bin'), 'any')).toBe(true);
  });
});

describe('matchesSize', () => {
  it('splits at 1 MB and 100 MB', () => {
    expect(matchesSize(entry('a', { size: 900 * 1024 }), 'small')).toBe(true);
    expect(matchesSize(entry('a', { size: 2 * MB }), 'small')).toBe(false);
    expect(matchesSize(entry('a', { size: 2 * MB }), 'medium')).toBe(true);
    expect(matchesSize(entry('a', { size: 400 * MB }), 'medium')).toBe(false);
    expect(matchesSize(entry('a', { size: 400 * MB }), 'large')).toBe(true);
  });

  it('drops folders, which have no size to compare', () => {
    expect(matchesSize(dir('Work'), 'small')).toBe(false);
    expect(matchesSize(dir('Work'), 'any')).toBe(true);
  });
});

describe('dateFloor', () => {
  it('starts "today" at local midnight and the rest a span back', () => {
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    expect(dateFloor('today', NOW)).toBe(midnight.getTime());
    expect(dateFloor('week', NOW)).toBe(NOW - 7 * DAY);
    expect(dateFloor('month', NOW)).toBe(NOW - 30 * DAY);
    expect(dateFloor('any', NOW)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('matchesPattern', () => {
  it('matches a plain word anywhere in the name, ignoring case', () => {
    expect(matchesPattern('Report 2026.pdf', 'report')).toBe(true);
    expect(matchesPattern('Report 2026.pdf', 'invoice')).toBe(false);
    expect(matchesPattern('Report 2026.pdf', '')).toBe(true);
  });

  it('matches the whole name once the pattern has a wildcard', () => {
    expect(matchesPattern('notes.md', '*.md')).toBe(true);
    expect(matchesPattern('notes.md.bak', '*.md')).toBe(false);
    expect(matchesPattern('a1.txt', 'a?.txt')).toBe(true);
    expect(matchesPattern('a12.txt', 'a?.txt')).toBe(false);
  });

  it('treats regular-expression characters as literal text', () => {
    expect(globToRegExp('a.b*').source).toBe('^a\\.b.*$');
    expect(matchesPattern('axb.txt', 'a.b*')).toBe(false);
    expect(matchesPattern('a.b.txt', 'a.b*')).toBe(true);
  });
});

describe('applyFilter', () => {
  const items = [
    dir('Work', { modifiedAt: NOW - 90 * DAY }),
    entry('shot.png', { size: 4 * MB, modifiedAt: NOW - 2 * DAY }),
    entry('notes.md', { size: 400, modifiedAt: NOW - 40 * DAY }),
    entry('report.pdf', { size: 300 * MB, modifiedAt: NOW }),
  ];

  it('returns a copy and keeps the order when nothing is filtered', () => {
    const out = applyFilter(items, NO_FILTER, NOW);
    expect(out).toEqual(items);
    expect(out).not.toBe(items);
  });

  it('combines kind, size, date and pattern', () => {
    expect(applyFilter(items, { ...NO_FILTER, kind: 'images' }, NOW).map((e) => e.name)).toEqual([
      'shot.png',
    ]);
    expect(applyFilter(items, { ...NO_FILTER, size: 'large' }, NOW).map((e) => e.name)).toEqual([
      'report.pdf',
    ]);
    expect(applyFilter(items, { ...NO_FILTER, modified: 'week' }, NOW).map((e) => e.name)).toEqual([
      'shot.png',
      'report.pdf',
    ]);
    expect(applyFilter(items, { ...NO_FILTER, pattern: '*.md' }, NOW).map((e) => e.name)).toEqual([
      'notes.md',
    ]);
    const both = { ...NO_FILTER, kind: 'documents', modified: 'week' } as const;
    expect(applyFilter(items, both, NOW).map((e) => e.name)).toEqual(['report.pdf']);
  });

  it('reads one entry the same way as the whole list', () => {
    const filter = { ...NO_FILTER, kind: 'images' } as const;
    expect(matchesFilter(items[1] as DirEntry, filter, NOW)).toBe(true);
    expect(matchesFilter(items[2] as DirEntry, filter, NOW)).toBe(false);
  });
});

describe('isFiltering and filterSummary', () => {
  it('is quiet until something is set', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(filterSummary(NO_FILTER)).toBe('');
    expect(isFiltering({ ...NO_FILTER, pattern: '   ' })).toBe(false);
  });

  it('names every active filter in one line', () => {
    const filter = { ...NO_FILTER, kind: 'images', size: 'small', pattern: '*.png' } as const;
    expect(isFiltering(filter)).toBe(true);
    expect(filterSummary(filter)).toBe('Images · Under 1 MB · Name *.png');
  });
});

describe('sortPlanFor', () => {
  it('falls through to the name after the chosen column', () => {
    expect(sortPlanFor({ column: 'size', direction: 'desc' })).toEqual({
      foldersFirst: true,
      rules: [
        { key: 'size', direction: 'desc' },
        { key: 'name', direction: 'asc' },
      ],
    });
  });

  it('needs no second level when the column is already the name', () => {
    expect(sortPlanFor({ column: 'name', direction: 'asc' }, false)).toEqual({
      foldersFirst: false,
      rules: [{ key: 'name', direction: 'asc' }],
    });
  });
});

describe('sortWithPlan', () => {
  const items = [
    entry('b.txt', { size: 30, modifiedAt: 3 }),
    dir('zeta', { modifiedAt: 1 }),
    entry('file10.png', { size: 10, modifiedAt: 2 }),
    entry('file2.png', { size: 20, modifiedAt: 5 }),
    dir('alpha', { modifiedAt: 4 }),
  ];
  const names = (sort: SortState, foldersFirst = true) =>
    sortWithPlan(items, sortPlanFor(sort, foldersFirst)).map((e) => e.name);

  it('puts folders first, then the column, then the name', () => {
    expect(names({ column: 'name', direction: 'asc' })).toEqual([
      'alpha',
      'zeta',
      'b.txt',
      'file2.png',
      'file10.png',
    ]);
  });

  it('mixes folders in with the files when folders-first is off', () => {
    expect(names({ column: 'size', direction: 'desc' }, false)).toEqual([
      'b.txt',
      'file2.png',
      'file10.png',
      'alpha',
      'zeta',
    ]);
  });

  it('breaks a tie on the second level, ascending, whichever way the first runs', () => {
    const tied = [entry('b.txt', { size: 5 }), entry('a.txt', { size: 5 })];
    const plan = sortPlanFor({ column: 'size', direction: 'desc' });
    expect(sortWithPlan(tied, plan).map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    sortWithPlan(items, sortPlanFor({ column: 'date', direction: 'asc' }));
    expect(items).toEqual(copy);
  });

  it('compares two entries the same way the sort orders them', () => {
    const compare = comparePlan(sortPlanFor({ column: 'name', direction: 'asc' }));
    expect(compare(dir('zeta'), entry('a.txt'))).toBeLessThan(0);
    expect(compare(entry('a.txt'), entry('b.txt'))).toBeLessThan(0);
    expect(compare(entry('a.txt'), entry('a.txt'))).toBe(0);
  });
});
