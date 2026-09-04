import { describe, expect, it } from 'vitest';
import {
  ancestors,
  basename,
  dirname,
  extname,
  isInside,
  isValidName,
  join,
  normalize,
  relative,
  resolve,
  segments,
  uniqueName,
} from './path';

describe('path', () => {
  it('normalizes dots, duplicate and backslash separators', () => {
    expect(normalize('/a//b/./c/../d')).toBe('/a/b/d');
    expect(normalize('a\\b\\c')).toBe('a/b/c');
    expect(normalize('/')).toBe('/');
    expect(normalize('/..')).toBe('/');
    expect(normalize('')).toBe('/');
  });
  it('joins and resolves', () => {
    expect(join('/Users', 'me', 'Documents')).toBe('/Users/me/Documents');
    expect(resolve('/Users/me', 'Desktop')).toBe('/Users/me/Desktop');
    expect(resolve('/Users/me', '/System')).toBe('/System');
    expect(resolve('/Users/me', '../other')).toBe('/Users/other');
  });
  it('dirname, basename, extname', () => {
    expect(dirname('/a/b/c.txt')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(dirname('/')).toBe('/');
    expect(basename('/a/b/c.txt')).toBe('c.txt');
    expect(basename('/a/b/c.txt', true)).toBe('c');
    expect(extname('/a/b/c.TXT')).toBe('.txt');
    expect(extname('/a/.bashrc')).toBe('');
    expect(extname('/a/archive.tar.gz')).toBe('.gz');
    expect(extname('/a/noext')).toBe('');
  });
  it('segments, ancestors, relative, isInside', () => {
    expect(segments('/a/b')).toEqual(['a', 'b']);
    expect(segments('/')).toEqual([]);
    expect(ancestors('/a/b')).toEqual(['/', '/a', '/a/b']);
    expect(relative('/a/b', '/a/c/d')).toBe('../c/d');
    expect(relative('/a', '/a')).toBe('.');
    expect(isInside('/a', '/a/b')).toBe(true);
    expect(isInside('/a', '/ab')).toBe(false);
    expect(isInside('/a', '/a')).toBe(false);
    expect(isInside('/a', '/a', true)).toBe(true);
    expect(isInside('/', '/x')).toBe(true);
  });
  it('generates unique names and validates names', () => {
    const taken = new Set(['Note.txt', 'Note 2.txt']);
    expect(uniqueName('Note.txt', (n) => taken.has(n))).toBe('Note 3.txt');
    expect(uniqueName('Folder', (n) => taken.has(n))).toBe('Folder');
    expect(isValidName('ok name.txt')).toBe(true);
    expect(isValidName('bad/name')).toBe(false);
    expect(isValidName('con')).toBe(false);
    expect(isValidName('..')).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(isValidName('trailing.')).toBe(false);
  });
});
