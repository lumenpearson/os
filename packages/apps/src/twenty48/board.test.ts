import { describe, expect, it } from 'vitest';
import {
  type Board,
  CELLS,
  canSlide,
  emptyBoard,
  emptyCells,
  hasMoves,
  indexAt,
  lineIndices,
  maxTile,
  slideBoard,
  slideRow,
  valueAt,
} from './board';

/** A board written as four rows, so the tests read like the grid. */
const grid = (...rows: number[][]): Board => rows.flat();

describe('slideRow', () => {
  it('packs the values against the leading edge', () => {
    expect(slideRow([0, 0, 0, 2]).row).toEqual([2, 0, 0, 0]);
    expect(slideRow([0, 2, 0, 4]).row).toEqual([2, 4, 0, 0]);
    expect(slideRow([0, 0, 8, 0]).row).toEqual([8, 0, 0, 0]);
  });

  it('merges a pair and scores the value it made', () => {
    const slide = slideRow([2, 2, 0, 0]);
    expect(slide.row).toEqual([4, 0, 0, 0]);
    expect(slide.gained).toBe(4);
  });

  it('will not merge a tile twice in one move', () => {
    const slide = slideRow([2, 2, 4, 4]);
    expect(slide.row).toEqual([4, 8, 0, 0]);
    expect(slide.gained).toBe(12);
  });

  it('merges at the leading edge when three match', () => {
    const slide = slideRow([4, 4, 4, 0]);
    expect(slide.row).toEqual([8, 4, 0, 0]);
    expect(slide.gained).toBe(8);
  });

  it('makes two pairs out of four of a kind, not one big tile', () => {
    const slide = slideRow([2, 2, 2, 2]);
    expect(slide.row).toEqual([4, 4, 0, 0]);
    expect(slide.gained).toBe(8);
  });

  it('closes the gap before deciding whether two tiles touch', () => {
    expect(slideRow([2, 0, 2, 0]).row).toEqual([4, 0, 0, 0]);
    expect(slideRow([2, 0, 0, 2]).row).toEqual([4, 0, 0, 0]);
    expect(slideRow([0, 4, 0, 4]).gained).toBe(8);
  });

  it('leaves a row that cannot move alone', () => {
    const slide = slideRow([2, 4, 8, 16]);
    expect(slide.row).toEqual([2, 4, 8, 16]);
    expect(slide.moved).toBe(false);
    expect(slide.gained).toBe(0);
  });

  it('reports an empty row as unmoved', () => {
    const slide = slideRow([0, 0, 0, 0]);
    expect(slide.moved).toBe(false);
    expect(slide.shifts).toEqual([]);
  });

  it('counts a row that only shifts as moved', () => {
    expect(slideRow([0, 2, 4, 8]).moved).toBe(true);
    expect(slideRow([2, 4, 8, 0]).moved).toBe(false);
  });

  it('says where every tile went, the absorbed one included', () => {
    const slide = slideRow([2, 2, 4, 4]);
    expect(slide.shifts).toEqual([
      { from: 0, to: 0, merged: false },
      { from: 1, to: 0, merged: true },
      { from: 2, to: 1, merged: false },
      { from: 3, to: 1, merged: true },
    ]);
  });

  it('keeps the leading tile of a merge as the destination', () => {
    const slide = slideRow([0, 0, 8, 8]);
    expect(slide.shifts).toEqual([
      { from: 2, to: 0, merged: false },
      { from: 3, to: 0, merged: true },
    ]);
  });

  it('merges tiles of any size the same way', () => {
    expect(slideRow([1024, 1024, 0, 0]).row).toEqual([2048, 0, 0, 0]);
    expect(slideRow([2048, 2048, 0, 0]).gained).toBe(4096);
  });
});

describe('lineIndices', () => {
  it('reads a row from the left edge and from the right', () => {
    expect(lineIndices('left', 0)).toEqual([0, 1, 2, 3]);
    expect(lineIndices('right', 0)).toEqual([3, 2, 1, 0]);
    expect(lineIndices('left', 3)).toEqual([12, 13, 14, 15]);
  });

  it('reads a column from the top edge and from the bottom', () => {
    expect(lineIndices('up', 0)).toEqual([0, 4, 8, 12]);
    expect(lineIndices('down', 0)).toEqual([12, 8, 4, 0]);
    expect(lineIndices('up', 3)).toEqual([3, 7, 11, 15]);
  });

  it('covers every cell exactly once, whichever way it is read', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      const seen = new Set<number>();
      for (let line = 0; line < 4; line += 1) {
        for (const index of lineIndices(direction, line)) seen.add(index);
      }
      expect(seen.size).toBe(CELLS);
    }
  });
});

