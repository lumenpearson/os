import { describe, expect, it } from 'vitest';
import type { LibraryEntry } from './library';
import type { PackageSummary } from './remote';
import { availableUpdates, compareVersions, isNewer, updateCountLabel } from './updates';

function entry(over: Partial<LibraryEntry>): LibraryEntry {
  return {
    id: 'com.lumen.regex',
    name: 'Regex Tester',
    description: '',
    version: '1.0.0',
    category: 'developer',
    keywords: [],
    source: 'installed',
    kind: 'html',
    removable: true,
    path: '/Applications/Regex Tester.app',
    definition: null,
    manifest: null,
    ...over,
  } as LibraryEntry;
}

function summary(over: Partial<PackageSummary>): PackageSummary {
  return {
    id: 'com.lumen.regex',
    kind: 'app',
    name: 'Regex Tester',
    tagline: '',
    version: '1.1.0',
    publisher: 'Lumen',
    category: 'developer',
    size: 1,
    price: 'free',
    keywords: [],
    updated: '2026-08-24T09:00:00Z',
    ...over,
  } as PackageSummary;
}

describe('compareVersions', () => {
  it('reads numbers as numbers, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
  });

  it('treats a missing part as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });

  it('ignores a leading v and surrounding space', () => {
    expect(compareVersions(' v1.2.0 ', '1.2.0')).toBe(0);
  });

  it('orders a pre-release below the release it precedes', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('never offers a pre-release as an update over its own release', () => {
    expect(isNewer('1.0.0', '1.0.0-beta')).toBe(false);
    expect(isNewer('1.0.0-beta', '1.0.0')).toBe(true);
  });

  it('is antisymmetric on every pair it is given', () => {
    const versions = ['0.9', '1.0.0', '1.0.0-beta', '1.0.1', '1.10.0', '2.0.0', 'v1.0.0'];
    for (const a of versions) {
      for (const b of versions) {
        // `+ 0` so a -0 from negating zero compares equal to 0.
        expect(compareVersions(a, b) + 0).toBe(-compareVersions(b, a) + 0);
      }
    }
  });
});

describe('isNewer', () => {
  it('is true only in one direction', () => {
    expect(isNewer('1.0.0', '1.1.0')).toBe(true);
    expect(isNewer('1.1.0', '1.0.0')).toBe(false);
    expect(isNewer('1.1.0', '1.1.0')).toBe(false);
  });

  it('offers nothing against a version it does not have', () => {
    expect(isNewer(null, '1.1.0')).toBe(false);
    expect(isNewer('', '1.1.0')).toBe(false);
  });
});

describe('availableUpdates', () => {
  it('finds the installed package the catalogue has moved past', () => {
    const found = availableUpdates([entry({})], [summary({})]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'com.lumen.regex', from: '1.0.0', to: '1.1.0' });
  });

  it('offers nothing when the system is already on the catalogue version', () => {
    expect(availableUpdates([entry({ version: '1.1.0' })], [summary({})])).toEqual([]);
  });

  it('never offers to replace a built-in app', () => {
    expect(availableUpdates([entry({ source: 'built-in' })], [summary({})])).toEqual([]);
  });

  it('leaves a manifest with no version alone', () => {
    expect(availableUpdates([entry({ version: null })], [summary({})])).toEqual([]);
  });

  it('ignores catalogue packages that are not installed', () => {
    expect(availableUpdates([], [summary({})])).toEqual([]);
    expect(availableUpdates([entry({ id: 'other' })], [summary({})])).toEqual([]);
  });

  it('does not downgrade when the catalogue is behind the system', () => {
    expect(availableUpdates([entry({ version: '2.0.0' })], [summary({})])).toEqual([]);
  });

  it('has nothing to say with no catalogue in hand', () => {
    expect(availableUpdates([entry({})], [])).toEqual([]);
  });

  it('keeps the catalogue order', () => {
    const found = availableUpdates(
      [entry({ id: 'a' }), entry({ id: 'b' })],
      [summary({ id: 'b' }), summary({ id: 'a' })],
    );
    expect(found.map((u) => u.id)).toEqual(['b', 'a']);
  });
});

describe('updateCountLabel', () => {
  it('counts in words a person would use', () => {
    expect(updateCountLabel(0)).toBe('No updates available');
    expect(updateCountLabel(1)).toBe('1 update available');
    expect(updateCountLabel(4)).toBe('4 updates available');
  });
});
