/**
 * Game state and the moves that change it. Every function here is pure: it
 * takes a state and returns the next one, or the same object when the move
 * does nothing.
 *
 * The flood that opens a zero-adjacency region is an explicit stack, not
 * recursion — a 50×50 field can open in one move and must not depend on the
 * call stack to do it.
 */

import { type Board, cellCount, emptyBoard, generateBoard, neighbours } from './board';
import type { BoardConfig } from './difficulty';
import { createRng } from './rng';

export type Mark = 'none' | 'flag' | 'question';
export type Phase = 'ready' | 'playing' | 'won' | 'lost';

export interface GameState {
  config: BoardConfig;
  /** The seed the board is generated from once the first cell is clicked. */
  seed: number;
  board: Board;
  revealed: boolean[];
  marks: Mark[];
  phase: Phase;
  /** The mine that ended the game. */
  explodedAt: number | null;
  /** Cells without a mine that are open; the win is when this reaches its target. */
  safeRevealed: number;
  flags: number;
  /** Set by the first reveal, not by the first flag. */
  startedAt: number | null;
  finishedAt: number | null;
  /** Whether the mark cycle includes "?". */
  questionMarks: boolean;
}

export interface GameOptions {
  seed: number;
  questionMarks: boolean;
}

export function createGame(config: BoardConfig, options: GameOptions): GameState {
  const size = cellCount(config);
  return {
    config,
    seed: options.seed,
    board: emptyBoard(config),
    revealed: new Array<boolean>(size).fill(false),
    // A mark here is the flag or question mark a player puts on a cell; it
    // has nothing to do with the highlight element of the same name.
    // deslop-ignore-next-line 09 13
    marks: new Array<Mark>(size).fill('none'),
    phase: 'ready',
    explodedAt: null,
    safeRevealed: 0,
    flags: 0,
    startedAt: null,
    finishedAt: null,
    questionMarks: options.questionMarks,
  };
}

// ── reading a cell ────────────────────────────────────────────────────────

const inBounds = (state: GameState, index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < state.revealed.length;

export const isRevealed = (state: GameState, index: number): boolean =>
  state.revealed[index] === true;

export const markAt = (state: GameState, index: number): Mark => state.marks[index] ?? 'none';

export const isMine = (state: GameState, index: number): boolean =>
  state.board.mine[index] === true;

export const adjacentAt = (state: GameState, index: number): number =>
  state.board.adjacent[index] ?? 0;

export const isOver = (state: GameState): boolean =>
  state.phase === 'won' || state.phase === 'lost';

/** Mines the counter still shows: the total less the flags planted. Can go negative. */
export const remainingMines = (state: GameState): number => state.config.mines - state.flags;

/** How long the clock has run. Zero until the first reveal, frozen once the game ends. */
export function elapsedMs(state: GameState, now: number): number {
  if (state.startedAt === null) return 0;
  return Math.max(0, (state.finishedAt ?? now) - state.startedAt);
}

/** Cells that must be opened to win. */
export const safeTarget = (state: GameState): number =>
  cellCount(state.config) - state.config.mines;

// ── moves ─────────────────────────────────────────────────────────────────

/**
 * Open a set of cells, spreading through zero-adjacency regions. Flags block
 * the flood; a question mark does not, and is cleared as the cell opens.
 * Returns the state with the new arrays and, if one was uncovered, the mine
 * that ends the game.
 */
function open(state: GameState, seeds: readonly number[]): GameState {
  const { width, height } = state.board;
  const revealed = state.revealed.slice();
  const marks = state.marks.slice();
  let safeRevealed = state.safeRevealed;
  let exploded = state.explodedAt;
  const stack = [...seeds];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) break;
    if (revealed[index] === true || marks[index] === 'flag') continue;
    revealed[index] = true;
    if (marks[index] === 'question') marks[index] = 'none';
    if (state.board.mine[index] === true) {
      if (exploded === null) exploded = index;
      continue;
    }
    safeRevealed += 1;
    if ((state.board.adjacent[index] ?? 0) !== 0) continue;
    for (const n of neighbours(width, height, index)) {
      if (revealed[n] !== true) stack.push(n);
    }
  }
  if (safeRevealed === state.safeRevealed && exploded === state.explodedAt) return state;
  return { ...state, revealed, marks, safeRevealed, explodedAt: exploded };
}

/** Turn a finished position into a won or lost one. */
function settle(state: GameState, now: number): GameState {
  if (state.explodedAt !== null) return lose(state, now);
  if (state.safeRevealed >= safeTarget(state)) return win(state, now);
  return state;
}

