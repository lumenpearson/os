/**
 * Solving, and the two questions the rest of the app asks of a board: does it
 * have a solution, and does it have exactly one.
 *
 * The state during a solve is not a board but a candidate set per cell, held
 * as nine bits — bit 0 for the digit 1, bit 8 for the digit 9. Two rules are
 * applied until nothing changes:
 *
 *   naked single   a cell with one candidate left rules that digit out of its
 *                  twenty peers;
 *   hidden single  a digit with one place left in a unit goes there, however
 *                  many other candidates that cell still carries.
 *
 * That is *propagation*: no guessing, no undo, and it is what a person does
 * without calling it anything. When it stalls, the search picks the cell with
 * the fewest candidates left and tries them — the only place a guess happens,
 * and the thing `countSolutions` counts branches of.
 *
 * `countSolutions` stops at a cap. Asking "are there two?" is what makes
 * "exactly one solution" cheap enough to run eighty-one times while carving a
 * puzzle; asking "how many?" is not.
 */

import { CELLS, type Grid, isDigit, PEERS, SIZE, UNITS } from './grid';
import { type Rng, shuffle } from './rng';

/** Every digit still possible. */
export const ALL = 0b111111111;

/** Nine bits per cell: bit `d - 1` is set while the digit `d` is possible. */
export type Candidates = Uint16Array;

export function maskOf(digit: number): number {
  return 1 << (digit - 1);
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d += 1) {
    if ((mask & maskOf(d)) !== 0) out.push(d);
  }
  return out;
}

/** How many digits a mask still allows. */
export function candidateCount(mask: number): number {
  let bits = mask;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

const isSingle = (mask: number): boolean => mask !== 0 && (mask & (mask - 1)) === 0;

/**
 * The candidate sets a board starts from. Null when the board is not a board
 * — a wrong length, or a value that is not 0–9. A board that breaks the rules
 * is *not* rejected here; propagation finds that, and reports it the same way
 * it reports every other contradiction.
 */
export function toCandidates(grid: Grid): Candidates | null {
  if (grid.length !== CELLS) return null;
  const masks = new Uint16Array(CELLS).fill(ALL);
  for (let index = 0; index < CELLS; index += 1) {
    const value = grid[index] ?? 0;
    if (value === 0) continue;
    if (!isDigit(value)) return null;
    masks[index] = maskOf(value);
  }
  return masks;
}

/**
 * Apply both single rules until nothing changes. Returns false when the board
 * contradicts itself: a cell with no candidate left, or a digit with nowhere
 * left to go in some unit. `hidden` off runs naked singles alone, which is how
 * the easiest grade is defined.
 *
 * `expanded` marks the cells whose digit has already been ruled out of their
 * peers. A settled cell can only stay settled — elimination never puts a
 * candidate back — so that work is done once and never repeated, which is
 * what keeps a search that copies the state at every branch affordable.
 */
function reduce(masks: Candidates, expanded: Uint8Array, hidden: boolean): boolean {
  for (;;) {
    let changed = false;

    for (let index = 0; index < CELLS; index += 1) {
      const mask = masks[index] as number;
      if (mask === 0) return false;
      if (expanded[index] === 1 || !isSingle(mask)) continue;
      expanded[index] = 1;
      for (const peer of PEERS[index] as readonly number[]) {
        const before = masks[peer] as number;
        if ((before & mask) === 0) continue;
        const after = before & ~mask;
        if (after === 0) return false;
        masks[peer] = after;
        changed = true;
      }
    }

    if (hidden) {
      for (const unit of UNITS) {
        for (let d = 1; d <= SIZE; d += 1) {
          const bit = maskOf(d);
          let places = 0;
          let where = -1;
          for (const index of unit) {
            if (((masks[index] as number) & bit) !== 0) {
              places += 1;
              where = index;
            }
          }
          if (places === 0) return false;
          if (places === 1 && (masks[where] as number) !== bit) {
            masks[where] = bit;
            changed = true;
          }
        }
      }
    }

    if (!changed) return true;
  }
}

/** Both single rules, run to exhaustion on a board nothing has touched yet. */
export function propagate(masks: Candidates, hidden = true): boolean {
  return reduce(masks, new Uint8Array(CELLS), hidden);
}

/** Every cell is down to one candidate, so propagation has finished the board. */
export function settled(masks: Candidates): boolean {
  for (let index = 0; index < CELLS; index += 1) {
    if (!isSingle(masks[index] as number)) return false;
  }
  return true;
}

/** How many cells still carry more than one candidate. */
export function unsettled(masks: Candidates): number {
  let count = 0;
  for (let index = 0; index < CELLS; index += 1) {
    if (!isSingle(masks[index] as number)) count += 1;
  }
  return count;
}

/** The board a settled candidate set describes; 0 where a cell is undecided. */
export function toGrid(masks: Candidates): number[] {
  const grid: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    const mask = masks[index] as number;
    grid.push(isSingle(mask) ? (digitsOf(mask)[0] as number) : 0);
  }
  return grid;
}

