import { describe, expect, it } from 'vitest';
import {
  allFiles,
  buildTree,
  compareNodes,
  DEFAULT_SORT,
  EXPAND_LIMIT,
  folderIds,
  initialExpanded,
  nameComponents,
  nodeIndex,
  type SortState,
  selectedEntries,
  visibleRows,
} from './tree';
import type { ZipEntry } from './zip';

let sequence = 0;
const nextCrc = () => {
  sequence += 1;
  return sequence;
};

const file = (name: string, size = 100, packed = 50, modifiedAt = 1000): ZipEntry => ({
  name,
  isDirectory: false,
  method: 8,
  crc: nextCrc(),
  compressedSize: packed,
  uncompressedSize: size,
  modifiedAt,
  encrypted: false,
  comment: '',
  headerOffset: 0,
  dataStart: 0,
  dataEnd: 0,
});

const dir = (name: string): ZipEntry => ({ ...file(name, 0, 0, 0), isDirectory: true });

const sortBy = (column: SortState['column'], direction: SortState['direction']): SortState => ({
  column,
  direction,
});

const labels = (tree: ReturnType<typeof buildTree>, expanded: string[], sort = DEFAULT_SORT) =>
  visibleRows(tree, { expanded: new Set(expanded), sort }).map(
    (row) => `${'  '.repeat(row.depth)}${row.label}`,
  );

describe('nameComponents', () => {
  it('splits a path and drops the empty pieces', () => {
    expect(nameComponents('a/b/c.txt')).toEqual(['a', 'b', 'c.txt']);
    expect(nameComponents('docs/')).toEqual(['docs']);
    expect(nameComponents('//a//b//')).toEqual(['a', 'b']);
    expect(nameComponents('')).toEqual([]);
  });
});

describe('buildTree', () => {
  it('rebuilds folders the archive never listed', () => {
    const tree = buildTree([file('docs/images/a.png'), file('docs/b.txt')]);
    expect(tree.map((n) => n.name)).toEqual(['docs']);
    expect(tree[0]?.isDirectory).toBe(true);
    expect(tree[0]?.entry).toBe(-1);
    expect(tree[0]?.children.map((n) => n.name).sort()).toEqual(['b.txt', 'images']);
  });

  it('uses the folder entry the archive did list', () => {
    const tree = buildTree([dir('docs/'), file('docs/b.txt')]);
    expect(tree[0]?.entry).toBe(0);
    expect(tree[0]?.isDirectory).toBe(true);
  });

  it('finds the folder entry even when it comes after its contents', () => {
    const tree = buildTree([file('docs/b.txt'), dir('docs/')]);
    expect(tree[0]?.entry).toBe(1);
    expect(tree[0]?.children).toHaveLength(1);
  });

  it('adds up sizes, files and the newest time along every branch', () => {
    const tree = buildTree([
      file('docs/a.txt', 100, 40, 5000),
      file('docs/deep/b.txt', 300, 60, 9000),
      file('top.txt', 7, 7, 1),
    ]);
    const docs = tree.find((n) => n.name === 'docs');
    expect(docs?.size).toBe(400);
    expect(docs?.packed).toBe(100);
    expect(docs?.files).toBe(2);
    expect(docs?.modifiedAt).toBe(9000);
    expect(docs?.children.find((n) => n.name === 'deep')?.files).toBe(1);
  });

  it('keeps an empty folder, with nothing in it', () => {
    const tree = buildTree([dir('empty/')]);
    expect(tree[0]?.files).toBe(0);
    expect(tree[0]?.size).toBe(0);
    expect(tree[0]?.children).toEqual([]);
  });

  it('shows both of two entries that share a name, under separate ids', () => {
    const tree = buildTree([file('dup.txt', 10), file('dup.txt', 20)]);
    expect(tree).toHaveLength(2);
    expect(new Set(tree.map((n) => n.id)).size).toBe(2);
    expect(tree.map((n) => n.entry)).toEqual([0, 1]);
  });

  it('does not let a file and a folder of one name collide', () => {
    const tree = buildTree([file('thing'), file('thing/inside.txt')]);
    expect(new Set(tree.map((n) => n.id)).size).toBe(2);
    expect(nodeIndex(tree).size).toBe(3);
  });

  it('ignores an entry with no usable name', () => {
    expect(buildTree([file(''), file('/'), file('ok.txt')]).map((n) => n.name)).toEqual(['ok.txt']);
  });

  it('records the entry index each file came from', () => {
    const tree = buildTree([file('a.txt'), file('b/c.txt')]);
    expect(tree.find((n) => n.name === 'a.txt')?.entry).toBe(0);
    expect(tree.find((n) => n.name === 'b')?.children[0]?.entry).toBe(1);
  });
});

describe('compareNodes', () => {
  const tree = buildTree([file('b.txt', 10, 9, 300), file('a.txt', 900, 10, 100), dir('zz/')]);
  const [b, a, zz] = tree;

  it('puts folders first whatever the sort', () => {
    for (const column of ['name', 'size', 'modified'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(compareNodes(zz as never, a as never, sortBy(column, direction))).toBeLessThan(0);
      }
    }
  });

  it('sorts by name, and reverses on descending', () => {
    expect(compareNodes(a as never, b as never, sortBy('name', 'asc'))).toBeLessThan(0);
    expect(compareNodes(a as never, b as never, sortBy('name', 'desc'))).toBeGreaterThan(0);
  });

  it('sorts by the value of the other columns', () => {
    expect(compareNodes(a as never, b as never, sortBy('size', 'asc'))).toBeGreaterThan(0);
    expect(compareNodes(a as never, b as never, sortBy('ratio', 'asc'))).toBeGreaterThan(0);
    expect(compareNodes(a as never, b as never, sortBy('modified', 'asc'))).toBeLessThan(0);
  });

  it('reads the whole path when the rows print whole paths', () => {
    const flat = buildTree([file('z/a.txt'), file('a/z.txt')]);
    const files = allFiles(flat);
    expect(compareNodes(files[0] as never, files[1] as never, DEFAULT_SORT, 'name')).toBeLessThan(
      0,
    );
    expect(
      compareNodes(files[0] as never, files[1] as never, DEFAULT_SORT, 'path'),
    ).toBeGreaterThan(0);
  });

  it('falls back to the name when the values tie', () => {
    const tied = buildTree([file('b.txt', 5, 5, 1), file('a.txt', 5, 5, 1)]);
    expect(compareNodes(tied[0] as never, tied[1] as never, sortBy('size', 'asc'))).toBeGreaterThan(
      0,
    );
  });
});

