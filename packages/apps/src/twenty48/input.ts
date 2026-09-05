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

/** The direction a key means, or null if it means nothing here. */
export function directionForKey(key: string): Direction | null {
  return KEYS[key] ?? KEYS[key.toLowerCase()] ?? null;
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
