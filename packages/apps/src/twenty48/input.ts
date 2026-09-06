/**
 * Turning what a person did into a direction: the arrow keys, WASD, and a
 * drag across the board. One place, so the keyboard and the pointer cannot
 * drift apart.
 */

import type { Direction } from './board';

const KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
};

/** What a key press carries that decides whether the board should have it. */
export interface KeyPress {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * The direction a key press means, or null if it means nothing here.
 *
 * A modifier means the press belongs to somebody else. W, A, S and D are the
 * second way to play, and they are also the second half of Ctrl+W, Ctrl+A,
 * Ctrl+S and Ctrl+D — close, select all, save, duplicate. Reading the letter
 * without looking at the modifier made the board answer all four and call
 * `preventDefault`, so a game of 2048 was a window that could not be closed
 * from the keyboard at all.
 */
export function directionForKey(press: KeyPress): Direction | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  return KEYS[press.key] ?? KEYS[press.key.toLowerCase()] ?? null;
}

/** A drag shorter than this is a click, not a swipe. */
export const SWIPE_THRESHOLD = 24;

/**
 * The direction of a drag. The longer axis wins, so a diagonal resolves to
 * whichever way the hand actually went; a drag that is too short is nothing.
 */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD,
): Direction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  if (Math.max(across, down) < threshold) return null;
  if (across >= down) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
