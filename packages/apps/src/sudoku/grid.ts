/**
 * The board: eighty-one cells in one flat array, row-major, holding 0 for an
 * empty cell and 1–9 for a digit.
 *
 * Everything a sudoku rule needs is a question about *units* — the nine rows,
 * the nine columns and the nine boxes — and about a cell's *peers*, the twenty
 * other cells sharing a unit with it. Both are the same for every board ever
 * played, so both are computed once here and read as tables afterwards.
 */

export const SIZE = 9;
export const BOX = 3;
export const CELLS = SIZE * SIZE;
export const EMPTY = 0;
export const DIGITS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** A board. Length 81, values 0–9. */
export type Grid = readonly number[];

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function columnOf(index: number): number {
  return index % SIZE;
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / BOX) * BOX + Math.floor(columnOf(index) / BOX);
}

export function indexAt(row: number, column: number): number {
  return row * SIZE + column;
}

export function rowIndices(row: number): number[] {
  return Array.from({ length: SIZE }, (_, column) => indexAt(row, column));
}

export function columnIndices(column: number): number[] {
  return Array.from({ length: SIZE }, (_, row) => indexAt(row, column));
}

export function boxIndices(box: number): number[] {
  const top = Math.floor(box / BOX) * BOX;
  const left = (box % BOX) * BOX;
  const out: number[] = [];
  for (let r = 0; r < BOX; r += 1) {
    for (let c = 0; c < BOX; c += 1) out.push(indexAt(top + r, left + c));
  }
  return out;
}

function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let i = 0; i < SIZE; i += 1) units.push(rowIndices(i));
  for (let i = 0; i < SIZE; i += 1) units.push(columnIndices(i));
  for (let i = 0; i < SIZE; i += 1) units.push(boxIndices(i));
  return units;
}

/** The twenty-seven units, rows first, then columns, then boxes. */
export const UNITS: readonly (readonly number[])[] = buildUnits();

function buildPeers(): number[][] {
  const peers: number[][] = [];
  for (let index = 0; index < CELLS; index += 1) {
    const set = new Set<number>([
      ...rowIndices(rowOf(index)),
      ...columnIndices(columnOf(index)),
      ...boxIndices(boxOf(index)),
    ]);
    set.delete(index);
    peers.push([...set].sort((a, b) => a - b));
  }
  return peers;
}

/** For each cell, the twenty cells it may not repeat a digit with. */
export const PEERS: readonly (readonly number[])[] = buildPeers();

export function peersOf(index: number): readonly number[] {
  return PEERS[index] ?? [];
}

/** The three units — row, column, box — that contain a cell. */
export function unitsOf(index: number): number[][] {
  return [rowIndices(rowOf(index)), columnIndices(columnOf(index)), boxIndices(boxOf(index))];
}

export function emptyGrid(): number[] {
  return new Array<number>(CELLS).fill(EMPTY);
}

export function isIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < CELLS;
}

export function isDigit(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= SIZE;
}

/** Whether writing `value` at `index` breaks no rule against what is already there. */
export function allows(grid: Grid, index: number, value: number): boolean {
  if (!isIndex(index) || !isDigit(value)) return false;
  return peersOf(index).every((peer) => grid[peer] !== value);
}

/** The cells holding a digit that repeats somewhere in one of their units. */
export function conflictsOf(grid: Grid): number[] {
  const bad = new Set<number>();
  for (const unit of UNITS) {
    const seen = new Map<number, number[]>();
    for (const index of unit) {
      const value = grid[index] ?? EMPTY;
      if (value === EMPTY) continue;
      const at = seen.get(value);
      if (at) at.push(index);
      else seen.set(value, [index]);
    }
    for (const at of seen.values()) {
      if (at.length > 1) for (const index of at) bad.add(index);
    }
  }
  return [...bad].sort((a, b) => a - b);
}

/** Every cell holds a digit. Says nothing about whether they are the right ones. */
export function isFilled(grid: Grid): boolean {
  return grid.length === CELLS && grid.every((value) => isDigit(value));
}

/** Filled, and no unit repeats a digit. */
export function isSolved(grid: Grid): boolean {
  return isFilled(grid) && conflictsOf(grid).length === 0;
}

/** How many cells hold a digit. */
export function clueCount(grid: Grid): number {
  return grid.reduce((total, value) => (isDigit(value) ? total + 1 : total), 0);
}

/**
 * Read a board from 81 characters: 1–9 for a digit, `.`, `0` or `-` for an
 * empty cell. Whitespace is ignored so a grid pasted as nine lines works.
 * Anything else is not a board and returns null.
 */
export function parseGrid(text: string): number[] | null {
  const cells: number[] = [];
  for (const char of text) {
    if (/\s/.test(char)) continue;
    if (char >= '1' && char <= '9') cells.push(char.charCodeAt(0) - 48);
    else if (char === '.' || char === '0' || char === '-') cells.push(EMPTY);
    else return null;
    if (cells.length > CELLS) return null;
  }
  return cells.length === CELLS ? cells : null;
}

/** The inverse of `parseGrid`: 81 characters, `.` for empty. */
export function formatGrid(grid: Grid): string {
  let out = '';
  for (let index = 0; index < CELLS; index += 1) {
    const value = grid[index] ?? EMPTY;
    out += isDigit(value) ? String(value) : '.';
  }
  return out;
}
