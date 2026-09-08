import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryTotals, storageCategory } from './categories';

describe('storageCategory', () => {
  it('follows the VFS classification into the coarser buckets', () => {
    expect(storageCategory('/Users/ada/Documents/notes.md')).toBe('documents');
    expect(storageCategory('/Users/ada/Documents/Budget.lsd')).toBe('documents');
    expect(storageCategory('/Users/ada/Documents/paper.pdf')).toBe('documents');
    expect(storageCategory('/Users/ada/Pictures/sunset.png')).toBe('pictures');
    expect(storageCategory('/Users/ada/Music/take-five.flac')).toBe('audio');
    expect(storageCategory('/Users/ada/Videos/clip.webm')).toBe('video');
    expect(storageCategory('/Users/ada/Projects/main.rs')).toBe('code');
    expect(storageCategory('/Users/ada/Projects/build.sh')).toBe('code');
    expect(storageCategory('/Users/ada/Projects/data.json')).toBe('code');
    expect(storageCategory('/Users/ada/Downloads/backup.zip')).toBe('archives');
  });

  it('puts a file it cannot name in Other rather than guessing', () => {
    expect(storageCategory('/Users/ada/Downloads/blob.qqq')).toBe('other');
    expect(storageCategory('/Users/ada/Downloads/noextension')).toBe('other');
    expect(storageCategory('/Users/ada/Library/Inter.woff2')).toBe('other');
  });
});

describe('categoryTotals', () => {
  it('returns every bucket in a fixed order, zeroes included', () => {
    const totals = categoryTotals([{ path: '/a/x.png', size: 10 }]);
    expect(totals.map((t) => t.category)).toEqual(CATEGORIES);
    expect(totals.find((t) => t.category === 'pictures')).toMatchObject({ bytes: 10, files: 1 });
    expect(totals.find((t) => t.category === 'audio')).toMatchObject({ bytes: 0, files: 0 });
  });

  it('sums bytes and counts files per bucket', () => {
    const totals = categoryTotals([
      { path: '/a/one.md', size: 100 },
      { path: '/a/two.txt', size: 25 },
      { path: '/a/three.png', size: 900 },
      { path: '/a/four.ts', size: 40 },
    ]);
    const by = new Map(totals.map((t) => [t.category, t]));
    expect(by.get('documents')).toMatchObject({ bytes: 125, files: 2 });
    expect(by.get('pictures')).toMatchObject({ bytes: 900, files: 1 });
    expect(by.get('code')).toMatchObject({ bytes: 40, files: 1 });
  });

  it('counts a file of unknown or negative size as zero bytes, not as missing', () => {
    const totals = categoryTotals([
      { path: '/a/one.md', size: Number.NaN },
      { path: '/a/two.md', size: -5 },
    ]);
    const documents = totals.find((t) => t.category === 'documents');
    expect(documents).toMatchObject({ bytes: 0, files: 2 });
  });

  it('is empty-safe', () => {
    expect(categoryTotals([]).every((t) => t.bytes === 0 && t.files === 0)).toBe(true);
  });
});
