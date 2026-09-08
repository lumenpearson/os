import { describe, expect, it } from 'vitest';
import { indexAt, parseGrid } from './grid';
import { cellName, checkLine, formatClock, progressLine } from './labels';
import { setValue, startPlay, toggleMark } from './play';

const EASY = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const EASY_SOLUTION =
  '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

const state = startPlay(
  parseGrid(EASY) as number[],
  parseGrid(EASY_SOLUTION) as number[],
  'medium',
  1,
);

describe('formatClock', () => {
  it('counts in minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(1_000)).toBe('0:01');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(599_000)).toBe('9:59');
  });

  it('adds hours only once there are some', () => {
    expect(formatClock(3_599_000)).toBe('59:59');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
  });

  it('never counts backwards', () => {
    expect(formatClock(-1)).toBe('0:00');
  });
});

describe('cellName', () => {
  it('says where a cell is and what is in it', () => {
    expect(cellName(state, indexAt(0, 2))).toBe('row 1, column 3, 3, clue');
    expect(cellName(state, indexAt(0, 0))).toBe('row 1, column 1, empty');
    expect(cellName(state, indexAt(8, 8))).toBe('row 9, column 9, empty');
  });

  it('marks the player entries apart from the clues', () => {
    const written = setValue(state, indexAt(0, 0), 4);
    expect(cellName(written, indexAt(0, 0))).toBe('row 1, column 1, 4');
  });

  it('reads the pencil marks out in order', () => {
    const marked = [7, 2].reduce((s, digit) => toggleMark(s, indexAt(0, 0), digit), state);
    expect(cellName(marked, indexAt(0, 0))).toBe('row 1, column 1, pencilled 2 7');
  });
});

describe('the line under the board', () => {
  it('names the grade and what is left', () => {
    expect(progressLine(state, false)).toBe('Medium — 49 cells left');
    expect(progressLine(state, true)).toBe('Medium — solved');
  });

  it('counts one cell in the singular', () => {
    let almost = state;
    const solution = parseGrid(EASY_SOLUTION) as number[];
    const empties = state.values.flatMap((value, index) => (value === 0 ? [index] : []));
    for (const index of empties.slice(1))
      almost = setValue(almost, index, solution[index] as number);
    expect(progressLine(almost, false)).toBe('Medium — 1 cell left');
  });

  it('says what a check found', () => {
    expect(checkLine(0)).toBe('Nothing wrong so far.');
    expect(checkLine(1)).toBe('1 entry is wrong.');
    expect(checkLine(4)).toBe('4 entries are wrong.');
  });
});
