import { describe, expect, it } from 'vitest';
import { layoutFor, listWidthFor, READING_BREAKPOINT, SIDEBAR_BREAKPOINT } from './layout';

const input = {
  showSidebar: true,
  sidebarOpen: false,
  pane: 'list' as const,
  hasSelection: true,
};

describe('layoutFor', () => {
  it('shows all three panes in a wide window', () => {
    const layout = layoutFor(1200, input);
    expect(layout).toMatchObject({ sidebar: true, list: true, reading: true, back: false });
  });

  it('treats an unmeasured window as roomy so the first paint is not a fold', () => {
    expect(layoutFor(0, input).list).toBe(true);
    expect(layoutFor(0, input).reading).toBe(true);
  });

  it('honours the sidebar preference while there is a column for it', () => {
    expect(layoutFor(1200, { ...input, showSidebar: false }).sidebar).toBe(false);
  });

  it('gives the reading pane the width below the reading breakpoint', () => {
    const reading = layoutFor(READING_BREAKPOINT - 1, { ...input, pane: 'reading' });
    expect(reading).toMatchObject({ list: false, reading: true, back: true });
    const list = layoutFor(READING_BREAKPOINT - 1, { ...input, pane: 'list' });
    expect(list).toMatchObject({ list: true, reading: false, back: false });
  });

  it('stays on the list when the reading pane has nothing to show', () => {
    const layout = layoutFor(700, { ...input, pane: 'reading', hasSelection: false });
    expect(layout).toMatchObject({ list: true, reading: false, back: false });
  });

  it('keeps the sidebar in its column down to the sidebar breakpoint', () => {
    expect(layoutFor(SIDEBAR_BREAKPOINT, input).sidebar).toBe(true);
    expect(layoutFor(SIDEBAR_BREAKPOINT - 1, input).sidebar).toBe(false);
  });

  it('folds the sidebar into a panel over the content below it', () => {
    const closed = layoutFor(500, input);
    expect(closed).toMatchObject({ sidebar: false, sidebarOverlay: false });
    const open = layoutFor(500, { ...input, sidebarOpen: true });
    expect(open).toMatchObject({ sidebar: false, sidebarOverlay: true });
  });

  it('never opens the overlay while the sidebar has a column', () => {
    expect(layoutFor(1200, { ...input, sidebarOpen: true }).sidebarOverlay).toBe(false);
  });

  it('lets the list fill the window once it is the only pane', () => {
    expect(layoutFor(1200, input).listFills).toBe(false);
    expect(layoutFor(700, input).listFills).toBe(true);
  });
});

describe('listWidthFor', () => {
  it('narrows the list in a tight window and holds it in a wide one', () => {
    expect(listWidthFor(1000)).toBeLessThan(listWidthFor(1600));
    expect(listWidthFor(0)).toBe(listWidthFor(1600));
  });
});
