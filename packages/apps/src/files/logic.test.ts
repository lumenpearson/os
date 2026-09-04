import type { DirEntry } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import {
  canDrop,
  canGoBack,
  canGoForward,
  collapseCrumbs,
  createHistory,
  crumbsFor,
  currentPath,
  dropUnder,
  EMPTY_SELECTION,
  goBack,
  goForward,
  gridStep,
  kindLabel,
  moveSelection,
  nameTaken,
  parseDragPaths,
  previewKind,
  pruneSelection,
  pushHistory,
  rankMap,
  selectAll,
  selectClick,
  selectOnly,
  sortEntries,
  statusText,
  validateName,
} from './logic';

function entry(name: string, extra: Partial<DirEntry> = {}): DirEntry {
  return {
    path: `/d/${name}`,
    name,
    kind: 'file',
    size: 0,
    modifiedAt: 0,
    createdAt: 0,
    ...extra,
  };
}

const dir = (name: string, extra: Partial<DirEntry> = {}) =>
  entry(name, { kind: 'directory', ...extra });

describe('sortEntries', () => {
  const items = [
    entry('b.txt', { size: 30, modifiedAt: 3 }),
    dir('zeta', { modifiedAt: 1 }),
    entry('file10.png', { size: 10, modifiedAt: 2 }),
    entry('file2.png', { size: 20, modifiedAt: 5 }),
    dir('alpha', { modifiedAt: 4 }),
  ];

  it('puts folders first in natural name order', () => {
    const names = sortEntries(items, { column: 'name', direction: 'asc' }).map((e) => e.name);
    expect(names).toEqual(['alpha', 'zeta', 'b.txt', 'file2.png', 'file10.png']);
  });

  it('keeps folders first when descending', () => {
    const names = sortEntries(items, { column: 'name', direction: 'desc' }).map((e) => e.name);
    expect(names).toEqual(['zeta', 'alpha', 'file10.png', 'file2.png', 'b.txt']);
  });

  it('sorts by size, date and kind with name as tie-break', () => {
    expect(sortEntries(items, { column: 'size', direction: 'desc' }).map((e) => e.name)).toEqual([
      'alpha',
      'zeta',
      'b.txt',
      'file2.png',
      'file10.png',
    ]);
    expect(sortEntries(items, { column: 'date', direction: 'asc' }).map((e) => e.name)).toEqual([
      'zeta',
      'alpha',
      'file10.png',
      'b.txt',
      'file2.png',
    ]);
    const byKind = sortEntries(items, { column: 'kind', direction: 'asc' }).map((e) => e.name);
    expect(byKind).toEqual(['alpha', 'zeta', 'b.txt', 'file2.png', 'file10.png']);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    sortEntries(items, { column: 'name', direction: 'asc' });
    expect(items).toEqual(copy);
  });

  it('labels kinds', () => {
    expect(kindLabel(dir('x'))).toBe('Folder');
    expect(kindLabel(entry('a.md'))).toBe('Markdown');
    expect(kindLabel(entry('a.xyz'))).toBe('XYZ File');
  });

  it('ranks rows so DataTable reproduces the order in both directions', () => {
    const sorted = sortEntries(items, { column: 'name', direction: 'desc' });
    const rank = rankMap(sorted, 'desc');
    const viaTable = [...sorted].sort(
      (a, b) => ((rank.get(a.path) ?? 0) - (rank.get(b.path) ?? 0)) * -1,
    );
    expect(viaTable.map((e) => e.name)).toEqual(sorted.map((e) => e.name));
  });
});

describe('history', () => {
  it('pushes, goes back and forward, and drops the forward stack on push', () => {
    let h = createHistory('/a');
    expect(canGoBack(h)).toBe(false);
    h = pushHistory(h, '/a/b');
    h = pushHistory(h, '/a/b/c');
    expect(currentPath(h)).toBe('/a/b/c');
    h = goBack(h);
    expect(currentPath(h)).toBe('/a/b');
    expect(canGoForward(h)).toBe(true);
    h = goForward(h);
    expect(currentPath(h)).toBe('/a/b/c');
    h = goBack(goBack(h));
    h = pushHistory(h, '/x');
    expect(h.entries).toEqual(['/a', '/x']);
    expect(canGoForward(h)).toBe(false);
  });

  it('ignores pushing the current path and normalises input', () => {
    const h = createHistory('/a/');
    expect(pushHistory(h, '/a')).toBe(h);
    expect(currentPath(pushHistory(h, '/a/b/../c/'))).toBe('/a/c');
  });

  it('is bounded', () => {
    let h = createHistory('/0');
    for (let i = 1; i < 150; i++) h = pushHistory(h, `/${i}`);
    expect(h.entries.length).toBe(100);
    expect(currentPath(h)).toBe('/149');
  });
});