/** Every mine comes up; a flag that was wrong stays put, to be marked as wrong. */
function lose(state: GameState, now: number): GameState {
  const revealed = state.revealed.slice();
  for (let index = 0; index < revealed.length; index += 1) {
    if (state.board.mine[index] === true && state.marks[index] !== 'flag') revealed[index] = true;
  }
  return { ...state, revealed, phase: 'lost', finishedAt: now };
}

/** The last safe cell is open, so the mines are known: flag them all. */
function win(state: GameState, now: number): GameState {
  const marks = state.marks.slice();
  let flags = 0;
  for (let index = 0; index < marks.length; index += 1) {
    if (state.board.mine[index] === true) {
      marks[index] = 'flag';
      flags += 1;
    } else if (marks[index] === 'flag') {
      marks[index] = 'none';
    }
  }
  return { ...state, marks, flags, phase: 'won', finishedAt: now };
}

/** The first reveal decides the board, around the cell that was clicked. */
function begin(state: GameState, index: number, now: number): GameState {
  const board = generateBoard(state.config, index, createRng(state.seed));
  return {
    ...state,
    // The board is the authority on how many mines there are from here on, so
    // the counter and the win condition agree even on a config that asked for
    // more mines than the field could hold.
    config: { ...state.config, mines: board.mines },
    board,
    phase: 'playing',
    startedAt: now,
  };
}

export function reveal(state: GameState, index: number, now: number): GameState {
  if (!inBounds(state, index) || isOver(state)) return state;
  if (isRevealed(state, index) || markAt(state, index) === 'flag') return state;
  const started = state.phase === 'ready' ? begin(state, index, now) : state;
  return settle(open(started, [index]), now);
}

/** A revealed number with the right count of flags around it can open the rest. */
export function canChord(state: GameState, index: number): boolean {
  if (!inBounds(state, index) || isOver(state) || state.phase === 'ready') return false;
  if (!isRevealed(state, index)) return false;
  const count = adjacentAt(state, index);
  if (count === 0) return false;
  const around = neighbours(state.board.width, state.board.height, index);
  const flagged = around.filter((n) => markAt(state, n) === 'flag').length;
  if (flagged !== count) return false;
  return around.some((n) => !isRevealed(state, n) && markAt(state, n) !== 'flag');
}

/**
 * Open every neighbour that is not flagged. If one of the flags was wrong,
 * this uncovers a mine and the game is lost — that is the bet chording makes.
 */
export function chord(state: GameState, index: number, now: number): GameState {
  if (!canChord(state, index)) return state;
  const seeds = neighbours(state.board.width, state.board.height, index).filter(
    (n) => !isRevealed(state, n) && markAt(state, n) !== 'flag',
  );
  return settle(open(state, seeds), now);
}

/** What a click or Enter does on this cell: chord a satisfied number, else reveal. */
export function activate(state: GameState, index: number, now: number): GameState {
  if (isRevealed(state, index)) return chord(state, index, now);
  return reveal(state, index, now);
}

/** Cycle the mark on a hidden cell: none → flag → question (when on) → none. */
export function cycleMark(state: GameState, index: number): GameState {
  if (!inBounds(state, index) || isOver(state)) return state;
  if (isRevealed(state, index)) return state;
  const current = markAt(state, index);
  const next: Mark =
    current === 'none' ? 'flag' : current === 'flag' && state.questionMarks ? 'question' : 'none';
  const marks = state.marks.slice();
  marks[index] = next;
  const flags = state.flags + (next === 'flag' ? 1 : 0) - (current === 'flag' ? 1 : 0);
  return { ...state, marks, flags };
}

/** Turning question marks off clears the ones already on the board. */
export function setQuestionMarks(state: GameState, enabled: boolean): GameState {
  if (state.questionMarks === enabled) return state;
  if (enabled) return { ...state, questionMarks: true };
  const marks = state.marks.map((mark): Mark => (mark === 'question' ? 'none' : mark));
  return { ...state, questionMarks: false, marks };
}

// ── what a cell looks like ────────────────────────────────────────────────

export type CellView =
  | { kind: 'hidden' }
  /** `wrong` is set once the game is lost and there was no mine under the flag. */
  | { kind: 'flag'; wrong: boolean }
  | { kind: 'question' }
  | { kind: 'empty' }
  | { kind: 'count'; count: number }
  | { kind: 'mine'; exploded: boolean };

export function cellView(state: GameState, index: number): CellView {
  if (!isRevealed(state, index)) {
    const mark = markAt(state, index);
    if (mark === 'flag')
      return { kind: 'flag', wrong: state.phase === 'lost' && !isMine(state, index) };
    if (mark === 'question') return { kind: 'question' };
    return { kind: 'hidden' };
  }
  if (isMine(state, index)) return { kind: 'mine', exploded: index === state.explodedAt };
  const count = adjacentAt(state, index);
  return count === 0 ? { kind: 'empty' } : { kind: 'count', count };
}
