/**
 * The words the app says: the clock, the line under the board, and the name
 * of every cell, which is the only thing a screen reader has to go on.
 */

import { DIFFICULTY_LABEL } from './generate';
import { columnOf, rowOf } from './grid';
import { isGiven, marksToDigits, type PlayState, remaining } from './play';

/** m:ss under an hour, h:mm:ss over it. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** What one cell is, read out: where it sits, what is in it, how it got there. */
export function cellName(state: PlayState, index: number): string {
  const where = `row ${rowOf(index) + 1}, column ${columnOf(index) + 1}`;
  const value = state.values[index] ?? 0;
  if (value !== 0) return `${where}, ${value}${isGiven(state, index) ? ', clue' : ''}`;
  const marks = marksToDigits(state.marks[index] ?? 0);
  if (marks.length > 0) return `${where}, pencilled ${marks.join(' ')}`;
  return `${where}, empty`;
}

/** The line under the board: the grade, and how much is left of it. */
export function progressLine(state: PlayState, finished: boolean): string {
  const grade = DIFFICULTY_LABEL[state.difficulty];
  if (finished) return `${grade} — solved`;
  const left = remaining(state);
  return `${grade} — ${left} ${left === 1 ? 'cell' : 'cells'} left`;
}

/** What Check found, said plainly. */
export function checkLine(wrong: number): string {
  if (wrong === 0) return 'Nothing wrong so far.';
  return wrong === 1 ? '1 entry is wrong.' : `${wrong} entries are wrong.`;
}
