/**
 * The minefield itself: where the mines are and how many touch each cell.
 *
 * A board is generated *after* the first click, from the cell that was
 * clicked, so the opening is guaranteed to be safe and to open a region. No
 * board is ever generated up front and reshuffled on a loss.
 */

import type { BoardConfig } from './difficulty';
import { type Rng, shuffle } from './rng';

export interface Board {
  width: number;
  height: number;
  /** Mines actually placed, which is what the counter counts down from. */
  mines: number;
  /** One entry per cell, row-major: a mine sits here. */
  mine: boolean[];
  /** Mines touching this cell, 0 to 8. */
  adjacent: number[];
}

export const cellCount = (config: BoardConfig): number => config.width * config.height;

export const indexAt = (width: number, x: number, y: number): number => y * width + x;

export const columnOf = (width: number, index: number): number => index % width;

export const rowOf = (width: number, index: number): number => Math.floor(index / width);

/** The up-to-eight cells touching `index`, clipped at the edges. */
export function neighbours(width: number, height: number, index: number): number[] {
  const x = columnOf(width, index);
  const y = rowOf(width, index);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      if (dx === 0 && dy === 0) continue;
      out.push(indexAt(width, nx, ny));
    }
  }
  return out;
}

/** The forbidden neighbourhood: the first cell clicked and everything around it. */
export function safeZone(width: number, height: number, index: number): number[] {
  return [index, ...neighbours(width, height, index)];
}

/** Adjacency counts for a placement. */
export function countAdjacent(width: number, height: number, mine: readonly boolean[]): number[] {
  const adjacent = new Array<number>(mine.length).fill(0);
  for (let index = 0; index < mine.length; index += 1) {
    if (mine[index] !== true) continue;
    for (const n of neighbours(width, height, index)) {
      adjacent[n] = (adjacent[n] ?? 0) + 1;
    }
  }
  return adjacent;
}

/** A field with nothing placed yet: what the game shows before the first click. */
export function emptyBoard(config: BoardConfig): Board {
  const size = cellCount(config);
  return {
    width: config.width,
    height: config.height,
    mines: 0,
    mine: new Array<boolean>(size).fill(false),
    adjacent: new Array<number>(size).fill(0),
  };
}

/**
 * Place the mines anywhere except the neighbourhood of `firstIndex`.
 *
 * The candidate cells are shuffled and the first N taken, so the count is
 * exact in one pass — no rejection loop, no chance of placing two mines on
 * one cell. If a caller asks for more mines than there are candidates (the
 * custom form refuses to, but a hand-edited config file could), the extra
 * mines are dropped and `board.mines` reports what was actually placed.
 */
export function generateBoard(config: BoardConfig, firstIndex: number, rng: Rng): Board {
  const { width, height } = config;
  const size = cellCount(config);
  const forbidden = new Set(safeZone(width, height, firstIndex));
  const candidates: number[] = [];
  for (let index = 0; index < size; index += 1) {
    if (!forbidden.has(index)) candidates.push(index);
  }
  const count = Math.max(0, Math.min(Math.floor(config.mines), candidates.length));
  const mine = new Array<boolean>(size).fill(false);
  for (const index of shuffle(candidates, rng).slice(0, count)) mine[index] = true;
  return { width, height, mines: count, mine, adjacent: countAdjacent(width, height, mine) };
}
