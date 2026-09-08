import { describe, expect, it } from 'vitest';
import {
  dropTarget,
  frequentAppIds,
  magnifyScale,
  reorderIds,
  resolveItems,
  shiftFor,
} from './logic';

describe('resolveItems', () => {
  it('keeps the order the setting gives', () => {
    expect(resolveItems(['clock', 'start', 'pinned'])).toEqual(['clock', 'start', 'pinned']);
  });

  it('drops ids the bar does not know, and repeats', () => {
    expect(resolveItems(['start', 'stocks', 'start', '', 'trash'])).toEqual(['start', 'trash']);
  });

  it('is empty for an empty list', () => {
    expect(resolveItems([])).toEqual([]);
  });
});

describe('frequentAppIds', () => {
  const recents = [
    { path: '/a.txt', openedAt: 5, appId: 'editor' },
    { path: '/b.txt', openedAt: 4, appId: 'editor' },
    { path: '/c.png', openedAt: 9, appId: 'paint' },
    { path: '/d.md', openedAt: 1, appId: 'notes' },
  ];

  it('orders by how many documents each app opened', () => {
    expect(frequentAppIds(recents, { limit: 3 })).toEqual(['editor', 'paint', 'notes']);
  });

  it('breaks ties on the most recent open', () => {
    expect(frequentAppIds(recents.slice(2), { limit: 2 })).toEqual(['paint', 'notes']);
  });

  it('leaves out apps the bar already shows', () => {
    expect(frequentAppIds(recents, { exclude: new Set(['editor']), limit: 2 })).toEqual([
      'paint',
      'notes',
    ]);
  });

  it('counts nothing when there is nothing to count', () => {
    expect(frequentAppIds([], {})).toEqual([]);
    expect(frequentAppIds(recents, { limit: 0 })).toEqual([]);
  });
});

describe('reorderIds', () => {
  it('moves an id to where the target sits', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone when an id is missing or unmoved', () => {
    expect(reorderIds(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(reorderIds(['a', 'b'], 'z', 'b')).toEqual(['a', 'b']);
  });
});

describe('dropTarget', () => {
  it('lands on the icon the pointer has reached', () => {
    expect(dropTarget(0, 96, 48, 3)).toBe(2);
    expect(dropTarget(2, -48, 48, 3)).toBe(1);
  });

  it('stops at the ends, and does nothing without geometry', () => {
    expect(dropTarget(0, -500, 48, 3)).toBe(0);
    expect(dropTarget(0, 500, 48, 3)).toBe(2);
    expect(dropTarget(1, 96, 0, 3)).toBe(1);
  });
});

describe('shiftFor', () => {
  it('slides the icons the dragged one passes, and no others', () => {
    expect(shiftFor(1, 0, 2, 48)).toBe(-48);
    expect(shiftFor(2, 0, 2, 48)).toBe(-48);
    expect(shiftFor(3, 0, 2, 48)).toBe(0);
    expect(shiftFor(0, 2, 0, 48)).toBe(48);
    expect(shiftFor(0, 0, 2, 48)).toBe(0);
  });
});

describe('magnifyScale', () => {
  it('is largest under the pointer and back to 1 at the edge of its range', () => {
    expect(magnifyScale(0, 100, 0.4)).toBeCloseTo(1.4);
    expect(magnifyScale(100, 100, 0.4)).toBeCloseTo(1);
    expect(magnifyScale(-50, 100, 0.4)).toBeCloseTo(1.2);
  });

  it('does nothing without a range', () => {
    expect(magnifyScale(10, 0)).toBe(1);
  });
});
