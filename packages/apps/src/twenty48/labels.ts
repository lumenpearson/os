/**
 * The words and the numbers as they are read out: the status line, the label
 * on a cell, and the sentence a screen reader hears after a move.
 */

import { columnOf, rowOf, valueAt } from './board';
import { type GameState, highest, isOver, WIN_VALUE } from './game';

/** Scores get long. Group them the way the reader's region does. */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.max(0, Math.floor(value)).toLocaleString();
}

/** The move count, so a single move does not read "1 moves". */
export function formatMoves(count: number): string {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${formatScore(whole)} ${whole === 1 ? 'move' : 'moves'}`;
}

/** One line under the board: what has happened, or how to play. */
export function statusMessage(state: GameState): string {
  if (isOver(state)) return 'No moves left. Start a new game or undo.';
  if (state.won) return `${WIN_VALUE} reached. Keep going.`;
  if (state.moves === 0) return 'Arrow keys or WASD to slide. Drag works too.';
  return `Highest tile ${formatScore(highest(state))}.`;
}

/** What a cell is, for the reader walking the grid. */
export function cellName(state: GameState, index: number): string {
  const value = valueAt(state.board, index);
  const where = `row ${rowOf(index) + 1}, column ${columnOf(index) + 1}`;
  return value === 0 ? `${where}, empty` : `${where}, ${value}`;
}

/** The sentence announced after each move. */
export function boardSummary(state: GameState): string {
  const head = `Score ${formatScore(state.score)}, highest tile ${formatScore(highest(state))}.`;
  if (isOver(state)) return `${head} No moves left.`;
  if (state.won) return `${head} ${WIN_VALUE} reached.`;
  return head;
}
