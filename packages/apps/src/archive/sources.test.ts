import { describe, expect, it } from 'vitest';
import { entryNameFor, planRoots, type SourceRoot, suggestArchiveName } from './sources';

describe('planRoots', () => {
  it('keeps the picks in the order they were made', () => {
    expect(planRoots(['/home/u/b.txt', '/home/u/a.txt'])).toEqual([
      { path: '/home/u/b.txt', name: 'b.txt' },
      { path: '/home/u/a.txt', name: 'a.txt' },
    ]);
  });

  it('drops a repeated pick', () => {
    expect(planRoots(['/home/u/a.txt', '/home/u/a.txt', '/home/u//a.txt'])).toHaveLength(1);
  });

  it('drops a pick already covered by another', () => {
    expect(planRoots(['/home/u/Photos', '/home/u/Photos/2024/a.png']).map((r) => r.path)).toEqual([
      '/home/u/Photos',
    ]);
  });

  it('keeps a sibling that merely starts with the same letters', () => {
    expect(planRoots(['/home/u/Photos', '/home/u/PhotosOld']).map((r) => r.name)).toEqual([
      'Photos',
      'PhotosOld',
    ]);
  });

  it('makes two picks of one name distinct at the top of the archive', () => {
    expect(planRoots(['/a/Photos', '/b/Photos', '/c/Photos']).map((r) => r.name)).toEqual([
      'Photos',
      'Photos 2',
      'Photos 3',
    ]);
  });

  it('refuses the root of the file system and empty input', () => {
    expect(planRoots(['/'])).toEqual([]);
    expect(planRoots([])).toEqual([]);
  });
});

describe('entryNameFor', () => {
  const root: SourceRoot = { path: '/home/u/Photos', name: 'Photos' };

  it('names the root itself', () => {
    expect(entryNameFor(root, '/home/u/Photos')).toBe('Photos');
  });

  it('keeps the path below the root', () => {
    expect(entryNameFor(root, '/home/u/Photos/2024/a.png')).toBe('Photos/2024/a.png');
  });

  it('uses the renamed root, not the real folder name', () => {
    const renamed: SourceRoot = { path: '/b/Photos', name: 'Photos 2' };
    expect(entryNameFor(renamed, '/b/Photos/a.png')).toBe('Photos 2/a.png');
  });

  it('never reaches outside the archive for a path that is not below the root', () => {
    expect(entryNameFor(root, '/etc/passwd')).toBe('Photos/passwd');
    expect(entryNameFor(root, '/etc/passwd')).not.toContain('..');
  });

  it('names a single picked file after itself', () => {
    const single: SourceRoot = { path: '/home/u/notes.txt', name: 'notes.txt' };
    expect(entryNameFor(single, '/home/u/notes.txt')).toBe('notes.txt');
  });
});

describe('suggestArchiveName', () => {
  it('names an archive of one thing after that thing', () => {
    expect(suggestArchiveName([{ path: '/a/Photos', name: 'Photos' }])).toBe('Photos.zip');
    expect(suggestArchiveName([{ path: '/a/notes.txt', name: 'notes.txt' }])).toBe('notes.txt.zip');
  });

  it('falls back to a plain name for several things or none', () => {
    expect(
      suggestArchiveName([
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
      ]),
    ).toBe('Archive.zip');
    expect(suggestArchiveName([])).toBe('Archive.zip');
  });
});
