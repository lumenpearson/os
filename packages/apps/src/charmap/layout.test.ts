import { describe, expect, it } from 'vitest';
import { layoutFor } from './layout';

const shown = { showSidebar: true };

describe('layoutFor', () => {
  it('gives a wide window the sidebar, the detail column and one toolbar row', () => {
    expect(layoutFor({ width: 1600, height: 1000 }, shown)).toEqual({
      blocks: 'sidebar',
      details: 'panel',
      search: 'toolbar',
      stripDetail: true,
    });
  });

  it('folds the sidebar away first', () => {
    const layout = layoutFor({ width: 700, height: 620 }, shown);
    expect(layout.blocks).toBe('select');
    expect(layout.details).toBe('panel');
  });

  it('drops the detail column before the search row', () => {
    expect(layoutFor({ width: 640, height: 300 }, shown).details).toBe('strip');
    expect(layoutFor({ width: 640, height: 300 }, shown).search).toBe('toolbar');
  });

  it('gives the smallest window a search row and a detail strip', () => {
    expect(layoutFor({ width: 380, height: 340 }, shown)).toEqual({
      blocks: 'select',
      details: 'strip',
      search: 'row',
      stripDetail: false,
    });
  });

  it('honours the preference: the sidebar is off even when it would fit', () => {
    expect(layoutFor({ width: 1600, height: 1000 }, { showSidebar: false }).blocks).toBe('select');
  });

  it('reads the window, not the display: a wide but short window has no panel', () => {
    expect(layoutFor({ width: 1600, height: 320 }, shown).details).toBe('strip');
  });
});
