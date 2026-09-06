import { describe, expect, it } from 'vitest';
import {
  formatRatio,
  formatSize,
  groupDigits,
  methodLabel,
  savingRatio,
  summarize,
  totalsOf,
} from './format';
import type { ZipEntry } from './zip';

const entry = (over: Partial<ZipEntry>): ZipEntry => ({
  name: 'a.txt',
  isDirectory: false,
  method: 8,
  crc: 0,
  compressedSize: 0,
  uncompressedSize: 0,
  modifiedAt: 0,
  encrypted: false,
  comment: '',
  headerOffset: 0,
  dataStart: 0,
  dataEnd: 0,
  ...over,
});

describe('methodLabel', () => {
  it('names the two methods this app handles', () => {
    expect(methodLabel(0)).toBe('Stored');
    expect(methodLabel(8)).toBe('Deflate');
  });

  it('prints the number for anything else rather than guessing', () => {
    expect(methodLabel(14)).toBe('Method 14');
    expect(methodLabel(99)).toBe('Method 99');
  });
});

describe('savingRatio', () => {
  it('measures the saving as a fraction of the original', () => {
    expect(savingRatio(1000, 250)).toBeCloseTo(0.75);
    expect(savingRatio(1000, 1000)).toBe(0);
  });

  it('goes negative when packing made the entry bigger', () => {
    expect(savingRatio(100, 110)).toBeCloseTo(-0.1);
  });

  it('has nothing to report for an empty file', () => {
    expect(savingRatio(0, 0)).toBeNull();
    expect(savingRatio(Number.NaN, 4)).toBeNull();
  });
});

describe('formatRatio', () => {
  it('rounds to a whole percent', () => {
    expect(formatRatio(1760, 61)).toBe('97%');
    expect(formatRatio(3, 2)).toBe('33%');
  });

  it('reads 0% for a stored entry and a dash for an empty one', () => {
    expect(formatRatio(500, 500)).toBe('0%');
    expect(formatRatio(0, 0)).toBe('—');
  });
});

describe('groupDigits', () => {
  it('groups in threes from the right', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('keeps a sign and drops a fraction', () => {
    expect(groupDigits(-4200)).toBe('-4,200');
    expect(groupDigits(1234.9)).toBe('1,234');
  });

  it('does not print NaN at a user', () => {
    expect(groupDigits(Number.NaN)).toBe('0');
    expect(groupDigits(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('formatSize', () => {
  it('rounds by default and counts bytes on request', () => {
    expect(formatSize(1536, false)).toBe('1.5 KB');
    expect(formatSize(1536, true)).toBe('1,536 B');
    expect(formatSize(0, true)).toBe('0 B');
  });

  it('refuses a nonsense size', () => {
    expect(formatSize(-1, false)).toBe('—');
  });
});

describe('totalsOf', () => {
  it('counts files and folders apart and adds only the files', () => {
    const totals = totalsOf([
      entry({ uncompressedSize: 100, compressedSize: 40 }),
      entry({ name: 'docs/', isDirectory: true }),
      entry({ uncompressedSize: 300, compressedSize: 60 }),
    ]);
    expect(totals).toEqual({ files: 2, folders: 1, size: 400, packed: 100 });
  });

  it('reports zeroes for an empty archive', () => {
    expect(totalsOf([])).toEqual({ files: 0, folders: 0, size: 0, packed: 0 });
  });
});

describe('summarize', () => {
  it('states the counts and the packing', () => {
    expect(summarize({ files: 4, folders: 1, size: 1760, packed: 74 })).toBe(
      '4 files, 1 folder · 1.7 KB → 74 B (96% smaller)',
    );
  });

  it('uses the singular for one of a thing', () => {
    expect(summarize({ files: 1, folders: 0, size: 1024, packed: 1024 })).toBe(
      '1 file · 1.0 KB → 1.0 KB',
    );
  });

  it('leaves the saving out when there is none', () => {
    expect(summarize({ files: 2, folders: 0, size: 10, packed: 12 })).toBe('2 files · 10 B → 12 B');
  });

  it('says nothing about sizes for a folders-only archive', () => {
    expect(summarize({ files: 0, folders: 3, size: 0, packed: 0 })).toBe('0 files, 3 folders');
  });

  it('counts exact bytes when asked to', () => {
    expect(summarize({ files: 1, folders: 0, size: 2048, packed: 1024 }, true)).toBe(
      '1 file · 2,048 B → 1,024 B (50% smaller)',
    );
  });
});
