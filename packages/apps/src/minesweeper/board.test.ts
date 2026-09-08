import { describe, expect, it } from 'vitest';
import {
  cellCount,
  columnOf,
  countAdjacent,
  emptyBoard,
  generateBoard,
  indexAt,
  neighbours,
  rowOf,
  safeZone,
} from './board';
import { PRESETS } from './difficulty';
import { createRng } from './rng';

const beginner = PRESETS.beginner;

describe('coordinates', () => {
  it('convert both ways', () => {
    expect(indexAt(9, 3, 4)).toBe(39);
    expect(columnOf(9, 39)).toBe(3);
    expect(rowOf(9, 39)).toBe(4);
    expect(cellCount({ width: 30, height: 16, mines: 99 })).toBe(480);
  });
});

describe('neighbours', () => {
  it('are eight in the middle', () => {
    expect(neighbours(9, 9, indexAt(9, 4, 4)).sort((a, b) => a - b)).toEqual(
      [
        indexAt(9, 3, 3),
        indexAt(9, 4, 3),
        indexAt(9, 5, 3),
        indexAt(9, 3, 4),
        indexAt(9, 5, 4),
        indexAt(9, 3, 5),
        indexAt(9, 4, 5),
        indexAt(9, 5, 5),
      ].sort((a, b) => a - b),
    );
  });

  it('are three in a corner and five on an edge', () => {
    expect(neighbours(9, 9, 0)).toHaveLength(3);
    expect(neighbours(9, 9, 80)).toHaveLength(3);
    expect(neighbours(9, 9, indexAt(9, 4, 0))).toHaveLength(5);
  });

  it('never wrap around a row', () => {
    for (const n of neighbours(9, 9, indexAt(9, 0, 4))) {
      expect(columnOf(9, n)).toBeLessThanOrEqual(1);
    }
    for (const n of neighbours(9, 9, indexAt(9, 8, 4))) {
      expect(columnOf(9, n)).toBeGreaterThanOrEqual(7);
    }
  });

  it('are symmetric', () => {
    for (let index = 0; index < 81; index += 1) {
      for (const n of neighbours(9, 9, index)) {
        expect(neighbours(9, 9, n)).toContain(index);
      }
    }
  });
});

describe('safeZone', () => {
  it('is the cell plus its neighbours', () => {
    expect(safeZone(9, 9, indexAt(9, 4, 4))).toHaveLength(9);
    expect(safeZone(9, 9, 0)).toHaveLength(4);
    expect(safeZone(9, 9, 0)).toContain(0);
  });
});

describe('emptyBoard', () => {
  it('has nothing placed, so nothing about the first click is decided', () => {
    const board = emptyBoard(beginner);
    expect(board.mines).toBe(0);
    expect(board.mine).toHaveLength(81);
    expect(board.mine.some(Boolean)).toBe(false);
    expect(board.adjacent.every((n) => n === 0)).toBe(true);
  });
});

describe('generateBoard', () => {
  it('is reproducible from the seed', () => {
    const a = generateBoard(beginner, 40, createRng(2024));
    const b = generateBoard(beginner, 40, createRng(2024));
    expect(a.mine).toEqual(b.mine);
  });

  it('places exactly the requested number of mines, whatever the seed', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const board = generateBoard(beginner, seed % 81, createRng(seed));
      expect(board.mine.filter(Boolean)).toHaveLength(beginner.mines);
      expect(board.mines).toBe(beginner.mines);
    }
  });

  it('never puts a mine in the safe neighbourhood, wherever the first click lands', () => {
    for (let first = 0; first < 81; first += 1) {
      const board = generateBoard(beginner, first, createRng(first * 7 + 1));
      for (const index of safeZone(9, 9, first)) {
        expect(board.mine[index]).toBe(false);
      }
    }
  });

  it('keeps the invariants on the largest preset', () => {
    const expert = PRESETS.expert;
    const board = generateBoard(expert, indexAt(expert.width, 0, 0), createRng(9));
    expect(board.mine.filter(Boolean)).toHaveLength(99);
    expect(board.mine).toHaveLength(480);
    for (const index of safeZone(expert.width, expert.height, 0)) {
      expect(board.mine[index]).toBe(false);
    }
  });

  it('leaves the first cell with no adjacent mines, so it always opens a region', () => {
    for (let first = 0; first < 81; first += 1) {
      const board = generateBoard(beginner, first, createRng(first + 500));
      expect(board.adjacent[first]).toBe(0);
    }
  });

  it('drops mines it cannot place rather than looping for ever', () => {
    const board = generateBoard({ width: 5, height: 5, mines: 999 }, 12, createRng(1));
    expect(board.mines).toBe(25 - 9);
    expect(board.mine.filter(Boolean)).toHaveLength(16);
  });

  it('counts adjacency to match the placement', () => {
    const board = generateBoard(beginner, 40, createRng(77));
    for (let index = 0; index < 81; index += 1) {
      const around = neighbours(9, 9, index).filter((n) => board.mine[n] === true).length;
      expect(board.adjacent[index]).toBe(around);
    }
  });
});

describe('countAdjacent', () => {
  it('counts each neighbouring mine once', () => {
    //  . * .
    //  * . *
    //  . * .
    const mine = [false, true, false, true, false, true, false, true, false];
    expect(countAdjacent(3, 3, mine)).toEqual([2, 2, 2, 2, 4, 2, 2, 2, 2]);
  });

  it('is all zeroes on an empty field', () => {
    expect(countAdjacent(3, 3, new Array<boolean>(9).fill(false)).every((n) => n === 0)).toBe(true);
  });
});
