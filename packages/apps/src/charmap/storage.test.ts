import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOCK } from './blocks';
import {
  type CharmapData,
  clearRecents,
  DEFAULT_DATA,
  isPinned,
  isSourceId,
  normalizeData,
  PIN_LIMIT,
  PINNED_SOURCE,
  RECENT_LIMIT,
  RECENT_SOURCE,
  recordRecent,
  togglePin,
} from './storage';

const fresh = (): CharmapData => ({ ...DEFAULT_DATA, recents: [], pinned: [] });

describe('isSourceId', () => {
  it('accepts a block or one of the two lists', () => {
    expect(isSourceId('arrows')).toBe(true);
    expect(isSourceId(PINNED_SOURCE)).toBe(true);
    expect(isSourceId(RECENT_SOURCE)).toBe(true);
    expect(isSourceId('nonesuch')).toBe(false);
    expect(isSourceId(null)).toBe(false);
  });
});

describe('normalizeData', () => {
  it('falls back to the defaults for anything that is not a record', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('{}')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
  });

  it('keeps a file it wrote itself', () => {
    const data: CharmapData = {
      source: 'arrows',
      recents: [0x2014, 0x2026],
      pinned: [0x00a0],
      showSidebar: false,
    };
    expect(normalizeData(data)).toEqual(data);
  });

  it('drops a source that is no longer a block', () => {
    expect(normalizeData({ source: 'klingon' }).source).toBe(DEFAULT_BLOCK);
  });

  it('drops entries that are not code points with something to draw', () => {
    const data = normalizeData({
      recents: [0x2014, 'x', -1, 0.5, 0xd800, 0x0009, 0x110000, 0x2026],
      pinned: [0x0378],
    });
    expect(data.recents).toEqual([0x2014, 0x2026]);
    expect(data.pinned).toEqual([]);
  });

  it('keeps each character once', () => {
    expect(normalizeData({ recents: [0x2014, 0x2014, 0x2026] }).recents).toEqual([0x2014, 0x2026]);
  });

  it('caps both lists', () => {
    const many = Array.from({ length: 400 }, (_, i) => 0x2500 + i);
    const data = normalizeData({ recents: many, pinned: many });
    expect(data.recents).toHaveLength(RECENT_LIMIT);
    expect(data.pinned).toHaveLength(PIN_LIMIT);
  });

  it('treats a missing sidebar preference as shown', () => {
    expect(normalizeData({}).showSidebar).toBe(true);
    expect(normalizeData({ showSidebar: 'yes' }).showSidebar).toBe(true);
    expect(normalizeData({ showSidebar: false }).showSidebar).toBe(false);
  });
});

describe('recordRecent', () => {
  it('puts the newest first', () => {
    const data = recordRecent(recordRecent(fresh(), 0x2014), 0x2026);
    expect(data.recents).toEqual([0x2026, 0x2014]);
  });

  it('moves a repeat back to the front rather than repeating it', () => {
    let data = fresh();
    data = recordRecent(data, 0x2014);
    data = recordRecent(data, 0x2026);
    data = recordRecent(data, 0x2014);
    expect(data.recents).toEqual([0x2014, 0x2026]);
  });

  it('keeps the list to its limit', () => {
    let data = fresh();
    for (let i = 0; i < RECENT_LIMIT + 20; i += 1) data = recordRecent(data, 0x2500 + i);
    expect(data.recents).toHaveLength(RECENT_LIMIT);
    expect(data.recents[0]).toBe(0x2500 + RECENT_LIMIT + 19);
  });

  it('refuses a character that cannot be drawn', () => {
    const data = fresh();
    expect(recordRecent(data, 0xd800)).toBe(data);
  });
});

describe('togglePin', () => {
  it('pins at the end and unpins from anywhere', () => {
    let data = togglePin(togglePin(fresh(), 0x2014), 0x2026);
    expect(data.pinned).toEqual([0x2014, 0x2026]);
    expect(isPinned(data, 0x2014)).toBe(true);
    data = togglePin(data, 0x2014);
    expect(data.pinned).toEqual([0x2026]);
    expect(isPinned(data, 0x2014)).toBe(false);
  });

  it('refuses a character that cannot be drawn', () => {
    const data = fresh();
    expect(togglePin(data, 0x0378)).toBe(data);
  });

  it('stops at the cap', () => {
    let data = fresh();
    for (let i = 0; i < PIN_LIMIT + 5; i += 1) data = togglePin(data, 0x2500 + i);
    expect(data.pinned).toHaveLength(PIN_LIMIT);
  });
});

describe('clearRecents', () => {
  it('empties the list and leaves everything else alone', () => {
    const data = { ...fresh(), recents: [0x2014], pinned: [0x2026] };
    const cleared = clearRecents(data);
    expect(cleared.recents).toEqual([]);
    expect(cleared.pinned).toEqual([0x2026]);
  });

  it('changes nothing when there is nothing to clear', () => {
    const data = fresh();
    expect(clearRecents(data)).toBe(data);
  });
});
