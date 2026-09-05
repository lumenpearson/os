import { describe, expect, it } from 'vitest';
import { boardSize, CHROME, DEFAULT_CELL, fitCell, MAX_CELL, MIN_CELL, padBeside } from './layout';

describe('fitCell', () => {
  it('takes the smaller side, since the board is square', () => {
    const wide = fitCell({ width: 900, height: 400 });
    const tall = fitCell({ width: 400, height: 900 });
    expect(wide).toBe(tall);
    expect(boardSize(wide)).toBeLessThanOrEqual(400);
  });

  it('returns whole pixels', () => {
    for (const side of [301, 457, 613, 999]) {
      expect(Number.isInteger(fitCell({ width: side, height: side }))).toBe(true);
    }
  });

  it('fits the board inside the space it was given', () => {
    for (let side = MIN_CELL * 9 + CHROME; side < 1200; side += 7) {
      expect(boardSize(fitCell({ width: side, height: side }))).toBeLessThanOrEqual(side);
    }
  });

  it('stops shrinking at the floor, and lets the container scroll instead', () => {
    expect(fitCell({ width: 120, height: 120 })).toBe(MIN_CELL);
    expect(boardSize(MIN_CELL)).toBeGreaterThan(120);
  });

  it('stops growing at the ceiling', () => {
    expect(fitCell({ width: 4000, height: 3000 })).toBe(MAX_CELL);
  });

  it('uses the default before anything has been measured', () => {
    expect(fitCell({ width: 0, height: 0 })).toBe(DEFAULT_CELL);
    expect(fitCell({ width: 600, height: 0 })).toBe(DEFAULT_CELL);
  });
});

describe('boardSize', () => {
  it('counts the hairlines, the box rules and the border', () => {
    expect(boardSize(40)).toBe(40 * 9 + CHROME);
    expect(CHROME).toBe(14);
  });
});

describe('padBeside', () => {
  it('puts the pad beside the board only when the window is wide', () => {
    expect(padBeside(340)).toBe(false);
    expect(padBeside(620)).toBe(false);
    expect(padBeside(700)).toBe(true);
    expect(padBeside(1920)).toBe(true);
  });
});