/** The undecided cell with the fewest candidates, or -1 when none is left. */
function mostConstrained(masks: Candidates): number {
  let best = -1;
  let fewest = SIZE + 1;
  for (let index = 0; index < CELLS; index += 1) {
    const count = candidateCount(masks[index] as number);
    if (count <= 1 || count >= fewest) continue;
    best = index;
    fewest = count;
    if (count === 2) break;
  }
  return best;
}

interface Stats {
  guesses: number;
  backtracks: number;
}

function search(
  masks: Candidates,
  expanded: Uint8Array,
  rng: Rng | null,
  stats: Stats | null,
): Candidates | null {
  if (!reduce(masks, expanded, true)) return null;
  const index = mostConstrained(masks);
  if (index === -1) return masks;
  if (stats) stats.guesses += 1;
  const options = digitsOf(masks[index] as number);
  for (const digit of rng ? shuffle(options, rng) : options) {
    const next = masks.slice();
    next[index] = maskOf(digit);
    const found = search(next, expanded.slice(), rng, stats);
    if (found) return found;
    if (stats) stats.backtracks += 1;
  }
  return null;
}

/**
 * One solution, or null when there is none. Pass an `rng` to walk the digits
 * in a random order — that is how a complete grid is dealt from an empty one.
 */
export function solve(grid: Grid, rng: Rng | null = null): number[] | null {
  const masks = toCandidates(grid);
  if (!masks) return null;
  const found = search(masks, new Uint8Array(CELLS), rng, null);
  return found ? toGrid(found) : null;
}

function count(masks: Candidates, expanded: Uint8Array, cap: number): number {
  if (cap <= 0) return 0;
  if (!reduce(masks, expanded, true)) return 0;
  const index = mostConstrained(masks);
  if (index === -1) return 1;
  let total = 0;
  for (const digit of digitsOf(masks[index] as number)) {
    const next = masks.slice();
    next[index] = maskOf(digit);
    total += count(next, expanded.slice(), cap - total);
    if (total >= cap) return total;
  }
  return total;
}

/**
 * How many solutions a board has, counted no further than `cap`. The default
 * cap of two answers the only question a generator ever needs.
 */
export function countSolutions(grid: Grid, cap = 2): number {
  const masks = toCandidates(grid);
  if (!masks) return 0;
  return count(masks, new Uint8Array(CELLS), Math.max(0, Math.floor(cap)));
}

/** A proper puzzle: one solution, not none and not several. */
export function hasUniqueSolution(grid: Grid): boolean {
  return countSolutions(grid, 2) === 1;
}

/** Naked singles alone finish the board. */
export function solvedByNakedSingles(grid: Grid): boolean {
  const masks = toCandidates(grid);
  if (!masks) return false;
  return propagate(masks, false) && settled(masks);
}

/** Naked and hidden singles together finish the board. */
export function solvedBySingles(grid: Grid): boolean {
  const masks = toCandidates(grid);
  if (!masks) return false;
  return propagate(masks, true) && settled(masks);
}

export interface Effort {
  /** Branch points the search opens, failed branches included. */
  guesses: number;
  /** Branches that ran into a contradiction — the search actually backing up. */
  backtracks: number;
}

/** What a full search costs, or null when the board has no solution at all. */
export function searchEffort(grid: Grid): Effort | null {
  const masks = toCandidates(grid);
  if (!masks) return null;
  const stats: Stats = { guesses: 0, backtracks: 0 };
  const found = search(masks, new Uint8Array(CELLS), null, stats);
  return found ? { guesses: stats.guesses, backtracks: stats.backtracks } : null;
}

export interface Analysis extends Effort {
  solvable: boolean;
  /** Naked singles alone finish it. */
  naked: boolean;
  /** Naked and hidden singles together finish it. */
  singles: boolean;
  /** Cells still undecided where propagation stalls. */
  stalled: number;
}

/** Everything the grader wants to know about a board. */
export function analyse(grid: Grid): Analysis {
  const masks = toCandidates(grid);
  if (!masks) {
    return {
      solvable: false,
      naked: false,
      singles: false,
      stalled: CELLS,
      guesses: 0,
      backtracks: 0,
    };
  }
  const naked = solvedByNakedSingles(grid);
  const expanded = new Uint8Array(CELLS);
  const propagated = reduce(masks, expanded, true);
  const singles = propagated && settled(masks);
  const stalled = propagated ? unsettled(masks) : CELLS;
  const stats: Stats = { guesses: 0, backtracks: 0 };
  const solvable = propagated && search(masks.slice(), expanded.slice(), null, stats) !== null;
  return {
    solvable,
    naked,
    singles,
    stalled,
    guesses: stats.guesses,
    backtracks: stats.backtracks,
  };
}
