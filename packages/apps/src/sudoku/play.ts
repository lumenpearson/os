/**
 * The game in progress: what the clues are, what the player has written,
 * what they have pencilled in, and everything they can do about it.
 *
 * All of it is pure. Every command takes a state and returns one, and returns
 * the state it was given when the command would change nothing — which is how
 * the undo stack stays free of no-op entries, and how the component knows a
 * click did nothing without asking.
 *
 * The board on screen is `values`: the clues are copied into it at the start
 * and can never be written over, so a cell is one lookup rather than two.
 * `puzzle` stays as the record of which cells those were.
 */

import type { Difficulty } from './generate';
import { CELLS, conflictsOf, type Grid, isDigit, isIndex } from './grid';
import { candidateCount, propagate, toCandidates } from './solve';

/** Pencil marks, nine bits per cell, the same shape as a candidate set. */
export const NO_MARKS = 0;

export interface Snapshot {
  readonly values: readonly number[];
  readonly marks: readonly number[];
}

export interface PlayState {
  /** The clues. 0 where the player has to work. */
  readonly puzzle: readonly number[];
  readonly solution: readonly number[];
  readonly difficulty: Difficulty;
  /** The seed the puzzle was generated from, so a saved game is one number. */
  readonly seed: number;
  /** The board as it stands, clues included. */
  readonly values: readonly number[];
  readonly marks: readonly number[];
  readonly past: readonly Snapshot[];
  readonly future: readonly Snapshot[];
  /** What the last Check found wrong. Cleared by the next edit. */
  readonly wrong: readonly number[];
}

/** How far back Undo reaches. Long enough for a session, short enough to save. */
export const MAX_HISTORY = 200;

export function markOf(digit: number): number {
  return 1 << (digit - 1);
}

export function marksToDigits(mask: number): number[] {
  const out: number[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    if ((mask & markOf(digit)) !== 0) out.push(digit);
  }
  return out;
}

export function hasMark(mask: number, digit: number): boolean {
  return (mask & markOf(digit)) !== 0;
}

/** A fresh game on a generated puzzle. */
export function startPlay(
  puzzle: Grid,
  solution: Grid,
  difficulty: Difficulty,
  seed: number,
): PlayState {
  return {
    puzzle: puzzle.slice(),
    solution: solution.slice(),
    difficulty,
    seed,
    values: puzzle.slice(),
    marks: new Array<number>(CELLS).fill(NO_MARKS),
    past: [],
    future: [],
    wrong: [],
  };
}

/** A game read back from disk, with the board the player left it at. */
export function resumePlay(
  parts: Pick<PlayState, 'puzzle' | 'solution' | 'difficulty' | 'seed' | 'values' | 'marks'>,
): PlayState {
  return { ...parts, past: [], future: [], wrong: [] };
}

/** A clue: printed on the board, never editable. */
export function isGiven(state: PlayState, index: number): boolean {
  return isDigit(state.puzzle[index] ?? 0);
}

export function isEditable(state: PlayState, index: number): boolean {
  return isIndex(index) && !isGiven(state, index);
}

function snapshot(state: PlayState): Snapshot {
  return { values: state.values, marks: state.marks };
}

/** Record the move and drop the redo branch, as every editor does. */
function commit(state: PlayState, values: readonly number[], marks: readonly number[]): PlayState {
  const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY);
  return { ...state, values, marks, past, future: [], wrong: [] };
}

/**
 * Write a digit, or 0 to clear the cell. Writing a digit drops that cell's
 * pencil marks — they were notes about a cell that is now decided.
 */
export function setValue(state: PlayState, index: number, value: number): PlayState {
  if (!isEditable(state, index)) return state;
  if (value !== 0 && !isDigit(value)) return state;
  const current = state.values[index] ?? 0;
  const marked = state.marks[index] ?? NO_MARKS;
  if (current === value && (value === 0 || marked === NO_MARKS)) return state;
  const values = state.values.slice();
  values[index] = value;
  const marks = state.marks.slice();
  marks[index] = NO_MARKS;
  return commit(state, values, marks);
}

/** Empty the cell: the digit and the pencil marks go together, in one move. */
export function clearCell(state: PlayState, index: number): PlayState {
  if (!isEditable(state, index)) return state;
  const value = state.values[index] ?? 0;
  const marked = state.marks[index] ?? NO_MARKS;
  if (value === 0 && marked === NO_MARKS) return state;
  const values = state.values.slice();
  values[index] = 0;
  const marks = state.marks.slice();
  marks[index] = NO_MARKS;
  return commit(state, values, marks);
}

