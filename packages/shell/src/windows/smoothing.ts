/**
 * Smoothing for a window being dragged.
 *
 * Settings > Animation > "Smooth a window while it is dragged" is off by
 * default, because a window that lags the hand reads as a slow machine rather
 * than as polish. Turned on, the window chases the pointer instead of being
 * pinned to it: each frame it covers a fixed fraction of the distance that is
 * left, so the motion is the same at 60 Hz and at 120 Hz and the window still
 * arrives wherever the pointer stopped.
 */

/** Milliseconds for the remaining distance to halve. */
export const DRAG_HALF_LIFE = 45;

/** Below this the eye cannot see the difference, so stop chasing. */
const SETTLED = 0.5;

/**
 * One frame of the chase: `current` moved toward `target` over `dt`
 * milliseconds. Returns `target` exactly once the two are within half a pixel,
 * so a drag ends on the number the pointer chose rather than near it.
 */
export function approach(
  current: number,
  target: number,
  dt: number,
  halfLife = DRAG_HALF_LIFE,
): number {
  if (halfLife <= 0 || dt <= 0) return Math.abs(target - current) < SETTLED ? target : current;
  if (Math.abs(target - current) < SETTLED) return target;
  return target + (current - target) * 2 ** (-dt / halfLife);
}

/** Whether a frame changed anything worth painting. */
export function settled(current: { x: number; y: number }, target: { x: number; y: number }) {
  return current.x === target.x && current.y === target.y;
}
