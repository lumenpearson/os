/**
 * Where the app reads time, and how often it looks.
 *
 * `now()` is the monotonic clock every stopwatch and countdown timestamp comes
 * from — it cannot jump when the wall clock is set or the machine changes zone.
 * `useFrames` runs a callback once per animation frame, which the browser stops
 * for a hidden window and resumes on return; because every reading is a
 * subtraction of timestamps, missing those frames costs nothing but the pixels.
 */

import { useLatest } from '@lumen/ui';
import { useEffect, useState } from 'react';

/** Monotonic milliseconds. Only differences between two of these mean anything. */
export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Run `onFrame` on every animation frame while `active`. */
export function useFrames(active: boolean, onFrame: () => void): void {
  const latest = useLatest(onFrame);
  useEffect(() => {
    if (!active || typeof requestAnimationFrame !== 'function') return;
    let handle = requestAnimationFrame(function frame() {
      latest.current();
      handle = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(handle);
  }, [active, latest]);
}

/**
 * Wall-clock milliseconds, re-read on an interval. For the things that change
 * on the hour rather than on the frame: which day it is in a zone, how far a
 * zone is from here across a daylight-saving change.
 */
export function useWallClock(intervalMs = 30_000): number {
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAt(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return at;
}
