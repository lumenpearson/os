import { describe, expect, it } from 'vitest';
import { SQUARE_COUNT, squareFrom, squareName } from './board';
import {
  boardOrder,
  cellCentre,
  homeSquare,
  screenCell,
  screenIndex,
  showsFile,
  showsRank,
  squareAtIndex,
  squareFromPoint,
  stepSquare,
} from './layout';

const sq = (name: string) => squareFrom(name);

describe('where a square is drawn', () => {
  it('draws White at the bottom, a8 in the corner it is printed in', () => {
    expect(screenCell(sq('a8'), false)).toEqual({ row: 0, column: 0 });
    expect(screenCell(sq('h8'), false)).toEqual({ row: 0, column: 7 });
    expect(screenCell(sq('a1'), false)).toEqual({ row: 7, column: 0 });
    expect(screenCell(sq('h1'), false)).toEqual({ row: 7, column: 7 });
  });

  it('turns the board through a half-turn when it is flipped', () => {
    expect(screenCell(sq('h1'), true)).toEqual({ row: 0, column: 0 });
    expect(screenCell(sq('a8'), true)).toEqual({ row: 7, column: 7 });
    expect(screenCell(sq('e1'), true)).toEqual({ row: 0, column: 3 });
  });

  it('is a mirror of itself: flipping twice is not flipping at all', () => {
    for (let square = 0; square < SQUARE_COUNT; square += 1) {
      expect(screenIndex(screenIndex(square, true), true)).toBe(square);
      expect(screenIndex(square, false)).toBe(square);
    }
  });

  it('reads back the square it put in a cell', () => {
    for (const flipped of [false, true]) {
      for (let square = 0; square < SQUARE_COUNT; square += 1) {
        expect(squareAtIndex(screenIndex(square, flipped), flipped)).toBe(square);
      }
    }
  });

  it('has nothing to say about a square that is not one', () => {
    expect(screenIndex(-1, false)).toBe(-1);
    expect(screenIndex(64, true)).toBe(-1);
    expect(squareAtIndex(64, false)).toBe(-1);
    expect(squareAtIndex(-1, false)).toBe(-1);
    expect(screenCell(99, false)).toEqual({ row: -1, column: -1 });
  });

  it('draws every square once, in the order the grid fills', () => {
    for (const flipped of [false, true]) {
      const order = boardOrder(flipped);
      expect(order).toHaveLength(SQUARE_COUNT);
      expect(new Set(order).size).toBe(SQUARE_COUNT);
      order.forEach((square, index) => {
        expect(screenIndex(square, flipped)).toBe(index);
      });
    }
    expect(squareName(boardOrder(false)[0] as number)).toBe('a8');
    expect(squareName(boardOrder(true)[0] as number)).toBe('h1');
  });
});

describe('a point on the board', () => {
  const size = 40;

  it('names the square the pointer is over, either way round', () => {
    expect(squareFromPoint(4, 4, size, false)).toBe(sq('a8'));
    expect(squareFromPoint(4, 4, size, true)).toBe(sq('h1'));
    // Fourth column, fifth row: d4 on an unflipped board.
    expect(squareFromPoint(3.5 * size, 4.5 * size, size, false)).toBe(sq('d4'));
    expect(squareFromPoint(3.5 * size, 4.5 * size, size, true)).toBe(sq('e5'));
  });

  it('refuses a point outside the board rather than clamping onto an edge square', () => {
    expect(squareFromPoint(-1, 10, size, false)).toBe(-1);
    expect(squareFromPoint(10, -1, size, false)).toBe(-1);
    expect(squareFromPoint(8 * size, 10, size, false)).toBe(-1);
    expect(squareFromPoint(10, 8 * size, size, false)).toBe(-1);
    expect(squareFromPoint(10, 10, 0, false)).toBe(-1);
  });

  it('puts the centre of a square back in the middle of its own cell', () => {
    for (const flipped of [false, true]) {
      for (let square = 0; square < SQUARE_COUNT; square += 1) {
        const { x, y } = cellCentre(square, flipped, size);
        expect(squareFromPoint(x, y, size, flipped)).toBe(square);
      }
    }
  });
});

describe('the coordinates on the edge', () => {
  it('writes files along the bottom and ranks up the left, as drawn', () => {
    expect(showsFile(sq('e1'), false)).toBe(true);
    expect(showsFile(sq('e2'), false)).toBe(false);
    expect(showsRank(sq('a4'), false)).toBe(true);
    expect(showsRank(sq('b4'), false)).toBe(false);
  });

  it('follows the board round when it is flipped', () => {
    expect(showsFile(sq('e8'), true)).toBe(true);
    expect(showsFile(sq('e1'), true)).toBe(false);
    expect(showsRank(sq('h4'), true)).toBe(true);
    expect(showsRank(sq('a4'), true)).toBe(false);
  });

  it('marks eight of each, whichever way the board faces', () => {
    for (const flipped of [false, true]) {
      const squares = boardOrder(flipped);
      expect(squares.filter((s) => showsFile(s, flipped))).toHaveLength(8);
      expect(squares.filter((s) => showsRank(s, flipped))).toHaveLength(8);
    }
  });
});

describe('walking the board with the arrow keys', () => {
  it('moves the way the arrow points on screen', () => {
    expect(squareName(stepSquare(sq('d4'), 'ArrowRight', false))).toBe('e4');
    expect(squareName(stepSquare(sq('d4'), 'ArrowUp', false))).toBe('d5');
    expect(squareName(stepSquare(sq('d4'), 'ArrowRight', true))).toBe('c4');
    expect(squareName(stepSquare(sq('d4'), 'ArrowUp', true))).toBe('d3');
  });

  it('holds at the edge instead of wrapping to the other side', () => {
    expect(stepSquare(sq('a1'), 'ArrowLeft', false)).toBe(sq('a1'));
    expect(stepSquare(sq('a1'), 'ArrowDown', false)).toBe(sq('a1'));
    expect(stepSquare(sq('a1'), 'ArrowRight', true)).toBe(sq('a1'));
    expect(stepSquare(sq('h8'), 'ArrowRight', false)).toBe(sq('h8'));
  });

  it('leaves the cursor alone for any other key', () => {
    expect(stepSquare(sq('d4'), 'Enter', false)).toBe(sq('d4'));
    expect(stepSquare(sq('d4'), 'a', false)).toBe(sq('d4'));
  });

  it('starts the cursor on the near king, whichever side is at the bottom', () => {
    expect(squareName(homeSquare(false))).toBe('e1');
    expect(squareName(homeSquare(true))).toBe('e8');
  });
});
