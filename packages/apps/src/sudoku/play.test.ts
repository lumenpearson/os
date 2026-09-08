import { beforeEach, describe, expect, it } from 'vitest';
import { generate } from './generate';
import { CELLS, formatGrid, parseGrid, peersOf } from './grid';
import {
  canRedo,
  canUndo,
  check,
  clearCell,
  conflicts,
  hasMark,
  hint,
  hintTarget,
  isEditable,
  isFinished,
  isGiven,
  MAX_HISTORY,
  markOf,
  marksToDigits,
  mistakes,
  NO_MARKS,
  type PlayState,
  placed,
  redo,
  remaining,
  resumePlay,
  revealAll,
  setValue,
  startPlay,
  toggleMark,
  undo,
} from './play';
import { createRng } from './rng';

const EASY = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const EASY_SOLUTION =
  '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

/** The same board with dots for the empties, the way formatGrid writes it. */
const EASY_TEXT = formatGrid(parseGrid(EASY) as number[]);

function fresh(): PlayState {
  return startPlay(parseGrid(EASY) as number[], parseGrid(EASY_SOLUTION) as number[], 'easy', 1);
}

/** The first cell the puzzle leaves empty. */
const OPEN = (parseGrid(EASY) as number[]).indexOf(0);
const CLUE = (parseGrid(EASY) as number[]).findIndex((v) => v !== 0);

describe('starting', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('starts with the clues on the board and nothing pencilled', () => {
    expect(formatGrid(state.values)).toBe(EASY_TEXT);
    expect(state.marks).toHaveLength(CELLS);
    expect(state.marks.every((mask) => mask === NO_MARKS)).toBe(true);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
    expect(state.wrong).toEqual([]);
  });

  it('knows a clue from a cell the player owns', () => {
    expect(isGiven(state, CLUE)).toBe(true);
    expect(isEditable(state, CLUE)).toBe(false);
    expect(isGiven(state, OPEN)).toBe(false);
    expect(isEditable(state, OPEN)).toBe(true);
    expect(isEditable(state, 999)).toBe(false);
  });

  it('resumes a saved board without a history', () => {
    const resumed = resumePlay({
      puzzle: state.puzzle,
      solution: state.solution,
      difficulty: 'hard',
      seed: 5,
      values: state.values,
      marks: state.marks,
    });
    expect(resumed.difficulty).toBe('hard');
    expect(canUndo(resumed)).toBe(false);
  });
});

describe('writing digits', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('writes a digit and records the move', () => {
    const next = setValue(state, OPEN, 4);
    expect(next.values[OPEN]).toBe(4);
    expect(canUndo(next)).toBe(true);
  });

  it('refuses to write over a clue', () => {
    expect(setValue(state, CLUE, 9)).toBe(state);
    expect(clearCell(state, CLUE)).toBe(state);
    expect(toggleMark(state, CLUE, 3)).toBe(state);
  });

  it('refuses a digit that is not a digit', () => {
    expect(setValue(state, OPEN, 10)).toBe(state);
    expect(setValue(state, OPEN, -1)).toBe(state);
    expect(setValue(state, OPEN, 1.5)).toBe(state);
  });

  it('does not record a move that changes nothing', () => {
    const once = setValue(state, OPEN, 4);
    expect(setValue(once, OPEN, 4)).toBe(once);
    expect(clearCell(state, OPEN)).toBe(state);
  });

  it('clears the digit and the pencil marks together, as one move', () => {
    const marked = toggleMark(toggleMark(state, OPEN, 2), OPEN, 7);
    const cleared = clearCell(marked, OPEN);
    expect(cleared.values[OPEN]).toBe(0);
    expect(cleared.marks[OPEN]).toBe(NO_MARKS);
    expect(undo(cleared).marks[OPEN]).toBe(marked.marks[OPEN]);
  });

  it('drops the pencil marks of a cell it writes a digit into', () => {
    const marked = toggleMark(state, OPEN, 5);
    const written = setValue(marked, OPEN, 9);
    expect(written.marks[OPEN]).toBe(NO_MARKS);
  });
});

describe('pencil marks', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('pencils a digit in and out again', () => {
    const on = toggleMark(state, OPEN, 3);
    expect(hasMark(on.marks[OPEN] ?? 0, 3)).toBe(true);
    const off = toggleMark(on, OPEN, 3);
    expect(off.marks[OPEN]).toBe(NO_MARKS);
  });

  it('keeps several marks in one cell, in order', () => {
    const marked = [1, 9, 4].reduce((s, digit) => toggleMark(s, OPEN, digit), state);
    expect(marksToDigits(marked.marks[OPEN] ?? 0)).toEqual([1, 4, 9]);
    expect(markOf(1) | markOf(4) | markOf(9)).toBe(marked.marks[OPEN]);
  });

  it('will not pencil into a cell that holds a digit', () => {
    const written = setValue(state, OPEN, 6);
    expect(toggleMark(written, OPEN, 2)).toBe(written);
  });

  it('refuses a mark that is not a digit', () => {
    expect(toggleMark(state, OPEN, 0)).toBe(state);
    expect(toggleMark(state, OPEN, 11)).toBe(state);
  });
});

