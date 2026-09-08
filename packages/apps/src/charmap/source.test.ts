import { describe, expect, it } from 'vitest';
import { emptyStateFor, resolveSource, SEARCH_SOURCE, statusLine } from './source';
import { type CharmapData, DEFAULT_DATA, PINNED_SOURCE, RECENT_SOURCE } from './storage';

const data = (patch: Partial<CharmapData> = {}): CharmapData => ({
  ...DEFAULT_DATA,
  recents: [],
  pinned: [],
  ...patch,
});

describe('resolveSource', () => {
  it('shows a block, with the code points that have a character', () => {
    const source = resolveSource(data({ source: 'box-drawing' }), '');
    expect(source.id).toBe('box-drawing');
    expect(source.name).toBe('Box Drawing');
    expect(source.codePoints).toHaveLength(128);
    expect(source.block?.start).toBe(0x2500);
  });

  it('leaves out the code points a block has nothing for', () => {
    const source = resolveSource(data({ source: 'basic-latin' }), '');
    expect(source.codePoints).toHaveLength(95);
    expect(source.codePoints).not.toContain(0x00);
  });

  it('shows the pinned and recent lists in the order they are kept', () => {
    const pinned = resolveSource(data({ source: PINNED_SOURCE, pinned: [0x2014, 0xa9] }), '');
    expect(pinned.name).toBe('Pinned');
    expect(pinned.codePoints).toEqual([0x2014, 0xa9]);

    const recent = resolveSource(data({ source: RECENT_SOURCE, recents: [0xa9] }), '');
    expect(recent.name).toBe('Recent');
    expect(recent.codePoints).toEqual([0xa9]);
  });

  it('lets a query take over from whatever block is selected', () => {
    const source = resolveSource(data({ source: 'box-drawing' }), 'U+2014');
    expect(source.id).toBe(SEARCH_SOURCE);
    expect(source.codePoints).toEqual([0x2014]);
    expect(source.block).toBeNull();
  });

  it('ignores a query of nothing but space', () => {
    expect(resolveSource(data(), '   ').id).toBe('general-punctuation');
  });

  it('falls back to the default block for a source it does not know', () => {
    expect(resolveSource({ ...data(), source: 'klingon' }, '').id).toBe('general-punctuation');
  });
});

describe('statusLine', () => {
  it('says how many of a block’s code points have a character', () => {
    expect(statusLine(resolveSource(data({ source: 'basic-latin' }), ''))).toBe(
      'U+0000–U+007F · 95 of 128 code points have a character',
    );
  });

  it('says only the count when a block is fully assigned', () => {
    expect(statusLine(resolveSource(data({ source: 'box-drawing' }), ''))).toBe(
      'U+2500–U+257F · 128 characters',
    );
  });

  it('counts search results, and says so in the singular', () => {
    expect(statusLine(resolveSource(data(), 'U+2014'))).toBe('1 result');
    expect(statusLine(resolveSource(data(), '2014'))).toBe('2 results');
    expect(statusLine(resolveSource(data(), 'U+0009'))).toBe('No results');
  });

  it('counts the two lists', () => {
    expect(statusLine(resolveSource(data({ source: PINNED_SOURCE }), ''))).toBe('Nothing pinned');
    expect(statusLine(resolveSource(data({ source: PINNED_SOURCE, pinned: [0x2014] }), ''))).toBe(
      '1 pinned',
    );
    expect(statusLine(resolveSource(data({ source: RECENT_SOURCE }), ''))).toBe(
      'Nothing copied yet',
    );
  });
});

describe('emptyStateFor', () => {
  it('gives each empty grid its own reason', () => {
    expect(emptyStateFor(resolveSource(data(), 'zzzz-nothing')).title).toBe('No character found');
    expect(emptyStateFor(resolveSource(data({ source: PINNED_SOURCE }), '')).title).toBe(
      'No pinned characters',
    );
    expect(emptyStateFor(resolveSource(data({ source: RECENT_SOURCE }), '')).title).toBe(
      'No recent characters',
    );
  });
});
