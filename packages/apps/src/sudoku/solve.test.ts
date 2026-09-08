import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { CELLS, emptyGrid, formatGrid, indexAt, parseGrid, peersOf } from './grid';
import { createRng } from './rng';
import {
  ALL,
  analyse,
  candidateCount,
  countSolutions,
  digitsOf,
  hasUniqueSolution,
  maskOf,
  propagate,
  searchEffort,
  settled,
  solve,
  solvedByNakedSingles,
  solvedBySingles,
  toCandidates,
  toGrid,
  unsettled,
} from './solve';

/** A published easy puzzle and its answer. */
const EASY = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const EASY_SOLUTION =
  '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

/**
 * An independent naked-singles solver, written the slow obvious way: look at
 * a cell, list the digits none of its peers has, and if exactly one is left,
 * write it. It shares no code with solve.ts, so agreeing with it is evidence
 * the bitmask propagation means what it says.
 */
function naiveNakedSingles(grid: readonly number[]): number[] | null {
  const board = grid.slice();
  for (;;) {
    let changed = false;
    for (let index = 0; index < CELLS; index += 1) {
      if (board[index] !== 0) continue;
      const taken = new Set(peersOf(index).map((peer) => board[peer]));
      const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => !taken.has(digit));
      if (options.length === 0) return null;
      if (options.length === 1) {
        board[index] = options[0] as number;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return board.every((value) => value !== 0) ? board : null;
}

describe('candidate masks', () => {
  it('turns digits into bits and back', () => {
    expect(maskOf(1)).toBe(1);
    expect(maskOf(9)).toBe(256);
    expect(digitsOf(ALL)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(digitsOf(maskOf(3) | maskOf(7))).toEqual([3, 7]);
    expect(digitsOf(0)).toEqual([]);
  });

  it('counts the digits a mask still allows', () => {
    expect(candidateCount(0)).toBe(0);
    expect(candidateCount(maskOf(4))).toBe(1);
    expect(candidateCount(ALL)).toBe(9);
  });

  it('refuses a board that is not a board', () => {
    expect(toCandidates([1, 2, 3])).toBeNull();
    const bad = emptyGrid();
    bad[0] = 12;
    expect(toCandidates(bad)).toBeNull();
  });

  it('starts a clue on one candidate and an empty cell on all nine', () => {
    const grid = emptyGrid();
    grid[0] = 6;
    const masks = toCandidates(grid) as Uint16Array;
    expect(masks[0]).toBe(maskOf(6));
    expect(masks[1]).toBe(ALL);
  });
});

describe('propagation', () => {
  it('rules a clue out of its peers', () => {
    const grid = emptyGrid();
    grid[0] = 6;
    const masks = toCandidates(grid) as Uint16Array;
    expect(propagate(masks)).toBe(true);
    for (const peer of peersOf(0)) expect((masks[peer] as number) & maskOf(6)).toBe(0);
    expect((masks[80] as number) & maskOf(6)).not.toBe(0);
  });

  it('reports a board that contradicts itself', () => {
    const grid = emptyGrid();
    grid[0] = 4;
    grid[1] = 4;
    const masks = toCandidates(grid) as Uint16Array;
    expect(propagate(masks)).toBe(false);
  });

  it('places a hidden single that no naked single would find', () => {
    // Four 1s that see none of each other, arranged so the only cell of the
    // top-left box left able to hold a 1 is its bottom-right corner — which
    // still has eight other candidates, so no naked single reaches it.
    const grid = emptyGrid();
    grid[indexAt(0, 3)] = 1;
    grid[indexAt(1, 6)] = 1;
    grid[indexAt(3, 0)] = 1;
    grid[indexAt(7, 1)] = 1;
    const corner = indexAt(2, 2);

    const nakedOnly = toCandidates(grid) as Uint16Array;
    expect(propagate(nakedOnly, false)).toBe(true);
    expect(candidateCount(nakedOnly[corner] as number)).toBeGreaterThan(1);

    const withHidden = toCandidates(grid) as Uint16Array;
    expect(propagate(withHidden, true)).toBe(true);
    expect(withHidden[corner]).toBe(maskOf(1));
  });

  it('leaves an empty board completely undecided', () => {
    const masks = toCandidates(emptyGrid()) as Uint16Array;
    expect(propagate(masks)).toBe(true);
    expect(settled(masks)).toBe(false);
    expect(unsettled(masks)).toBe(CELLS);
    expect(toGrid(masks).every((value) => value === 0)).toBe(true);
  });
});

describe('solve', () => {
  it('solves a published puzzle to its published answer', () => {
    const grid = parseGrid(EASY) as number[];
    expect(formatGrid(solve(grid) as number[])).toBe(EASY_SOLUTION);
  });

  it('fills an empty board, differently for different seeds', () => {
    const first = solve(emptyGrid(), createRng(1)) as number[];
    const second = solve(emptyGrid(), createRng(2)) as number[];
    expect(formatGrid(first)).not.toBe(formatGrid(second));
    expect(formatGrid(solve(emptyGrid(), createRng(1)) as number[])).toBe(formatGrid(first));
  });

  it('returns null for a board with no answer', () => {
    const grid = emptyGrid();
    grid[0] = 1;
    grid[1] = 1;
    expect(solve(grid)).toBeNull();
    expect(solve([1, 2, 3])).toBeNull();
  });
});

describe('counting solutions', () => {
  it('stops at the cap instead of counting them all', () => {
    expect(countSolutions(emptyGrid(), 2)).toBe(2);
    expect(countSolutions(emptyGrid(), 1)).toBe(1);
    expect(countSolutions(emptyGrid(), 0)).toBe(0);
  });

  it('finds exactly one for a proper puzzle', () => {
    const grid = parseGrid(EASY) as number[];
    expect(countSolutions(grid, 2)).toBe(1);
    expect(hasUniqueSolution(grid)).toBe(true);
  });

  it('finds none for a board that contradicts itself', () => {
    const grid = parseGrid(EASY) as number[];
    grid[1] = grid[0] === 0 ? 3 : (grid[0] as number);
    grid[0] = grid[1] as number;
    expect(countSolutions(grid)).toBe(0);
    expect(hasUniqueSolution(grid)).toBe(false);
  });

  it('finds two once a clue is taken out of a minimal puzzle', () => {
    const made = generate(createRng(20260905), 'medium');
    const index = made.puzzle.findIndex((value) => value !== 0);
    const loosened = made.puzzle.slice();
    loosened[index] = 0;
    expect(hasUniqueSolution(made.puzzle)).toBe(true);
    // Minimal means every clue is load-bearing.
    expect(countSolutions(loosened, 2)).toBe(2);
    expect(hasUniqueSolution(loosened)).toBe(false);
  });

  it('counts nothing for a board that is not a board', () => {
    expect(countSolutions([1, 2, 3])).toBe(0);
  });
});

describe('grading signals', () => {
  it('agrees with an independent naked-singles solver on an easy puzzle', () => {
    const grid = parseGrid(EASY) as number[];
    expect(solvedByNakedSingles(grid)).toBe(true);
    expect(formatGrid(naiveNakedSingles(grid) as number[])).toBe(EASY_SOLUTION);
  });

  it('agrees with it on generated puzzles, both ways', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const easy = generate(createRng(seed * 7919), 'easy');
      expect(solvedByNakedSingles(easy.puzzle)).toBe(true);
      expect(naiveNakedSingles(easy.puzzle)).not.toBeNull();

      const medium = generate(createRng(seed * 104729), 'medium');
      expect(solvedByNakedSingles(medium.puzzle)).toBe(false);
      expect(naiveNakedSingles(medium.puzzle)).toBeNull();
      expect(solvedBySingles(medium.puzzle)).toBe(true);
    }
  });

  it('reports no guesses when propagation is enough', () => {
    const grid = parseGrid(EASY) as number[];
    expect(searchEffort(grid)).toEqual({ guesses: 0, backtracks: 0 });
  });

  it('reports guesses and dead ends when it is not', () => {
    const expert = generate(createRng(4242), 'expert');
    const effort = searchEffort(expert.puzzle);
    expect(effort).not.toBeNull();
    expect(effort?.guesses).toBeGreaterThan(0);
    expect(effort?.backtracks).toBeGreaterThan(1);
  });

  it('reports nothing for a board with no answer', () => {
    const grid = emptyGrid();
    grid[0] = 2;
    grid[1] = 2;
    expect(searchEffort(grid)).toBeNull();
  });

  it('describes a puzzle in one analysis', () => {
    const grid = parseGrid(EASY) as number[];
    expect(analyse(grid)).toEqual({
      solvable: true,
      naked: true,
      singles: true,
      stalled: 0,
      guesses: 0,
      backtracks: 0,
    });
  });

  it('describes an impossible board as unsolvable', () => {
    const grid = emptyGrid();
    grid[0] = 8;
    grid[1] = 8;
    const analysis = analyse(grid);
    expect(analysis.solvable).toBe(false);
    expect(analysis.naked).toBe(false);
    expect(analysis.singles).toBe(false);
    expect(analyse([1, 2]).solvable).toBe(false);
  });
});