describe('undo and redo', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('walks back and forward through the moves', () => {
    const a = setValue(state, OPEN, 1);
    const b = setValue(a, OPEN, 2);
    const back = undo(b);
    expect(back.values[OPEN]).toBe(1);
    expect(canRedo(back)).toBe(true);
    const forward = redo(back);
    expect(forward.values[OPEN]).toBe(2);
    expect(canRedo(forward)).toBe(false);
  });

  it('does nothing at either end', () => {
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
  });

  it('drops the redo branch as soon as a new move is made', () => {
    const back = undo(setValue(state, OPEN, 1));
    const other = setValue(back, OPEN, 8);
    expect(canRedo(other)).toBe(false);
    expect(other.values[OPEN]).toBe(8);
  });

  it('returns to exactly the board it started from', () => {
    let played = state;
    for (const digit of [1, 2, 3, 4]) played = setValue(played, OPEN, digit);
    for (let i = 0; i < 4; i += 1) played = undo(played);
    expect(formatGrid(played.values)).toBe(EASY_TEXT);
    expect(canUndo(played)).toBe(false);
  });

  it('keeps the history bounded', () => {
    let played = state;
    for (let i = 0; i < MAX_HISTORY + 40; i += 1) {
      played = setValue(played, OPEN, (i % 9) + 1);
    }
    expect(played.past.length).toBe(MAX_HISTORY);
  });
});

describe('checking', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('finds nothing wrong on an untouched board', () => {
    expect(mistakes(state)).toEqual([]);
    expect(check(state).wrong).toEqual([]);
  });

  it('marks an entry that disagrees with the solution', () => {
    const answer = state.solution[OPEN] as number;
    const wrong = setValue(state, OPEN, answer === 9 ? 1 : answer + 1);
    expect(check(wrong).wrong).toEqual([OPEN]);
  });

  it('leaves a right entry alone', () => {
    const right = setValue(state, OPEN, state.solution[OPEN] as number);
    expect(check(right).wrong).toEqual([]);
  });

  it('forgets what it found as soon as the board changes', () => {
    const answer = state.solution[OPEN] as number;
    const checked = check(setValue(state, OPEN, answer === 9 ? 1 : answer + 1));
    expect(checked.wrong).toHaveLength(1);
    expect(setValue(checked, OPEN, answer).wrong).toEqual([]);
    expect(undo(checked).wrong).toEqual([]);
  });

  it('is not a move: undo does not undo it', () => {
    const checked = check(state);
    expect(canUndo(checked)).toBe(false);
  });

  it('reports a digit repeated in a unit as a conflict', () => {
    // Write into an empty cell the digit one of its own peers already holds:
    // that is a repeat by definition, whatever the solution says.
    const peer = peersOf(OPEN).find((index) => (state.values[index] ?? 0) !== 0) as number;
    const clash = setValue(state, OPEN, state.values[peer] as number);
    expect(conflicts(clash)).toEqual([OPEN, peer].sort((a, b) => a - b));
    expect(conflicts(state)).toEqual([]);
  });
});

describe('hints', () => {
  let state: PlayState;
  beforeEach(() => {
    state = fresh();
  });

  it('fills a cell with the right digit and records it as a move', () => {
    const given = hint(state);
    expect(given).not.toBeNull();
    if (!given) return;
    expect(given.state.values[given.index]).toBe(state.solution[given.index]);
    expect(canUndo(given.state)).toBe(true);
  });

  it('corrects a wrong entry before filling anything new', () => {
    const answer = state.solution[OPEN] as number;
    const wrong = setValue(state, OPEN, answer === 9 ? 1 : answer + 1);
    expect(hintTarget(wrong)).toBe(OPEN);
    expect(hint(wrong)?.state.values[OPEN]).toBe(answer);
  });

  it('helps even when the board contradicts itself', () => {
    // Two clashing entries: candidates are meaningless, but there is still a
    // cell to fill and a hint has to name one.
    let messy = state;
    const empties = state.values.flatMap((value, index) => (value === 0 ? [index] : []));
    const [a, b] = [empties[0] as number, empties[1] as number];
    messy = setValue(setValue(messy, a, 5), b, 5);
    const target = hintTarget(messy);
    expect(target).not.toBeNull();
    expect(hint(messy)).not.toBeNull();
  });

  it('has nothing left to give on a finished board', () => {
    const done = revealAll(state);
    expect(hintTarget(done)).toBeNull();
    expect(hint(done)).toBeNull();
  });

  it('picks the most constrained empty cell on a clean board', () => {
    const target = hintTarget(state) as number;
    expect(state.values[target]).toBe(0);
  });
});

describe('progress', () => {
  it('counts what is left, and what is placed', () => {
    const state = fresh();
    const empty = state.values.filter((value) => value === 0).length;
    expect(remaining(state)).toBe(empty);
    expect(isFinished(state)).toBe(false);

    const filled = setValue(state, OPEN, state.solution[OPEN] as number);
    expect(remaining(filled)).toBe(empty - 1);
    expect(placed(filled, state.solution[OPEN] as number)).toBeGreaterThan(0);
  });

  it('is finished only when every cell matches the solution', () => {
    const done = revealAll(fresh());
    expect(isFinished(done)).toBe(true);
    expect(remaining(done)).toBe(0);
    expect(mistakes(done)).toEqual([]);
    expect(placed(done, 5)).toBe(9);
  });

  it('is not finished when the board is full but wrong', () => {
    const state = fresh();
    const answer = state.solution[OPEN] as number;
    const full = setValue(revealAll(state), OPEN, answer === 9 ? 1 : answer + 1);
    expect(remaining(full)).toBe(0);
    expect(isFinished(full)).toBe(false);
    expect(mistakes(full)).toEqual([OPEN]);
  });
});

describe('a generated puzzle', () => {
  it('plays through to a finish', () => {
    const made = generate(createRng(2024), 'easy');
    let state = startPlay(made.puzzle, made.solution, made.difficulty, 2024);
    for (let index = 0; index < CELLS; index += 1) {
      state = setValue(state, index, made.solution[index] as number);
    }
    expect(isFinished(state)).toBe(true);
    expect(check(state).wrong).toEqual([]);
    expect(conflicts(state)).toEqual([]);
  });
});
