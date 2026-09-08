import { describe, expect, it } from 'vitest';
import {
  allows,
  boxIndices,
  boxOf,
  CELLS,
  clueCount,
  columnIndices,
  columnOf,
  conflictsOf,
  emptyGrid,
  formatGrid,
  indexAt,
  isDigit,
  isFilled,
  isIndex,
  isSolved,
  PEERS,
  parseGrid,
  peersOf,
  rowIndices,
  rowOf,
  SIZE,
  UNITS,
  unitsOf,
} from './grid';

const SOLVED = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

describe('indexing', () => {
  it('round-trips every cell through its row and column', () => {
    for (let index = 0; index < CELLS; index += 1) {
      expect(indexAt(rowOf(index), columnOf(index))).toBe(index);
    }
  });

  it('puts the corners and the middle in the boxes they belong to', () => {
    expect(boxOf(0)).toBe(0);
    expect(boxOf(8)).toBe(2);
    expect(boxOf(40)).toBe(4);
    expect(boxOf(72)).toBe(6);
    expect(boxOf(80)).toBe(8);
  });

  it('numbers rows, columns and boxes with nine distinct cells each', () => {
    for (let i = 0; i < SIZE; i += 1) {
      for (const unit of [rowIndices(i), columnIndices(i), boxIndices(i)]) {
        expect(unit).toHaveLength(SIZE);
        expect(new Set(unit).size).toBe(SIZE);
      }
    }
  });

  it('reads a box as three cells from each of three rows', () => {
    expect(boxIndices(4)).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
  });

  it('rejects indices and digits that are out of range', () => {
    expect(isIndex(0)).toBe(true);
    expect(isIndex(80)).toBe(true);
    expect(isIndex(81)).toBe(false);
    expect(isIndex(-1)).toBe(false);
    expect(isIndex(1.5)).toBe(false);
    expect(isDigit(1)).toBe(true);
    expect(isDigit(9)).toBe(true);
    expect(isDigit(0)).toBe(false);
    expect(isDigit(10)).toBe(false);
  });
});

describe('units and peers', () => {
  it('has twenty-seven units, each cell in exactly three', () => {
    expect(UNITS).toHaveLength(27);
    for (let index = 0; index < CELLS; index += 1) {
      expect(UNITS.filter((unit) => unit.includes(index))).toHaveLength(3);
    }
  });

  it('gives every cell twenty peers and never itself', () => {
    expect(PEERS).toHaveLength(CELLS);
    for (let index = 0; index < CELLS; index += 1) {
      const peers = peersOf(index);
      expect(peers).toHaveLength(20);
      expect(peers).not.toContain(index);
    }
  });

  it('is symmetric: a sees b exactly when b sees a', () => {
    for (let a = 0; a < CELLS; a += 1) {
      for (const b of peersOf(a)) expect(peersOf(b)).toContain(a);
    }
  });

  it('collects a cell peers from its own row, column and box', () => {
    // C2 in the top-left box: the rest of row 1, of column 2, and of the box.
    const peers = new Set(peersOf(indexAt(0, 2)));
    expect(peers.has(indexAt(0, 7))).toBe(true);
    expect(peers.has(indexAt(8, 2))).toBe(true);
    expect(peers.has(indexAt(2, 0))).toBe(true);
    expect(peers.has(indexAt(3, 3))).toBe(false);
  });

  it('names the three units a cell belongs to', () => {
    const units = unitsOf(40);
    expect(units).toHaveLength(3);
    for (const unit of units) expect(unit).toContain(40);
  });
});

describe('validity', () => {
  const solved = parseGrid(SOLVED) as number[];

  it('reads a solved board as solved', () => {
    expect(isFilled(solved)).toBe(true);
    expect(isSolved(solved)).toBe(true);
    expect(conflictsOf(solved)).toEqual([]);
  });

  it('finds a repeated digit in a row, a column and a box', () => {
    const row = emptyGrid();
    row[0] = 5;
    row[4] = 5;
    expect(conflictsOf(row)).toEqual([0, 4]);

    const column = emptyGrid();
    column[2] = 7;
    column[47] = 7;
    expect(conflictsOf(column)).toEqual([2, 47]);

    const box = emptyGrid();
    box[30] = 3;
    box[50] = 3;
    expect(conflictsOf(box)).toEqual([30, 50]);
  });

  it('counts an empty board as neither filled nor in conflict', () => {
    const empty = emptyGrid();
    expect(empty).toHaveLength(CELLS);
    expect(isFilled(empty)).toBe(false);
    expect(isSolved(empty)).toBe(false);
    expect(conflictsOf(empty)).toEqual([]);
    expect(clueCount(empty)).toBe(0);
  });

  it('counts a filled but wrong board as filled and not solved', () => {
    const wrong = solved.slice();
    wrong[1] = wrong[0] as number;
    expect(isFilled(wrong)).toBe(true);
    expect(isSolved(wrong)).toBe(false);
  });

  it('allows a digit only where no peer already has it', () => {
    const grid = emptyGrid();
    grid[1] = 4;
    expect(allows(grid, 0, 4)).toBe(false);
    expect(allows(grid, 0, 5)).toBe(true);
    expect(allows(grid, 80, 4)).toBe(true);
    expect(allows(grid, 0, 0)).toBe(false);
    expect(allows(grid, 99, 4)).toBe(false);
  });

  it('counts the clues on a board', () => {
    expect(clueCount(solved)).toBe(CELLS);
  });
});

describe('parsing', () => {
  it('reads eighty-one digits and writes them back', () => {
    const grid = parseGrid(SOLVED);
    expect(grid).not.toBeNull();
    expect(formatGrid(grid as number[])).toBe(SOLVED);
  });

  it('takes dots, zeros and dashes as empty, and ignores layout', () => {
    const text = `
      53. .7. ...
      6.. 195 ...
      .98 ... .6.
      8.. .6. ..3
      4.. 8-3 ..1
      7.. .2. ..6
      .6. ... 28.
      ... 419 ..5
      ... .8. .79
    `;
    const grid = parseGrid(text);
    expect(grid).not.toBeNull();
    expect(grid?.[0]).toBe(5);
    expect(grid?.[2]).toBe(0);
    expect(clueCount(grid as number[])).toBe(30);
  });

  it('refuses a board that is too short, too long or not a board', () => {
    expect(parseGrid('123')).toBeNull();
    expect(parseGrid(`${SOLVED}1`)).toBeNull();
    expect(parseGrid(SOLVED.replace('4', 'x'))).toBeNull();
  });

  it('writes an empty cell as a dot', () => {
    expect(formatGrid(emptyGrid())).toBe('.'.repeat(CELLS));
  });
});
