/**
 * Bounded undo, as a stack of whole-image snapshots.
 *
 * The alternative is a command model — record "brush stroke, these points,
 * this colour" and replay or invert it. That model is smaller in memory and
 * wrong in a dozen quiet ways: every tool has to know how to invert itself,
 * a flood fill's inverse is the region it changed rather than the command
 * that made it, and one tool that forgets to record something corrupts the
 * document silently on the third undo. A snapshot cannot be subtly wrong; it
 * can only be big. So the stack is capped twice — by depth and by total
 * bytes — and the app pushes one snapshot per finished gesture, not per
 * pointer move.
 *
 * Nothing here knows about ImageData: `T` is whatever the caller stores, which
 * keeps the eviction rules testable without a canvas.
 */

export interface History<T> {
  /** Oldest first; the state before each committed change. */
  past: readonly T[];
  present: T;
  /** Next-to-redo first. */
  future: readonly T[];
}

export interface HistoryLimits<T> {
  /** How many undo steps to keep. */
  depth: number;
  /** Total budget across past, present and future. Needs `sizeOf`. */
  maxBytes?: number;
  sizeOf?: (entry: T) => number;
}

/** 32 steps of a 1000×1000 image is about 128 MB; the byte cap bites first. */
export const DEFAULT_LIMITS: HistoryLimits<unknown> = { depth: 32, maxBytes: 192 * 1024 * 1024 };

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function depth<T>(history: History<T>): number {
  return history.past.length;
}

export function totalBytes<T>(history: History<T>, sizeOf: (entry: T) => number): number {
  const entries = [...history.past, history.present, ...history.future];
  return entries.reduce((sum, entry) => sum + sizeOf(entry), 0);
}

/**
 * Record a new present. The redo branch goes: once the document has moved on,
 * the states that used to follow it no longer belong to anything.
 */
export function push<T>(
  history: History<T>,
  present: T,
  limits: HistoryLimits<T> = { depth: 32 },
): History<T> {
  const cap = Math.max(0, Math.floor(limits.depth));
  const grown = [...history.past, history.present];
  return evict({ past: grown.slice(Math.max(0, grown.length - cap)), present, future: [] }, limits);
}

/** Drop the oldest undo steps until the whole stack fits the byte budget. */
function evict<T>(history: History<T>, limits: HistoryLimits<T>): History<T> {
  const { maxBytes, sizeOf } = limits;
  if (maxBytes === undefined || !sizeOf) return history;
  let past = history.past;
  let bytes = totalBytes(history, sizeOf);
  while (bytes > maxBytes && past.length > 0) {
    const dropped = past[0] as T;
    bytes -= sizeOf(dropped);
    past = past.slice(1);
  }
  return past === history.past ? history : { ...history, past };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

/** Keep what is on screen, forget how it got there (a new or freshly opened file). */
export function clear<T>(history: History<T>, present = history.present): History<T> {
  return { past: [], present, future: [] };
}
