import { describe, expect, it } from 'vitest';
import { indexAt, SIZE } from './board';
import {
  type Area,
  DEFAULT_BOARD,
  fitBoard,
  MAX_BOARD,
  MIN_BOARD,
  offsetOf,
  tileBand,
  tileFontSize,
} from './layout';

const area = (width: number, height: number): Area => ({ width, height });

describe('fitBoard', () => {
  it('takes the smaller measurement, so the board stays square', () => {
    expect(fitBoard(area(900, 400)).size).toBeLessThanOrEqual(400);
    expect(fitBoard(area(300, 900)).size).toBeLessThanOrEqual(300);
  });

  it('adds up: four cells and five gaps make the size', () => {
    for (const side of [MIN_BOARD, 320, 460, 700, 4000]) {
      const layout = fitBoard(area(side, side));
      expect(layout.cell * SIZE + layout.gap * (SIZE + 1)).toBe(layout.size);
    }
  });

  it('never leaves a fractional cell', () => {
    for (const side of [321, 457, 619, 1001]) {
      const layout = fitBoard(area(side, side));
      expect(Number.isInteger(layout.cell)).toBe(true);
      expect(Number.isInteger(layout.gap)).toBe(true);
    }
  });

  it('stops growing on a 4K window', () => {
    expect(fitBoard(area(3840, 2160)).size).toBeLessThanOrEqual(MAX_BOARD);
  });

  it('stops shrinking below the readable floor', () => {
    expect(fitBoard(area(40, 40)).size).toBeGreaterThanOrEqual(MIN_BOARD - SIZE);
    expect(fitBoard(area(0, 0)).cell).toBeGreaterThan(0);
  });

  it('falls back to a default before anything is measured', () => {
    expect(fitBoard(area(Number.NaN, Number.NaN)).size).toBeLessThanOrEqual(DEFAULT_BOARD);
  });

  it('nests the tile radius inside the board radius', () => {
    const layout = fitBoard(area(460, 460));
    expect(layout.tileRadius).toBeLessThanOrEqual(layout.radius);
    expect(layout.tileRadius).toBeGreaterThanOrEqual(2);
  });
});

describe('offsetOf', () => {
  const layout = fitBoard(area(460, 460));

  it('puts the first cell one gap in from the corner', () => {
    expect(offsetOf(0, layout)).toEqual({ x: layout.gap, y: layout.gap });
  });

  it('steps by one cell plus one gap', () => {
    const step = layout.cell + layout.gap;
    expect(offsetOf(indexAt(1, 0), layout).x - offsetOf(0, layout).x).toBe(step);
    expect(offsetOf(indexAt(0, 1), layout).y - offsetOf(0, layout).y).toBe(step);
  });

  it('leaves the last cell one gap from the far edge', () => {
    const last = offsetOf(indexAt(SIZE - 1, SIZE - 1), layout);
    expect(last.x + layout.cell + layout.gap).toBe(layout.size);
    expect(last.y + layout.cell + layout.gap).toBe(layout.size);
  });
});

describe('tileFontSize', () => {
  it('sets a longer number smaller so it still fits', () => {
    const cell = 100;
    expect(tileFontSize(cell, 2)).toBeGreaterThan(tileFontSize(cell, 128));
    expect(tileFontSize(cell, 128)).toBeGreaterThan(tileFontSize(cell, 2048));
    expect(tileFontSize(cell, 2048)).toBeGreaterThan(tileFontSize(cell, 65_536));
  });

  it('sets two-digit values the same as one', () => {
    expect(tileFontSize(100, 2)).toBe(tileFontSize(100, 64));
  });

  it('stays legible on a small board', () => {
    expect(tileFontSize(30, 2048)).toBeGreaterThanOrEqual(9);
  });
});

describe('tileBand', () => {
  it('climbs one step at a time and stops at the accent', () => {
    expect([2, 4].map(tileBand)).toEqual([0, 0]);
    expect([8, 16, 32].map(tileBand)).toEqual([1, 1, 1]);
    expect([64, 128, 256].map(tileBand)).toEqual([2, 2, 2]);
    expect([512, 1024].map(tileBand)).toEqual([3, 3]);
    expect([2048, 4096, 65_536].map(tileBand)).toEqual([4, 4, 4]);
  });

  it('never goes down as the value goes up', () => {
    let previous = -1;
    for (let value = 2; value <= 65_536; value *= 2) {
      const band = tileBand(value);
      expect(band).toBeGreaterThanOrEqual(previous);
      previous = band;
    }
  });
});
