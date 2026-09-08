import { describe, expect, it } from 'vitest';
import { layoutFor, SIDEBAR_WIDTH, visiblePane } from './layout';

const wide = { width: 1200, height: 800 };
const narrow = { width: 380, height: 320 };

describe('layoutFor', () => {
  it('shows everything in a wide window', () => {
    expect(layoutFor(wide, { showGroups: true })).toEqual({
      split: true,
      sidebar: true,
      canSidebar: true,
      rail: true,
      listWidth: 360,
    });
  });

  it('honours the preference to hide the groups sidebar', () => {
    const layout = layoutFor(wide, { showGroups: false });
    expect(layout.sidebar).toBe(false);
    // The room is there; only the preference is not.
    expect(layout.canSidebar).toBe(true);
  });

  it('drops the sidebar first as the window narrows', () => {
    const layout = layoutFor({ width: 700, height: 800 }, { showGroups: true });
    expect(layout.sidebar).toBe(false);
    expect(layout.canSidebar).toBe(false);
    expect(layout.split).toBe(true);
  });

  it('drops the rail before the detail pane', () => {
    const layout = layoutFor({ width: 640, height: 300 }, { showGroups: true });
    expect(layout.rail).toBe(false);
    expect(layout.split).toBe(true);
  });

  it('folds to one pane at the smallest window the app declares', () => {
    const layout = layoutFor(narrow, { showGroups: true });
    expect(layout).toEqual({
      split: false,
      sidebar: false,
      canSidebar: false,
      rail: false,
      listWidth: 380,
    });
  });

  it('needs the height for 27 letters before it draws the rail', () => {
    expect(layoutFor({ width: 900, height: 419 }, { showGroups: true }).rail).toBe(false);
    expect(layoutFor({ width: 900, height: 420 }, { showGroups: true }).rail).toBe(true);
  });

  it('keeps the list column between its two bounds', () => {
    expect(layoutFor({ width: 620, height: 800 }, { showGroups: false }).listWidth).toBe(260);
    expect(layoutFor({ width: 4000, height: 2000 }, { showGroups: false }).listWidth).toBe(360);
  });

  it('assumes room before the window has been measured', () => {
    const layout = layoutFor({ width: 0, height: 0 }, { showGroups: true });
    expect(layout.split).toBe(true);
    expect(layout.sidebar).toBe(true);
  });

  it('reserves a fixed width for the sidebar', () => {
    expect(SIDEBAR_WIDTH).toBeGreaterThan(0);
  });
});

describe('visiblePane', () => {
  const split = layoutFor(wide, { showGroups: true });
  const folded = layoutFor(narrow, { showGroups: true });

  it('always shows the list while both panes fit', () => {
    expect(visiblePane(split, 'detail', true)).toBe('list');
  });

  it('shows the detail on a folded window once something is selected', () => {
    expect(visiblePane(folded, 'detail', true)).toBe('detail');
  });

  it('falls back to the list when nothing is selected', () => {
    expect(visiblePane(folded, 'detail', false)).toBe('list');
    expect(visiblePane(folded, 'list', true)).toBe('list');
  });
});
