/**
 * The 4×4 grid and the slide-and-merge that every move is built from.
 *
 * A board is sixteen numbers in reading order; 0 is an empty cell. All the
 * classic bugs live in `slideRow`, so every direction is expressed as the same
 * row operation read along a different line rather than written out four
 * times: `lineIndices` hands the row its cells ordered from the edge the tiles
 * slide toward, `slideRow` does the work, and the result is written back.
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;

/** Sixteen tile values in reading order; 0 is empty. */
export type Board = readonly number[];

export type Direction = 'left' | 'right' | 'up' | 'down';

export const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

export function emptyBoard(): number[] {
  return new Array<number>(CELLS).fill(0);
}

export function indexAt(x: number, y: number): number {
  return y * SIZE + x;
}

export function columnOf(index: number): number {
  return index % SIZE;
}

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function valueAt(board: Board, index: number): number {
  return board[index] ?? 0;
}

/** Where one occupied cell went, and whether it landed on a merge. */
export interface Shift {
  from: number;
  to: number;
  /** True for the tile that was absorbed into the one already there. */
  merged: boolean;
}

export interface RowSlide {
  /** The row after the move, padded with zeros. */
  row: number[];
  /** The sum of the values the merges produced — the score this row is worth. */
  gained: number;
  /** One entry per occupied source cell, in order from the leading edge. */
  shifts: Shift[];
  /** False when the row is unchanged, which is what makes a move illegal. */
  moved: boolean;
}

/**
 * Slide one row toward index 0 and merge equal neighbours.
 *
 * The rule that catches people out: a tile formed by a merge cannot merge
 * again in the same move. `[2,2,4,4]` is `[4,8,0,0]`, never `[8,8,0,0]` and
 * never `[16,0,0,0]`. `lastMergedAt` is what enforces it — the destination
 * that has already absorbed something this move is closed to further merges.
 */
export function slideRow(values: readonly number[]): RowSlide {
  const row = new Array<number>(values.length).fill(0);
  const shifts: Shift[] = [];
  let write = 0;
  let gained = 0;
  let lastMergedAt = -1;

  for (let read = 0; read < values.length; read += 1) {
    const value = values[read] ?? 0;
    if (value === 0) continue;
    const target = write - 1;
    if (target >= 0 && target !== lastMergedAt && row[target] === value) {
      const total = value * 2;
      row[target] = total;
      gained += total;
      lastMergedAt = target;
      shifts.push({ from: read, to: target, merged: true });
      continue;
    }
    row[write] = value;
    shifts.push({ from: read, to: write, merged: false });
    write += 1;
  }

  return { row, gained, shifts, moved: shifts.some((shift) => shift.from !== shift.to) };
}

/**
 * The four board indices of one line, ordered from the edge the tiles slide
 * toward. Feeding these to `slideRow` is what makes all four directions one
 * piece of code.
 */
export function lineIndices(direction: Direction, line: number): number[] {
  const out: number[] = [];
  for (let step = 0; step < SIZE; step += 1) {
    const back = SIZE - 1 - step;
    if (direction === 'left') out.push(indexAt(step, line));
    else if (direction === 'right') out.push(indexAt(back, line));
    else if (direction === 'up') out.push(indexAt(line, step));
    else out.push(indexAt(line, back));
  }
  return out;
}

export interface BoardSlide {
  board: number[];
  gained: number;
  /** False when nothing changed; the game refuses such a move. */
  moved: boolean;
  /** Every tile's journey, in board indices, for the animation and for merges. */
  shifts: Shift[];
}

/** Apply one move to the whole board. Pure: the argument is not touched. */
export function slideBoard(board: Board, direction: Direction): BoardSlide {
  const next = emptyBoard();
  const shifts: Shift[] = [];
  let gained = 0;
  let moved = false;

  for (let line = 0; line < SIZE; line += 1) {
    const cells = lineIndices(direction, line);
    const slide = slideRow(cells.map((cell) => valueAt(board, cell)));
    gained += slide.gained;
    if (slide.moved) moved = true;
    for (let step = 0; step < SIZE; step += 1) {
      const cell = cells[step];
      if (cell !== undefined) next[cell] = slide.row[step] ?? 0;
    }
    for (const shift of slide.shifts) {
      const from = cells[shift.from];
      const to = cells[shift.to];
      if (from === undefined || to === undefined) continue;
      shifts.push({ from, to, merged: shift.merged });
    }
  }

  return { board: next, gained, moved, shifts };
}

/** The indices a new tile may be placed on. */
export function emptyCells(board: Board): number[] {
  const out: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    if (valueAt(board, index) === 0) out.push(index);
  }
  return out;
}

export function canSlide(board: Board, direction: Direction): boolean {
  return slideBoard(board, direction).moved;
}

/** False when the board is full and no two neighbours match: the game is over. */
export function hasMoves(board: Board): boolean {
  return DIRECTIONS.some((direction) => canSlide(board, direction));
}

export function maxTile(board: Board): number {
  let best = 0;
  for (let index = 0; index < CELLS; index += 1) {
    const value = valueAt(board, index);
    if (value > best) best = value;
  }
  return best;
}
