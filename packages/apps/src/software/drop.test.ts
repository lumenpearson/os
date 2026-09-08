import { describe, expect, it } from 'vitest';
import {
  hasDropPayload,
  isManifestName,
  LUMEN_PATHS_MIME,
  parseDroppedPaths,
  pickManifest,
} from './drop';

describe('parseDroppedPaths', () => {
  it('reads the JSON array the Files app writes', () => {
    expect(parseDroppedPaths('["/Applications/Timer.app","/Users/ada/a.txt"]')).toEqual([
      '/Applications/Timer.app',
      '/Users/ada/a.txt',
    ]);
  });

  it('is empty for anything it cannot read', () => {
    expect(parseDroppedPaths('')).toEqual([]);
    expect(parseDroppedPaths('not json')).toEqual([]);
    expect(parseDroppedPaths('{"path":"/a"}')).toEqual([]);
  });

  it('keeps only the strings', () => {
    expect(parseDroppedPaths('["/a", 4, null]')).toEqual(['/a']);
  });
});

describe('pickManifest', () => {
  it('prefers a .app whatever order it arrives in', () => {
    expect(pickManifest(['/a/notes.txt', '/a/Timer.app'])).toBe('/a/Timer.app');
    expect(pickManifest(['/a/Timer.APP'])).toBe('/a/Timer.APP');
  });

  it('falls back to the first item so the reader sees why it failed', () => {
    expect(pickManifest(['/a/notes.txt'])).toBe('/a/notes.txt');
  });

  it('is null for an empty drop', () => {
    expect(pickManifest([])).toBeNull();
  });
});

describe('hasDropPayload', () => {
  it('is true for VFS paths and for host files', () => {
    expect(hasDropPayload([LUMEN_PATHS_MIME])).toBe(true);
    expect(hasDropPayload(['Files'])).toBe(true);
  });

  it('is false for a plain text drag', () => {
    expect(hasDropPayload(['text/plain'])).toBe(false);
    expect(hasDropPayload([])).toBe(false);
  });
});

describe('isManifestName', () => {
  it('reads the extension, not the rest of the name', () => {
    expect(isManifestName('Timer.app')).toBe(true);
    expect(isManifestName('app')).toBe(false);
    expect(isManifestName('Timer.application')).toBe(false);
  });
});
