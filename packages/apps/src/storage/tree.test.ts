import { describe, expect, it } from 'vitest';
import { buildTree, collapseSmall, findNode, largestFiles, type SizeNode, trailTo } from './tree';

const HOME = '/Users/ada';

const files = [
  { path: `${HOME}/Documents/report.pdf`, size: 500 },
  { path: `${HOME}/Documents/notes.md`, size: 100 },
  { path: `${HOME}/Documents/drafts/one.txt`, size: 40 },
  { path: `${HOME}/Documents/drafts/two.txt`, size: 60 },
  { path: `${HOME}/Pictures/sunset.png`, size: 2000 },
  { path: `${HOME}/todo.txt`, size: 10 },
];

const names = (node: SizeNode) => node.children.map((c) => c.name);

describe('buildTree', () => {
  it('rolls every file size up into its directories', () => {
    const tree = buildTree(HOME, files);
    expect(tree.size).toBe(2710);
    expect(tree.files).toBe(6);
    const documents = findNode(tree, `${HOME}/Documents`);
    expect(documents).toMatchObject({ size: 700, files: 4, kind: 'directory' });
    expect(findNode(tree, `${HOME}/Documents/drafts`)).toMatchObject({ size: 100, files: 2 });
  });

  it('sorts every level largest first', () => {
    const tree = buildTree(HOME, files);
    expect(names(tree)).toEqual(['Pictures', 'Documents', 'todo.txt']);
    const documents = findNode(tree, `${HOME}/Documents`) as SizeNode;
    // notes.md and drafts are both 100 bytes; the tie breaks on name.
    expect(names(documents)).toEqual(['report.pdf', 'drafts', 'notes.md']);
  });

  it('names the root after its own folder', () => {
    expect(buildTree(HOME, files).name).toBe('ada');
    expect(buildTree('/', [{ path: '/a.txt', size: 1 }]).name).toBe('/');
  });

  it('builds files directly under the root as leaves', () => {
    const tree = buildTree(HOME, files);
    const leaf = findNode(tree, `${HOME}/todo.txt`);
    expect(leaf).toMatchObject({ kind: 'file', size: 10, files: 1, children: [] });
  });

  it('ignores files that are not under the root', () => {
    const tree = buildTree(HOME, [...files, { path: '/Trash/old.zip', size: 99 }]);
    expect(tree.size).toBe(2710);
    expect(findNode(tree, '/Trash/old.zip')).toBeNull();
  });

  it('counts a file of unknown size as zero bytes rather than dropping it', () => {
    const tree = buildTree(HOME, [{ path: `${HOME}/x.bin`, size: Number.NaN }]);
    expect(tree).toMatchObject({ size: 0, files: 1 });
  });

  it('holds nothing for an empty scan', () => {
    expect(buildTree(HOME, [])).toMatchObject({ size: 0, files: 0, children: [] });
  });

  it('breaks size ties by name so the layout does not jitter', () => {
    const tree = buildTree(HOME, [
      { path: `${HOME}/b.txt`, size: 10 },
      { path: `${HOME}/a.txt`, size: 10 },
    ]);
    expect(names(tree)).toEqual(['a.txt', 'b.txt']);
  });
});

describe('collapseSmall', () => {
  const many = buildTree(
    HOME,
    Array.from({ length: 30 }, (_, i) => ({ path: `${HOME}/f${i}.txt`, size: i === 0 ? 5000 : 1 })),
  );

  it('gathers the tail into one bucket', () => {
    const collapsed = collapseSmall(many, { minShare: 0.01 });
    expect(collapsed.children).toHaveLength(2);
    const bucket = collapsed.children[1] as SizeNode;
    expect(bucket.kind).toBe('bucket');
    expect(bucket.name).toBe('…and 29 more');
    expect(bucket.size).toBe(29);
    expect(bucket.files).toBe(29);
  });

  it('keeps the bucket size equal to what it replaced', () => {
    const collapsed = collapseSmall(many, { minShare: 0.01 });
    const before = many.children.reduce((sum, c) => sum + c.size, 0);
    const after = collapsed.children.reduce((sum, c) => sum + c.size, 0);
    expect(after).toBe(before);
  });

  it('never hides a single child behind an "and 1 more"', () => {
    const tree = buildTree(HOME, [
      { path: `${HOME}/big.bin`, size: 1000 },
      { path: `${HOME}/tiny.txt`, size: 1 },
    ]);
    expect(collapseSmall(tree, { minShare: 0.5 })).toEqual(tree);
  });

  it('caps the number of tiles even when every child is large', () => {
    const tree = buildTree(
      HOME,
      Array.from({ length: 20 }, (_, i) => ({ path: `${HOME}/f${i}.txt`, size: 100 })),
    );
    const collapsed = collapseSmall(tree, { minShare: 0, maxChildren: 5 });
    expect(collapsed.children).toHaveLength(6);
    expect(collapsed.children[5]?.name).toBe('…and 15 more');
  });

  it('keeps the largest child even when it is under the threshold', () => {
    const tree = buildTree(HOME, [
      { path: `${HOME}/a.txt`, size: 1 },
      { path: `${HOME}/b.txt`, size: 1 },
      { path: `${HOME}/c.txt`, size: 1 },
    ]);
    const collapsed = collapseSmall(tree, { minShare: 0.9 });
    expect(collapsed.children.map((c) => c.kind)).toEqual(['file', 'bucket']);
  });

  it('leaves an empty directory alone', () => {
    const empty = buildTree(HOME, []);
    expect(collapseSmall(empty)).toEqual(empty);
  });

  it('gives the bucket a path of its own so it can be keyed', () => {
    const collapsed = collapseSmall(many, { minShare: 0.01 });
    expect(collapsed.children[1]?.path).toBe(`${HOME}#more`);
  });
});

describe('findNode and trailTo', () => {
  const tree = buildTree(HOME, files);

  it('finds the root, a directory and a file', () => {
    expect(findNode(tree, HOME)).toBe(tree);
    expect(findNode(tree, `${HOME}/Documents/drafts`)?.name).toBe('drafts');
    expect(findNode(tree, `${HOME}/Documents/notes.md`)?.kind).toBe('file');
  });

  it('returns null for a path the scan never saw', () => {
    expect(findNode(tree, `${HOME}/Music`)).toBeNull();
    expect(findNode(tree, '/System')).toBeNull();
  });

  it('walks the breadcrumb from the root down', () => {
    expect(trailTo(tree, `${HOME}/Documents/drafts`).map((n) => n.name)).toEqual([
      'ada',
      'Documents',
      'drafts',
    ]);
    expect(trailTo(tree, HOME).map((n) => n.name)).toEqual(['ada']);
  });

  it('has no trail to a path outside the tree', () => {
    expect(trailTo(tree, '/System/settings.json')).toEqual([]);
    expect(trailTo(tree, `${HOME}/Music/song.mp3`)).toEqual([]);
  });
});

describe('largestFiles', () => {
  it('sorts by size, largest first, and cuts to the limit', () => {
    expect(largestFiles(files, 3).map((f) => f.size)).toEqual([2000, 500, 100]);
  });

  it('orders equal sizes by path so the table is stable', () => {
    const same = [
      { path: '/b.txt', size: 5 },
      { path: '/a.txt', size: 5 },
    ];
    expect(largestFiles(same, 2).map((f) => f.path)).toEqual(['/a.txt', '/b.txt']);
  });

  it('does not touch the list it was given', () => {
    const input = [...files];
    largestFiles(input, 2);
    expect(input).toEqual(files);
  });
});
