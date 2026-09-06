/**
 * Where a square is drawn.
 *
 * The board array runs a8 first and h1 last, so an unflipped board draws the
 * squares in their own order and a flipped board draws them backwards: turning
 * a board round is a half-turn, and a half-turn reverses the list. Everything
 * else here follows from that one fact.
 *
 * It lives apart from the component because three things have to agree about
 * where a square is — the grid, the arrow keys and the square a piece is
 * dropped on — and agreeing is easier to test than to review.
 */

import { BOARD_SIZE, fileOf, isSquare, rankOf, SQUARE_COUNT, squareAt } from './board';

/** Where a square lands on screen: 0 is the top-left cell, 63 the bottom-right. */
export function screenIndex(square: number, flipped: boolean): number {
  if (!isSquare(square)) return -1;
  return flipped ? SQUARE_COUNT - 1 - square : square;
}

/** Which square is drawn at a screen cell, or −1 when the cell is off the board. */
export function squareAtIndex(index: number, flipped: boolean): number {
  if (!Number.isInteger(index) || index < 0 || index >= SQUARE_COUNT) return -1;
  return flipped ? SQUARE_COUNT - 1 - index : index;
}

/** The squares in the order the grid draws them. */
export function boardOrder(flipped: boolean): number[] {
  const order: number[] = [];
  for (let index = 0; index < SQUARE_COUNT; index += 1) order.push(squareAtIndex(index, flipped));
  return order;
}

export interface Cell {
  /** 0 is the top row as drawn. */
  row: number;
  /** 0 is the left column as drawn. */
  column: number;
}

export function screenCell(square: number, flipped: boolean): Cell {
  const index = screenIndex(square, flipped);
  if (index < 0) return { row: -1, column: -1 };
  return { row: Math.floor(index / BOARD_SIZE), column: index % BOARD_SIZE };
}

/** The centre of a square in pixels from the board's top-left corner. */
export function cellCentre(
  square: number,
  flipped: boolean,
  size: number,
): { x: number; y: number } {
  const { row, column } = screenCell(square, flipped);
  return { x: (column + 0.5) * size, y: (row + 0.5) * size };
}

/** The square under a point measured from the board's top-left corner; −1 outside it. */
export function squareFromPoint(x: number, y: number, size: number, flipped: boolean): number {
  if (!(size > 0)) return -1;
  const column = Math.floor(x / size);
  const row = Math.floor(y / size);
  if (column < 0 || column >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return -1;
  return squareAtIndex(row * BOARD_SIZE + column, flipped);
}

/** A file letter goes on the bottom row of the board as drawn, a rank number on the left. */
export const showsFile = (square: number, flipped: boolean): boolean =>
  screenCell(square, flipped).row === BOARD_SIZE - 1;

export const showsRank = (square: number, flipped: boolean): boolean =>
  screenCell(square, flipped).column === 0;

/**
 * The square an arrow key moves to, in the direction it points on screen
 * rather than on the board. Any other key leaves the cursor where it is, and
 * the edges hold rather than wrap.
 */
export function stepSquare(square: number, key: string, flipped: boolean): number {
  if (!isSquare(square)) return square;
  const steps: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };
  const step = steps[key];
  if (!step) return square;
  const turn = flipped ? -1 : 1;
  const file = clamp(fileOf(square) + step[0] * turn);
  const rank = clamp(rankOf(square) + step[1] * turn);
  const next = squareAt(file, rank);
  return next < 0 ? square : next;
}

const clamp = (value: number): number => Math.min(BOARD_SIZE - 1, Math.max(0, value));

/** The square the cursor starts on: the near king's square for the side below. */
export const homeSquare = (flipped: boolean): number => (flipped ? squareAt(4, 7) : squareAt(4, 0));
