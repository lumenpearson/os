import { describe, expect, it } from 'vitest';
import { PRESETS } from './difficulty';
import { DEFAULT_CELL, fieldSize, fitCell, MAX_CELL, MIN_CELL } from './layout';

describe('fitCell', () => {
  it('fits Expert in the default window without scrolling', () => {
    // 560×620 window, less the toolbar, the status bar and the padding.
    const cell = fitCell({ width: 536, height: 528 }, PRESETS.expert);
    expect(cell).toBeGreaterThanOrEqual(MIN_CELL);
    expect(fieldSize(PRESETS.expert, cell).width).toBeLessThanOrEqual(536);
    expect(fieldSize(PRESETS.expert, cell).height).toBeLessThanOrEqual(528);
  });

  it('grows a small board up to the ceiling', () => {
    expect(fitCell({ width: 536, height: 528 }, PRESETS.beginner)).toBe(MAX_CELL);
  });

  it('takes whichever side runs out first', () => {
    expect(fitCell({ width: 1000, height: 200 }, PRESETS.beginner)).toBe(21);
    expect(fitCell({ width: 200, height: 1000 }, PRESETS.beginner)).toBe(21);
  });

  it('stops at the floor and lets the field overflow instead', () => {
    const cell = fitCell({ width: 120, height: 120 }, PRESETS.expert);
    expect(cell).toBe(MIN_CELL);
    expect(fieldSize(PRESETS.expert, cell).width).toBeGreaterThan(120);
  });

  it('falls back to a default before the field is measured', () => {
    expect(fitCell({ width: 0, height: 0 }, PRESETS.beginner)).toBe(DEFAULT_CELL);
    expect(fitCell({ width: Number.NaN, height: 400 }, PRESETS.beginner)).toBe(DEFAULT_CELL);
  });

  it('always returns whole pixels', () => {
    for (let width = 100; width < 900; width += 7) {
      expect(Number.isInteger(fitCell({ width, height: 500 }, PRESETS.intermediate))).toBe(true);
    }
  });
});

describe('fieldSize', () => {
  it('counts the hairline between cells', () => {
    expect(fieldSize({ width: 9, height: 9, mines: 10 }, 20)).toEqual({ width: 188, height: 188 });
  });
});