describe('visibleRows', () => {
  const tree = buildTree([
    file('docs/images/a.png', 300, 100),
    file('docs/b.txt', 100, 90),
    file('top.txt', 10, 10),
  ]);

  it('shows only the top level when nothing is expanded', () => {
    expect(labels(tree, [])).toEqual(['docs', 'top.txt']);
  });

  it('opens one folder at a time', () => {
    expect(labels(tree, ['docs'])).toEqual(['docs', '  images', '  b.txt', 'top.txt']);
    expect(labels(tree, ['docs', 'docs/images'])).toEqual([
      'docs',
      '  images',
      '    a.png',
      '  b.txt',
      'top.txt',
    ]);
  });

  it('does not open a folder whose parent is shut', () => {
    expect(labels(tree, ['docs/images'])).toEqual(['docs', 'top.txt']);
  });

  it('marks which rows are open', () => {
    const rows = visibleRows(tree, { expanded: new Set(['docs']), sort: DEFAULT_SORT });
    expect(rows.map((r) => r.expanded)).toEqual([true, false, false, false]);
  });

  it('sorts inside each folder, not across the whole list', () => {
    const rows = labels(tree, ['docs'], sortBy('size', 'desc'));
    expect(rows).toEqual(['docs', '  images', '  b.txt', 'top.txt']);
  });

  it('lists search hits flat, by full path, folders left out', () => {
    const rows = visibleRows(tree, { expanded: new Set(), sort: DEFAULT_SORT, query: 'a' });
    expect(rows.map((r) => r.label)).toEqual(['docs/images/a.png']);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it('searches the whole path, not only the file name', () => {
    const rows = visibleRows(tree, { expanded: new Set(), sort: DEFAULT_SORT, query: 'docs/' });
    expect(rows.map((r) => r.label)).toEqual(['docs/b.txt', 'docs/images/a.png']);
  });

  it('ignores case and surrounding space in the query', () => {
    const rows = visibleRows(tree, { expanded: new Set(), sort: DEFAULT_SORT, query: '  A.PNG ' });
    expect(rows.map((r) => r.label)).toEqual(['docs/images/a.png']);
  });

  it('falls back to the tree when the query is only spaces', () => {
    const rows = visibleRows(tree, { expanded: new Set(), sort: DEFAULT_SORT, query: '   ' });
    expect(rows.map((r) => r.label)).toEqual(['docs', 'top.txt']);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(visibleRows(tree, { expanded: new Set(), sort: DEFAULT_SORT, query: 'zzz' })).toEqual(
      [],
    );
  });
});

describe('allFiles and folderIds', () => {
  const tree = buildTree([file('docs/images/a.png'), file('docs/b.txt'), dir('empty/')]);

  it('lists every file, at any depth', () => {
    expect(allFiles(tree).map((n) => n.path)).toEqual(['docs/images/a.png', 'docs/b.txt']);
  });

  it('lists every folder, listed or implied', () => {
    expect(folderIds(tree).sort()).toEqual(['docs', 'docs/images', 'empty']);
  });
});

describe('initialExpanded', () => {
  const tree = buildTree([file('docs/a.txt'), file('docs/deep/b.txt')]);

  it('opens the whole tree for an archive small enough to read', () => {
    expect([...initialExpanded(tree, 12)].sort()).toEqual(['docs', 'docs/deep']);
  });

  it('leaves a huge archive shut', () => {
    expect(initialExpanded(tree, EXPAND_LIMIT + 1).size).toBe(0);
  });
});

describe('selectedEntries', () => {
  const entries = [dir('docs/'), file('docs/a.txt'), file('docs/deep/b.txt'), file('top.txt')];
  const tree = buildTree(entries);

  it('resolves a selected file to its own entry', () => {
    expect(selectedEntries(tree, new Set(['top.txt']))).toEqual([3]);
  });

  it('resolves a selected folder to everything inside it', () => {
    expect(selectedEntries(tree, new Set(['docs']))).toEqual([0, 1, 2]);
  });

  it('counts an entry once when a folder and its child are both selected', () => {
    expect(selectedEntries(tree, new Set(['docs', 'docs/a.txt']))).toEqual([0, 1, 2]);
  });

  it('skips a folder the archive only implies, but keeps its contents', () => {
    const implied = buildTree([file('a/b/c.txt')]);
    expect(selectedEntries(implied, new Set(['a']))).toEqual([0]);
  });

  it('returns nothing for an empty or unknown selection', () => {
    expect(selectedEntries(tree, new Set())).toEqual([]);
    expect(selectedEntries(tree, new Set(['nope']))).toEqual([]);
  });

  it('returns entries in archive order, not selection order', () => {
    expect(selectedEntries(tree, new Set(['top.txt', 'docs/a.txt']))).toEqual([1, 3]);
  });
});