/** Pencil a digit in or out. A cell holding a digit takes no marks. */
export function toggleMark(state: PlayState, index: number, digit: number): PlayState {
  if (!isEditable(state, index) || !isDigit(digit)) return state;
  if ((state.values[index] ?? 0) !== 0) return state;
  const marks = state.marks.slice();
  marks[index] = (marks[index] ?? NO_MARKS) ^ markOf(digit);
  return commit(state, state.values, marks);
}

export function canUndo(state: PlayState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: PlayState): boolean {
  return state.future.length > 0;
}

export function undo(state: PlayState): PlayState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    ...state,
    values: previous.values,
    marks: previous.marks,
    past: state.past.slice(0, -1),
    future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
    wrong: [],
  };
}

export function redo(state: PlayState): PlayState {
  const next = state.future[0];
  if (!next) return state;
  return {
    ...state,
    values: next.values,
    marks: next.marks,
    past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
    future: state.future.slice(1),
    wrong: [],
  };
}

/** The player's entries that disagree with the solution. Clues never appear. */
export function mistakes(state: PlayState): number[] {
  const out: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    if (isGiven(state, index)) continue;
    const value = state.values[index] ?? 0;
    if (value !== 0 && value !== state.solution[index]) out.push(index);
  }
  return out;
}

/** Mark the wrong entries. Undo is untouched: checking is not a move. */
export function check(state: PlayState): PlayState {
  return { ...state, wrong: mistakes(state) };
}

/** Digits placed in a unit twice over, whether or not they are wrong. */
export function conflicts(state: PlayState): number[] {
  return conflictsOf(state.values);
}

/**
 * The cell a hint should fill: a wrong entry first, because leaving it in
 * place makes everything after it wrong too; otherwise the empty cell with
 * the fewest candidates, which is the one a player would find next anyway.
 */
export function hintTarget(state: PlayState): number | null {
  const wrong = mistakes(state);
  const first = wrong[0];
  if (first !== undefined) return first;

  const masks = toCandidates(state.values);
  let fallback: number | null = null;
  let best: number | null = null;
  let fewest = 10;
  if (masks && propagate(masks)) {
    for (let index = 0; index < CELLS; index += 1) {
      if ((state.values[index] ?? 0) !== 0) continue;
      if (fallback === null) fallback = index;
      const count = candidateCount(masks[index] ?? 0);
      if (count > 0 && count < fewest) {
        fewest = count;
        best = index;
      }
    }
    if (best !== null) return best;
  }
  // The board contradicts itself, so candidates mean nothing: take the first
  // empty cell rather than refusing to help.
  for (let index = 0; index < CELLS; index += 1) {
    if ((state.values[index] ?? 0) === 0) return index;
  }
  return fallback;
}

/** Fill one cell from the solution. Null when the board is already complete. */
export function hint(state: PlayState): { state: PlayState; index: number } | null {
  const index = hintTarget(state);
  if (index === null) return null;
  const value = state.solution[index] ?? 0;
  if (!isDigit(value)) return null;
  const next = setValue(state, index, value);
  return { state: next, index };
}

/** Give away the whole board. Used by nothing but the tests and a stuck player. */
export function revealAll(state: PlayState): PlayState {
  const values = state.solution.slice();
  const marks = new Array<number>(CELLS).fill(NO_MARKS);
  return commit(state, values, marks);
}

export function isFinished(state: PlayState): boolean {
  for (let index = 0; index < CELLS; index += 1) {
    if ((state.values[index] ?? 0) !== state.solution[index]) return false;
  }
  return true;
}

/** How many cells are still empty. */
export function remaining(state: PlayState): number {
  let count = 0;
  for (let index = 0; index < CELLS; index += 1) {
    if ((state.values[index] ?? 0) === 0) count += 1;
  }
  return count;
}

/** How many times a digit is on the board; nine means it is finished with. */
export function placed(state: PlayState, digit: number): number {
  let count = 0;
  for (let index = 0; index < CELLS; index += 1) {
    if ((state.values[index] ?? 0) === digit) count += 1;
  }
  return count;
}
