import { describe, expect, it } from 'vitest';
import { shortName } from './cards';
import { hand, pile } from './fixture';
import {
  CARD_RATIO,
  columnLeft,
  fanStep,
  fitTable,
  MAX_CARD_WIDTH,
  MIN_CARD_WIDTH,
  pileHeight,
  spotsWidth,
  tableauSpots,
  wasteSpots,
} from './layout';

describe('fitTable', () => {
  it('fits seven columns and their gaps inside the width it is given', () => {
    for (const width of [420, 560, 900, 1440, 2200]) {
      const m = fitTable({ width, height: 600 });
      expect(m.width).toBeLessThanOrEqual(width);
    }
  });

  it('grows the cards with the window until they reach the ceiling', () => {
    const small = fitTable({ width: 480, height: 600 });
    const large = fitTable({ width: 1200, height: 900 });
    expect(large.cardWidth).toBeGreaterThan(small.cardWidth);
    expect(fitTable({ width: 4000, height: 2000 }).cardWidth).toBe(MAX_CARD_WIDTH);
  });

  it('stops shrinking at the floor, so a narrow window scrolls instead', () => {
    const tiny = fitTable({ width: 200, height: 300 });
    expect(tiny.cardWidth).toBe(MIN_CARD_WIDTH);
    expect(tiny.width).toBeGreaterThan(200);
  });

  it('keeps the shape of a playing card', () => {
    const m = fitTable({ width: 900, height: 660 });
    expect(m.cardHeight / m.cardWidth).toBeCloseTo(CARD_RATIO, 1);
  });

  it('gives whole pixels, so the hairlines stay hairlines', () => {
    const m = fitTable({ width: 913, height: 661 });
    for (const value of [m.cardWidth, m.cardHeight, m.gap, m.upStep, m.downStep, m.width]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('falls back to a usable size before the window has been measured', () => {
    const m = fitTable({ width: 0, height: 0 });
    expect(m.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_WIDTH);
    expect(m.cardWidth).toBeLessThanOrEqual(MAX_CARD_WIDTH);
    expect(fitTable({ width: Number.NaN, height: 10 }).cardWidth).toBeGreaterThan(0);
  });

  it('puts the tableau below the top row', () => {
    const m = fitTable({ width: 900, height: 660 });
    expect(m.tableauTop).toBeGreaterThan(m.cardHeight);
  });
});

describe('columnLeft', () => {
  it('steps one card and one gap at a time', () => {
    const m = fitTable({ width: 900, height: 660 });
    expect(columnLeft(0, m)).toBe(0);
    expect(columnLeft(1, m)).toBe(m.cardWidth + m.gap);
    expect(columnLeft(6, m) + m.cardWidth).toBe(m.width);
  });
});

describe('pileHeight', () => {
  const m = fitTable({ width: 900, height: 660 });

  it('is one card tall when the pile is empty or holds one card', () => {
    expect(pileHeight(0, 0, m.upStep, m)).toBe(m.cardHeight);
    expect(pileHeight(0, 1, m.upStep, m)).toBe(m.cardHeight);
  });

  it('adds a step for every card after the first', () => {
    expect(pileHeight(0, 3, m.upStep, m)).toBe(m.cardHeight + 2 * m.upStep);
    expect(pileHeight(2, 1, m.upStep, m)).toBe(m.cardHeight + 2 * m.downStep);
  });
});

describe('fanStep', () => {
  const m = fitTable({ width: 900, height: 660 });

  it('opens the fan fully when the column has room', () => {
    expect(fanStep(0, 3, 2000, m)).toBe(m.upStep);
    expect(fanStep(0, 1, 10, m)).toBe(m.upStep);
  });

  it('squares the pile up to fit the room it has', () => {
    // Room for eleven cards at a step between the open fan and the floor.
    const wanted = Math.round((m.upStep + m.minStep) / 2);
    const room = pileHeight(0, 11, wanted, m);
    const step = fanStep(0, 11, room, m);
    expect(step).toBe(wanted);
    expect(step).toBeLessThan(m.upStep);
    expect(step).toBeGreaterThan(m.minStep);
    expect(pileHeight(0, 11, step, m)).toBeLessThanOrEqual(room);
  });

  it('stops squaring up at the point a card shows nothing of itself', () => {
    expect(fanStep(6, 13, 100, m)).toBe(m.minStep);
  });

  it('leaves the fan alone when the room is not known yet', () => {
    expect(fanStep(0, 5, 0, m)).toBe(m.upStep);
    expect(fanStep(0, 5, Number.NaN, m)).toBe(m.upStep);
  });
});

describe('tableauSpots', () => {
  const m = fitTable({ width: 900, height: 660 });

  it('stacks the face-down cards tight and fans the face-up ones', () => {
    const spots = tableauSpots(pile('7D 5H', '3S 2H'), m.upStep, m);
    expect(spots.map((s) => s.y)).toEqual([
      0,
      m.downStep,
      2 * m.downStep,
      2 * m.downStep + m.upStep,
    ]);
    expect(spots.map((s) => s.faceUp)).toEqual([false, false, true, true]);
  });

  it('says how many cards each one would carry, and that a face-down card carries none', () => {
    const spots = tableauSpots(pile('7D', 'KS QH JC'), m.upStep, m);
    expect(spots.map((s) => s.count)).toEqual([0, 3, 2, 1]);
  });

  it('draws an empty column as nothing at all', () => {
    expect(tableauSpots(pile('', ''), m.upStep, m)).toEqual([]);
  });
});

describe('wasteSpots', () => {
  const m = fitTable({ width: 900, height: 660 });

  it('shows one card when one is turned', () => {
    const spots = wasteSpots(hand('2C 3C 4C'), 1, m);
    expect(spots).toHaveLength(1);
    expect(spots[0]?.count).toBe(1);
    expect(spots[0]?.x).toBe(0);
  });

  it('shows the last three fanned when three are turned, and plays only the top', () => {
    const spots = wasteSpots(hand('2C 3C 4C 5C'), 3, m);
    expect(spots.map((s) => shortName(s.card))).toEqual(['3♣', '4♣', '5♣']);
    expect(spots.map((s) => s.x)).toEqual([0, m.wasteStep, 2 * m.wasteStep]);
    expect(spots.map((s) => s.count)).toEqual([0, 0, 1]);
  });

  it('shows what there is when there are fewer than three', () => {
    expect(wasteSpots(hand('2C'), 3, m)).toHaveLength(1);
    expect(wasteSpots(hand(''), 3, m)).toEqual([]);
  });

  it('measures the width a fanned pile needs', () => {
    const spots = wasteSpots(hand('2C 3C 4C'), 3, m);
    expect(spotsWidth(spots, m)).toBe(m.cardWidth + 2 * m.wasteStep);
    expect(spotsWidth([], m)).toBe(m.cardWidth);
  });
});
