/**
 * Making a puzzle.
 *
 * Deal a complete grid from an empty one with the digits tried in a random
 * order, then take clues away one at a time, keeping a clue whenever removing
 * it would leave the board with more than one solution. What is left is a
 * proper puzzle: exactly one answer, and no clue in it is redundant.
 *
 * The grade is not the number of clues — minimal puzzles all sit within a few
 * clues of each other, and the count says almost nothing about the solve. It
 * is how far the two single rules in solve.ts get before a guess is needed:
 *
 *   easy    naked singles alone finish it;
 *   medium  naked and hidden singles together finish it;
 *   hard    propagation stalls, and the search finds the answer nearly
 *           straight away — at most one branch dies;
 *   expert  the search really backtracks.
 *
 * Removing a clue never makes a puzzle easier, so carving under a ceiling is
 * a plain greedy walk: offer every cell once, and put the clue back if taking
 * it out went past the ceiling.
 */

import { emptyGrid, type Grid, isDigit } from './grid';
import { type Rng, shuffle } from './rng';
import {
  hasUniqueSolution,
  searchEffort,
  solve,
  solvedByNakedSingles,
  solvedBySingles,
} from './solve';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

/**
 * The most dead ends a puzzle may cost the search and still count as hard.
 * At one, the search reads as "one guess, and if it was wrong the other digit
 * follows"; above it, it is backtracking.
 */
export const HARD_BACKTRACKS = 1;

/**
 * How many boards to deal before settling for the closest grade found. A
 * carve is a few milliseconds, and the harder the target the more often a
 * minimal puzzle lands a step below it, so the hard grades get more tries.
 */
export const ATTEMPTS: Record<Difficulty, number> = {
  easy: 3,
  medium: 4,
  hard: 8,
  expert: 24,
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function rankOf(difficulty: Difficulty): number {
  return DIFFICULTIES.indexOf(difficulty);
}

export interface Puzzle {
  /** The clues, 0 where the player has to work. */
  puzzle: number[];
  /** The one board those clues lead to. */
  solution: number[];
  /** The grade the puzzle came out at, which is not always the one asked for. */
  difficulty: Difficulty;
  clues: number;
}

/** A full, valid board, dealt from the given source. */
export function completeGrid(rng: Rng): number[] {
  const filled = solve(emptyGrid(), rng);
  if (!filled) throw new Error('an empty board always has a solution');
  return filled;
}

/** Where a board sits on the four-step scale. */
export function grade(puzzle: Grid): Difficulty {
  if (solvedByNakedSingles(puzzle)) return 'easy';
  if (solvedBySingles(puzzle)) return 'medium';
  const effort = searchEffort(puzzle);
  if (!effort) return 'expert';
  return effort.backtracks <= HARD_BACKTRACKS ? 'hard' : 'expert';
}

/** Whether a board is still no harder than `ceiling`. */
function within(puzzle: Grid, ceiling: Difficulty): boolean {
  switch (ceiling) {
    case 'easy':
      return solvedByNakedSingles(puzzle);
    case 'medium':
      return solvedBySingles(puzzle);
    case 'hard': {
      const effort = searchEffort(puzzle);
      return effort !== null && effort.backtracks <= HARD_BACKTRACKS;
    }
    default:
      return true;
  }
}

/**
 * Take clues out of a complete board for as long as the puzzle keeps exactly
 * one solution and stays within `ceiling`. Every cell is offered once, in the
 * order the source gives, so the same source carves the same puzzle.
 */
export function carve(solution: Grid, rng: Rng, ceiling: Difficulty): number[] {
  const puzzle = solution.slice();
  const order = shuffle(
    Array.from({ length: puzzle.length }, (_, index) => index),
    rng,
  );
  for (const index of order) {
    const held = puzzle[index];
    if (held === undefined || !isDigit(held)) continue;
    puzzle[index] = 0;
    if (!hasUniqueSolution(puzzle) || !within(puzzle, ceiling)) puzzle[index] = held;
  }
  return puzzle;
}

function distance(from: Difficulty, to: Difficulty): number {
  return Math.abs(rankOf(from) - rankOf(to));
}

/**
 * A puzzle at the asked-for grade. Carving under a ceiling rules out anything
 * harder, but not everything softer: a maximally carved board often lands a
 * step below the target, so this deals another one and tries again, keeping
 * the closest it has seen. The source is consumed in order either way, so the
 * same seed always gives the same puzzle.
 */
export function generate(rng: Rng, target: Difficulty, attempts = ATTEMPTS[target]): Puzzle {
  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const solution = completeGrid(rng);
    const puzzle = carve(solution, rng, target);
    const difficulty = grade(puzzle);
    const made: Puzzle = {
      puzzle,
      solution,
      difficulty,
      clues: puzzle.reduce<number>((total, value) => (isDigit(value) ? total + 1 : total), 0),
    };
    if (difficulty === target) return made;
    if (!best || distance(difficulty, target) < distance(best.difficulty, target)) best = made;
  }
  // The loop runs at least once, so `best` is set.
  return best as Puzzle;
}
