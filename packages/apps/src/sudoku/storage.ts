/**
 * What Sudoku keeps in ~/.config/sudoku.json: the view preferences, and the
 * game in progress so closing the window is not the same as giving up.
 *
 * The file is text a person can edit, so nothing read out of it is trusted.
 * A saved game is checked all the way through — the solution has to be a
 * solved board, the clues have to agree with it, and the player's entries
 * have to leave the clues alone — because a board that fails any of those
 * would make the mistake check and the hint lie. Anything that does not hold
 * up is dropped and a new puzzle is dealt.
 *
 * The undo stack is deliberately not saved. It is a record of a sitting, not
 * of a puzzle, and writing two hundred boards to disk to keep it would cost
 * more than it is worth.
 */

import { type Difficulty, isDifficulty } from './generate';
import { CELLS, formatGrid, isDigit, isSolved, parseGrid } from './grid';
import { NO_MARKS, type PlayState, resumePlay } from './play';

export interface SudokuPrefs {
  /** The grade the next puzzle is generated at. */
  difficulty: Difficulty;
  /** Typing a digit pencils it in rather than writing it. */
  pencil: boolean;
  /** Shade the row, column and box of the selected cell. */
  highlight: boolean;
  timer: boolean;
}

export interface SavedGame {
  puzzle: string;
  solution: string;
  values: string;
  marks: number[];
  difficulty: Difficulty;
  seed: number;
  elapsedMs: number;
}

export interface SudokuData {
  prefs: SudokuPrefs;
  game: SavedGame | null;
}

export const DEFAULT_PREFS: SudokuPrefs = {
  difficulty: 'easy',
  pencil: false,
  highlight: true,
  timer: true,
};

export const DEFAULT_DATA: SudokuData = { prefs: DEFAULT_PREFS, game: null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const boolOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const ALL_MARKS = 0b111111111;

function readMarks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== CELLS) return null;
  const marks: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) return null;
    if (entry < 0 || entry > ALL_MARKS) return null;
    marks.push(entry);
  }
  return marks;
}

function readPrefs(value: unknown): SudokuPrefs {
  if (!isRecord(value)) return DEFAULT_PREFS;
  return {
    difficulty: isDifficulty(value.difficulty) ? value.difficulty : DEFAULT_PREFS.difficulty,
    pencil: boolOr(value.pencil, DEFAULT_PREFS.pencil),
    highlight: boolOr(value.highlight, DEFAULT_PREFS.highlight),
    timer: boolOr(value.timer, DEFAULT_PREFS.timer),
  };
}

function readGame(value: unknown): SavedGame | null {
  if (!isRecord(value)) return null;
  const { puzzle, solution, values, seed, elapsedMs } = value;
  if (typeof puzzle !== 'string' || typeof solution !== 'string' || typeof values !== 'string') {
    return null;
  }
  const marks = readMarks(value.marks);
  if (!marks) return null;
  if (!isDifficulty(value.difficulty)) return null;
  return {
    puzzle,
    solution,
    values,
    marks,
    difficulty: value.difficulty,
    seed: typeof seed === 'number' && Number.isFinite(seed) ? seed : 0,
    elapsedMs:
      typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs > 0
        ? Math.floor(elapsedMs)
        : 0,
  };
}

export function normalizeData(raw: unknown): SudokuData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  return { prefs: readPrefs(raw.prefs), game: readGame(raw.game) };
}

export function toSaved(state: PlayState, elapsedMs: number): SavedGame {
  return {
    puzzle: formatGrid(state.puzzle),
    solution: formatGrid(state.solution),
    values: formatGrid(state.values),
    marks: state.marks.slice(),
    difficulty: state.difficulty,
    seed: state.seed,
    elapsedMs: Math.max(0, Math.floor(elapsedMs)),
  };
}

export interface RestoredGame {
  state: PlayState;
  elapsedMs: number;
}

/** A saved game, or null when it does not hold together. */
export function fromSaved(saved: SavedGame | null): RestoredGame | null {
  if (!saved) return null;
  const puzzle = parseGrid(saved.puzzle);
  const solution = parseGrid(saved.solution);
  const values = parseGrid(saved.values);
  if (!puzzle || !solution || !values) return null;
  if (!isSolved(solution)) return null;

  for (let index = 0; index < CELLS; index += 1) {
    const clue = puzzle[index] ?? 0;
    const answer = solution[index] ?? 0;
    const written = values[index] ?? 0;
    // A clue that is not part of the solution, or has been written over,
    // means the file no longer describes the puzzle it claims to.
    if (clue !== 0 && clue !== answer) return null;
    if (clue !== 0 && written !== clue) return null;
  }

  const marks = saved.marks.length === CELLS ? saved.marks.slice() : null;
  if (!marks) return null;
  for (let index = 0; index < CELLS; index += 1) {
    // A pencil mark on a cell that holds a digit would never be shown, so it
    // is dropped rather than carried around.
    if (isDigit(values[index] ?? 0)) marks[index] = NO_MARKS;
  }

  return {
    state: resumePlay({
      puzzle,
      solution,
      values,
      marks,
      difficulty: saved.difficulty,
      seed: saved.seed,
    }),
    elapsedMs: saved.elapsedMs,
  };
}
