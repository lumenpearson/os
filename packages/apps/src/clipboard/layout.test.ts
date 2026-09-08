import { describe, expect, it } from 'vitest';
import { layoutFor, SPLIT_WIDTH } from './layout';

describe('what fits in the window', () => {
  it('puts the detail beside the list from the split width up', () => {
    expect(layoutFor({ width: SPLIT_WIDTH - 1, height: 520 }).split).toBe(false);
    expect(layoutFor({ width: SPLIT_WIDTH, height: 520 }).split).toBe(true);
  });

  it('gives the list a share of a wide window, within bounds', () => {
    expect(layoutFor({ width: 760, height: 520 }).listWidth).toBe(289);
    expect(layoutFor({ width: 2400, height: 1400 }).listWidth).toBe(340);
    expect(layoutFor({ width: 600, height: 400 }).listWidth).toBe(240);
  });

  it('leaves the stacked detail readable in the shortest window it claims', () => {
    const short = layoutFor({ width: 380, height: 320 });
    expect(short.split).toBe(false);
    expect(short.detailHeight).toBeGreaterThanOrEqual(104);
    // The toolbar and the status bar take about 60 px between them; the list
    // has to keep the rest of a 320 px window.
    expect(short.detailHeight).toBeLessThanOrEqual(160);
  });

  it('assumes the size the shell opened it at until the observer has run', () => {
    expect(layoutFor({ width: 0, height: 0 }).split).toBe(true);
  });
});
