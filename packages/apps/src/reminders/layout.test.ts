import { describe, expect, it } from 'vitest';
import { COMPACT_BREAKPOINT, LIST_NAME_BREAKPOINT, layoutFor, SIDEBAR_BREAKPOINT } from './layout';

describe('layoutFor', () => {
  it('folds the sidebar away on a narrow window', () => {
    expect(layoutFor(SIDEBAR_BREAKPOINT, { showSidebar: true })).toMatchObject({
      sidebar: true,
      sidebarFits: true,
    });
    expect(layoutFor(SIDEBAR_BREAKPOINT - 1, { showSidebar: true })).toMatchObject({
      sidebar: false,
      sidebarFits: false,
    });
  });

  it('keeps it hidden when the user hid it, however wide the window', () => {
    expect(layoutFor(2400, { showSidebar: false })).toMatchObject({
      sidebar: false,
      sidebarFits: true,
    });
  });

  it('drops the row detail and tightens the toolbar as the window narrows', () => {
    const wide = layoutFor(880, { showSidebar: true });
    expect([wide.listNames, wide.compact]).toEqual([true, false]);
    const mid = layoutFor(COMPACT_BREAKPOINT - 1, { showSidebar: true });
    expect([mid.listNames, mid.compact]).toEqual([true, true]);
    const narrow = layoutFor(LIST_NAME_BREAKPOINT - 1, { showSidebar: true });
    expect([narrow.listNames, narrow.compact]).toEqual([false, true]);
  });

  it('survives a window that has not been measured yet', () => {
    expect(layoutFor(0, { showSidebar: true })).toEqual({
      sidebar: false,
      sidebarFits: false,
      listNames: false,
      compact: true,
    });
  });
});