describe('selection', () => {
  const order = ['/a', '/b', '/c', '/d', '/e'];

  it('plain click selects one and sets the anchor', () => {
    const s = selectClick(EMPTY_SELECTION, order, '/c');
    expect([...s.keys]).toEqual(['/c']);
    expect(s.anchor).toBe('/c');
    expect(s.cursor).toBe('/c');
  });

  it('shift-click selects a range from the anchor in either direction', () => {
    let s = selectClick(EMPTY_SELECTION, order, '/b');
    s = selectClick(s, order, '/d', { shift: true });
    expect([...s.keys]).toEqual(['/b', '/c', '/d']);
    s = selectClick(s, order, '/a', { shift: true });
    expect([...s.keys].sort()).toEqual(['/a', '/b']);
    expect(s.anchor).toBe('/b');
  });

  it('ctrl-click toggles and moves the anchor', () => {
    let s = selectClick(EMPTY_SELECTION, order, '/a');
    s = selectClick(s, order, '/c', { toggle: true });
    expect([...s.keys]).toEqual(['/a', '/c']);
    s = selectClick(s, order, '/a', { toggle: true });
    expect([...s.keys]).toEqual(['/c']);
    expect(s.anchor).toBe('/a');
  });

  it('ignores keys not in the order', () => {
    const s = selectOnly('/a');
    expect(selectClick(s, order, '/zzz')).toBe(s);
  });

  it('moves with arrows and extends with shift', () => {
    let s = moveSelection(EMPTY_SELECTION, order, 1);
    expect([...s.keys]).toEqual(['/a']);
    s = moveSelection(s, order, 1);
    s = moveSelection(s, order, 1);
    expect(s.cursor).toBe('/c');
    s = moveSelection(s, order, -1, true);
    expect([...s.keys].sort()).toEqual(['/b', '/c']);
    expect(s.anchor).toBe('/c');
    s = moveSelection(s, order, 'end', true);
    expect([...s.keys].sort()).toEqual(['/c', '/d', '/e']);
    s = moveSelection(s, order, 'home');
    expect([...s.keys]).toEqual(['/a']);
    expect(moveSelection(EMPTY_SELECTION, order, -1).cursor).toBe('/e');
    expect(moveSelection(EMPTY_SELECTION, [], 1)).toBe(EMPTY_SELECTION);
  });

  it('clamps at the ends', () => {
    const s = moveSelection(selectOnly('/e'), order, 5);
    expect(s.cursor).toBe('/e');
  });

  it('selects all and prunes missing keys', () => {
    const all = selectAll(order);
    expect(all.keys.size).toBe(5);
    const pruned = pruneSelection(all, new Set(['/a', '/e']));
    expect([...pruned.keys]).toEqual(['/a', '/e']);
    expect(pruned.cursor).toBe('/e');
    expect(pruneSelection(pruned, new Set(['/a', '/e']))).toBe(pruned);
  });

  it('drops keys under a removed path', () => {
    const s = selectAll(['/x/a', '/x/a/b', '/y']);
    const next = dropUnder(s, '/x/a');
    expect([...next.keys]).toEqual(['/y']);
    expect(dropUnder(next, '/nothing')).toBe(next);
  });
});

describe('gridStep', () => {
  it('moves within rows and columns and clamps', () => {
    expect(gridStep(0, 10, 4, 'ArrowRight')).toBe(1);
    expect(gridStep(3, 10, 4, 'ArrowRight')).toBe(4);
    expect(gridStep(9, 10, 4, 'ArrowRight')).toBe(9);
    expect(gridStep(5, 10, 4, 'ArrowUp')).toBe(1);
    expect(gridStep(1, 10, 4, 'ArrowUp')).toBe(1);
    expect(gridStep(5, 10, 4, 'ArrowDown')).toBe(9);
    expect(gridStep(8, 10, 4, 'ArrowDown')).toBe(8);
    expect(gridStep(7, 10, 4, 'Home')).toBe(0);
    expect(gridStep(7, 10, 4, 'End')).toBe(9);
    expect(gridStep(-1, 10, 4, 'ArrowDown')).toBe(0);
    expect(gridStep(-1, 10, 4, 'ArrowUp')).toBe(9);
    expect(gridStep(2, 0, 4, 'ArrowUp')).toBe(-1);
  });
});

