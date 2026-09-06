import { describe, expect, it } from 'vitest';
import { layoutFor, PAIR_ROW_WIDTH, RECENTS_HEIGHT, SIDEBAR_WIDTH, TABS_WIDTH } from './layout';

const on = { showRecents: true };

describe('choosing the category picker', () => {
  it('gives the categories a sidebar in a wide window', () => {
    expect(layoutFor({ width: SIDEBAR_WIDTH, height: 600 }, on).picker).toBe('sidebar');
    expect(layoutFor({ width: 3840, height: 2160 }, on).picker).toBe('sidebar');
  });

  it('falls back to tabs when the sidebar would not fit', () => {
    expect(layoutFor({ width: SIDEBAR_WIDTH - 1, height: 600 }, on).picker).toBe('tabs');
    expect(layoutFor({ width: TABS_WIDTH, height: 600 }, on).picker).toBe('tabs');
  });

  it('falls back to a select in the narrowest window', () => {
    expect(layoutFor({ width: TABS_WIDTH - 1, height: 600 }, on).picker).toBe('select');
    expect(layoutFor({ width: 320, height: 300 }, on).picker).toBe('select');
    expect(layoutFor({ width: 0, height: 0 }, on).picker).toBe('select');
  });
});

describe('the value and its unit', () => {
  it('share a row once there is room for both', () => {
    expect(layoutFor({ width: PAIR_ROW_WIDTH, height: 600 }, on).pairRow).toBe(true);
    expect(layoutFor({ width: PAIR_ROW_WIDTH - 1, height: 600 }, on).pairRow).toBe(false);
  });
});

describe('the recents list', () => {
  it('needs both the preference and the height', () => {
    expect(layoutFor({ width: 620, height: RECENTS_HEIGHT }, on).recents).toBe(true);
    expect(layoutFor({ width: 620, height: RECENTS_HEIGHT - 1 }, on).recents).toBe(false);
  });

  it('stays away when it has been switched off, however tall the window', () => {
    expect(layoutFor({ width: 620, height: 2160 }, { showRecents: false }).recents).toBe(false);
  });
});

describe('the window the app opens at', () => {
  it('gets tabs, a paired row and the recents list', () => {
    expect(layoutFor({ width: 620, height: 560 }, on)).toEqual({
      picker: 'tabs',
      pairRow: true,
      recents: true,
    });
  });
});

describe('the smallest window the app allows', () => {
  it('folds the sidebar away, stacks the fields and drops the recents', () => {
    expect(layoutFor({ width: 320, height: 300 }, on)).toEqual({
      picker: 'select',
      pairRow: false,
      recents: false,
    });
  });
});