describe('slideBoard', () => {
  const board = grid([2, 2, 4, 4], [0, 0, 0, 2], [8, 0, 8, 0], [0, 0, 0, 0]);

  it('slides left', () => {
    expect(slideBoard(board, 'left').board).toEqual(
      grid([4, 8, 0, 0], [2, 0, 0, 0], [16, 0, 0, 0], [0, 0, 0, 0]),
    );
  });

  it('slides right', () => {
    expect(slideBoard(board, 'right').board).toEqual(
      grid([0, 0, 4, 8], [0, 0, 0, 2], [0, 0, 0, 16], [0, 0, 0, 0]),
    );
  });

  it('slides up', () => {
    expect(slideBoard(board, 'up').board).toEqual(
      grid([2, 2, 4, 4], [8, 0, 8, 2], [0, 0, 0, 0], [0, 0, 0, 0]),
    );
  });

  it('slides down', () => {
    expect(slideBoard(board, 'down').board).toEqual(
      grid([0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 4, 4], [8, 2, 8, 2]),
    );
  });

  it('scores every line it merged', () => {
    expect(slideBoard(board, 'left').gained).toBe(12 + 16);
    expect(slideBoard(board, 'up').gained).toBe(0);
  });

  it('reports a move that changes nothing', () => {
    const packed = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]);
    expect(slideBoard(packed, 'left').moved).toBe(false);
    expect(slideBoard(packed, 'up').moved).toBe(false);
    expect(slideBoard(packed, 'right').moved).toBe(false);
  });

  it('does not touch the board it was given', () => {
    const before = [...board];
    slideBoard(board, 'left');
    expect(board).toEqual(before);
  });

  it('keeps the number of tiles honest — one fewer per merge', () => {
    const slide = slideBoard(board, 'left');
    const merges = slide.shifts.filter((shift) => shift.merged).length;
    const before = board.filter((value) => value !== 0).length;
    const after = slide.board.filter((value) => value !== 0).length;
    expect(after).toBe(before - merges);
  });

  it('conserves the sum of the values', () => {
    const total = (values: Board) => values.reduce((sum, value) => sum + value, 0);
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      expect(total(slideBoard(board, direction).board)).toBe(total(board));
    }
  });

  it('moves a lone tile into the far corner', () => {
    const lone = emptyBoard();
    lone[indexAt(1, 2)] = 2;
    expect(slideBoard(lone, 'up').board[indexAt(1, 0)]).toBe(2);
    expect(slideBoard(lone, 'down').board[indexAt(1, 3)]).toBe(2);
    expect(slideBoard(lone, 'left').board[indexAt(0, 2)]).toBe(2);
    expect(slideBoard(lone, 'right').board[indexAt(3, 2)]).toBe(2);
  });
});

describe('the state of a board', () => {
  it('lists the free cells', () => {
    expect(emptyCells(emptyBoard())).toHaveLength(CELLS);
    const one = emptyBoard();
    one[5] = 2;
    expect(emptyCells(one)).toHaveLength(15);
    expect(emptyCells(one)).not.toContain(5);
  });

  it('finds a move while a cell is free', () => {
    const nearly = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 0]);
    expect(hasMoves(nearly)).toBe(true);
  });

  it('finds a move on a full board with a matching pair', () => {
    const full = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [32, 32, 64, 128]);
    expect(hasMoves(full)).toBe(true);
    expect(canSlide(full, 'left')).toBe(true);
    expect(canSlide(full, 'up')).toBe(false);
    expect(canSlide(full, 'down')).toBe(false);
  });

  it('calls a full board with no pair finished', () => {
    const dead = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]);
    expect(hasMoves(dead)).toBe(false);
  });

  it('reads the largest tile', () => {
    expect(maxTile(emptyBoard())).toBe(0);
    expect(maxTile(grid([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 2048, 0], [0, 0, 0, 0]))).toBe(2048);
  });

  it('reads an out-of-range cell as empty', () => {
    expect(valueAt(emptyBoard(), 99)).toBe(0);
    expect(valueAt(emptyBoard(), -1)).toBe(0);
  });
});
