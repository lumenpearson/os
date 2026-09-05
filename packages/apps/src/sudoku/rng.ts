/**
 * A seeded pseudo-random source. The generator takes one of these rather than
 * calling Math.random, so a seed reproduces a puzzle exactly — which is what
 * lets a saved game store a seed instead of a board, and lets the tests assert
 * on real generated puzzles rather than on hand-written fixtures.
 *
 * mulberry32: 32 bits of state, one multiply and a few shifts per draw. Not
 * cryptographic, and does not need to be — it shuffles eighty-one cells.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, bound). Zero when `bound` is not positive. */
  int(bound: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (bound) => (bound > 0 ? Math.floor(next() * bound) : 0) };
}

/** A seed for a fresh puzzle. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/**
 * Fisher–Yates on a copy. The result is always a permutation of the input,
 * which is what makes "try the cells in a random order" exact rather than a
 * rejection loop that could in principle never finish.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    // Both indices are inside the array, so neither read is undefined.
    const held = out[i] as T;
    out[i] = out[j] as T;
    out[j] = held;
  }
  return out;
}
