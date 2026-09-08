/**
 * The words and the type treatment a cell gets: the accessible name a screen
 * reader announces, the sentence the live region reads out, and the class
 * that tells the eight numbers apart.
 */

import { columnOf, rowOf } from './board';
import { cellView, elapsedMs, type GameState, remainingMines } from './reveal';

/** m:ss, held at 99:59 so the clock never changes width. */
export function formatClock(ms: number): string {
  const total = Math.min(99 * 60 + 59, Math.max(0, Math.floor(ms / 1000)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What a cell is, in words. Position first, so arrowing around stays oriented. */
export function cellName(state: GameState, index: number): string {
  const where = `Row ${rowOf(state.board.width, index) + 1}, column ${columnOf(state.board.width, index) + 1}`;
  const view = cellView(state, index);
  switch (view.kind) {
    case 'hidden':
      return `${where}, hidden`;
    case 'flag':
      return view.wrong ? `${where}, flagged, no mine here` : `${where}, flagged`;
    case 'question':
      return `${where}, marked with a question mark`;
    case 'empty':
      return `${where}, revealed, no adjacent mines`;
    case 'count':
      return `${where}, revealed, ${plural(view.count, 'adjacent mine')}`;
    case 'mine':
      return view.exploded ? `${where}, mine, hit` : `${where}, mine`;
  }
}

/** The line the live region reads: the count while playing, the outcome after. */
export function statusMessage(state: GameState, now: number): string {
  switch (state.phase) {
    case 'ready':
      return `Ready. ${plural(state.config.mines, 'mine')}.`;
    case 'playing': {
      const left = remainingMines(state);
      if (left < 0) return `${plural(-left, 'flag')} more than there are mines.`;
      return `${plural(left, 'mine')} left.`;
    }
    case 'won':
      return `Swept in ${formatClock(elapsedMs(state, now))}.`;
    case 'lost':
      return 'Mine hit.';
  }
}

/**
 * The eight counts, told apart by three ordered signals rather than a
 * rainbow: weight rises with the count, the accent takes over from the
 * neutral ramp at five, and an underline marks the last two. Every step is
 * either a weight or the one accent colour, so all eight hold up in both
 * themes and none of them invents a hue.
 */
const NUMBER_CLASS: readonly string[] = [
  'text-ink-3 font-medium',
  'text-ink-2 font-medium',
  'text-ink font-medium',
  'text-ink font-bold',
  'text-accent font-medium',
  'text-accent font-bold',
  'text-ink font-bold underline decoration-2 decoration-accent underline-offset-2',
  'text-accent font-bold underline decoration-2 decoration-accent underline-offset-2',
];

export function numberClass(count: number): string {
  return NUMBER_CLASS[count - 1] ?? 'text-ink';
}

export const NUMBER_CLASSES = NUMBER_CLASS;