describe('canDrop', () => {
  it('refuses a folder into itself or a descendant', () => {
    expect(canDrop(['/a/b'], '/a/b')).toBe(false);
    expect(canDrop(['/a/b'], '/a/b/c')).toBe(false);
    expect(canDrop(['/a/b', '/z'], '/a/b/c')).toBe(false);
  });

  it('refuses moving into the folder the items already live in', () => {
    expect(canDrop(['/a/b', '/a/c'], '/a')).toBe(false);
    expect(canDrop(['/a/b', '/a/c'], '/a', 'copy')).toBe(true);
    expect(canDrop(['/a/b', '/q/c'], '/a')).toBe(true);
  });

  it('accepts a normal move', () => {
    expect(canDrop(['/a/b'], '/a/x')).toBe(true);
    expect(canDrop([], '/a')).toBe(false);
  });
});

describe('parseDragPaths', () => {
  it('accepts only absolute string paths', () => {
    expect(parseDragPaths('["/a","b",3,null]')).toEqual(['/a']);
    expect(parseDragPaths('{"x":1}')).toEqual([]);
    expect(parseDragPaths('not json')).toEqual([]);
    expect(parseDragPaths(null)).toEqual([]);
  });
});

describe('names', () => {
  const siblings = ['Notes.md', 'photo.png', 'Docs'];

  it('detects collisions case-insensitively, excluding self', () => {
    expect(nameTaken('notes.md', siblings)).toBe(true);
    expect(nameTaken('notes.md', siblings, 'Notes.md')).toBe(false);
    expect(nameTaken('new.md', siblings)).toBe(false);
  });

  it('validates', () => {
    expect(validateName('new.md', siblings)).toBeNull();
    expect(validateName('', siblings)).toMatch(/name/i);
    expect(validateName('a/b', siblings)).toMatch(/cannot contain/);
    expect(validateName('docs', siblings)).toMatch(/already/);
    expect(validateName(' x', siblings)).toMatch(/space/);
    expect(validateName('NOTES.md', siblings, 'Notes.md')).toBeNull();
  });
});

describe('crumbs', () => {
  it('starts at Home inside the home directory', () => {
    expect(crumbsFor('/Users/ann/Documents/Work', '/Users/ann')).toEqual([
      { label: 'Home', path: '/Users/ann' },
      { label: 'Documents', path: '/Users/ann/Documents' },
      { label: 'Work', path: '/Users/ann/Documents/Work' },
    ]);
    expect(crumbsFor('/Users/ann', '/Users/ann')).toEqual([{ label: 'Home', path: '/Users/ann' }]);
  });

  it('starts at This Computer elsewhere', () => {
    expect(crumbsFor('/Applications', '/Users/ann')).toEqual([
      { label: 'This Computer', path: '/' },
      { label: 'Applications', path: '/Applications' },
    ]);
    expect(crumbsFor('/', '/Users/ann')).toEqual([{ label: 'This Computer', path: '/' }]);
    expect(crumbsFor('/Users/annie', '/Users/ann')[0]?.label).toBe('This Computer');
  });

  it('collapses long trails', () => {
    const crumbs = crumbsFor('/a/b/c/d/e/f', '/');
    const short = collapseCrumbs(crumbs, 4);
    expect(short.map((c) => c?.label ?? '…')).toEqual(['This Computer', '…', 'e', 'f']);
    expect(collapseCrumbs(crumbs.slice(0, 3), 4)).toHaveLength(3);
  });
});

describe('misc', () => {
  it('picks a preview kind', () => {
    expect(previewKind(entry('a.png'))).toBe('image');
    expect(previewKind(entry('a.txt', { size: 100 }))).toBe('text');
    expect(previewKind(entry('a.txt', { size: 1 << 20 }))).toBe('none');
    expect(previewKind(entry('a.zip'))).toBe('none');
    expect(previewKind(dir('x'))).toBe('none');
  });

  it('formats the status line', () => {
    expect(statusText(1, 0, null)).toBe('1 item');
    expect(statusText(3, 2, { used: 1024, quota: 3072 })).toBe('3 items · 2 selected · 2.0 KB free');
    expect(statusText(0, 0, { used: 2048, quota: null })).toBe('0 items · 2.0 KB used');
  });
});
