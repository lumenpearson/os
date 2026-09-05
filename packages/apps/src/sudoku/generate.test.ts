import { describe, expect, it } from 'vitest';
import {
  ATTEMPTS,
  carve,
  completeGrid,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  generate,
  grade,
  isDifficulty,
  rankOf,
} from './generate';
import { clueCount, formatGrid, isSolved, parseGrid } from './grid';
import { createRng } from './rng';
import { hasUniqueSolution, solve, solvedByNakedSingles, solvedBySingles } from './solve';

const EASY = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';

describe('difficulties', () => {
  it('names four grades, in order', () => {
    expect([...DIFFICULTIES]).toEqual(['easy', 'medium', 'hard', 'expert']);
    expect(DIFFICULTIES.map(rankOf)).toEqual([0, 1, 2, 3]);
    expect(DIFFICULTIES.map((d) => DIFFICULTY_LABEL[d])).toEqual([
      'Easy',
      'Medium',
      'Hard',
      'Expert',
    ]);
    expect(DIFFICULTIES.every((d) => ATTEMPTS[d] > 0)).toBe(true);
  });

  it('recognises a grade and refuses anything else', () => {
    expect(isDifficulty('hard')).toBe(true);
    expect(isDifficulty('fiendish')).toBe(false);
    expect(isDifficulty(2)).toBe(false);
    expect(isDifficulty(null)).toBe(false);
  });
});

describe('completeGrid', () => {
  it('deals a solved board', () => {
    const grid = completeGrid(createRng(7));
    expect(isSolved(grid)).toBe(true);
    expect(clueCount(grid)).toBe(81);
  });

  it('deals the same board from the same seed and a different one otherwise', () => {
    expect(formatGrid(completeGrid(createRng(7)))).toBe(formatGrid(completeGrid(createRng(7))));
    expect(formatGrid(completeGrid(createRng(7)))).not.toBe(formatGrid(completeGrid(createRng(8))));
  });
});

describe('grade', () => {
  it('calls a published easy puzzle easy', () => {
    expect(grade(parseGrid(EASY) as number[])).toBe('easy');
  });

  it('calls a complete board easy — there is nothing left to do', () => {
    expect(grade(completeGrid(createRng(3)))).toBe('easy');
  });

  it('agrees with the rules it is defined by', () => {
    for (const target of DIFFICULTIES) {
      const made = generate(createRng(31337), target);
      const naked = solvedByNakedSingles(made.puzzle);
      const singles = solvedBySingles(made.puzzle);
      if (made.difficulty === 'easy') expect(naked).toBe(true);
      if (made.difficulty === 'medium') expect([naked, singles]).toEqual([false, true]);
      if (made.difficulty === 'hard' || made.difficulty === 'expert') expect(singles).toBe(false);
    }
  });
});

describe('carve', () => {
  it('leaves a puzzle with exactly one solution, and that solution', () => {
    const rng = createRng(99);
    const solution = completeGrid(rng);
    const puzzle = carve(solution, rng, 'medium');
    expect(hasUniqueSolution(puzzle)).toBe(true);
    expect(formatGrid(solve(puzzle) as number[])).toBe(formatGrid(solution));
  });

  it('only ever removes clues, never changes them', () => {
    const rng = createRng(1234);
    const solution = completeGrid(rng);
    const puzzle = carve(solution, rng, 'easy');
    puzzle.forEach((value, index) => {
      if (value !== 0) expect(value).toBe(solution[index]);
    });
    expect(clueCount(puzzle)).toBeLessThan(81);
  });

  it('holds its ceiling: a board carved as easy stays easy', () => {
    const rng = createRng(555);
    const puzzle = carve(completeGrid(rng), rng, 'easy');
    expect(solvedByNakedSingles(puzzle)).toBe(true);
  });

  it('carves further under a higher ceiling', () => {
    const easy = carve(completeGrid(createRng(2)), createRng(11), 'easy');
    const expert = carve(completeGrid(createRng(2)), createRng(11), 'expert');
    expect(clueCount(expert)).toBeLessThanOrEqual(clueCount(easy));
  });
});

describe('generate', () => {
  it('reproduces a puzzle exactly from the same seed', () => {
    const first = generate(createRng(20260905), 'hard');
    const second = generate(createRng(20260905), 'hard');
    expect(formatGrid(first.puzzle)).toBe(formatGrid(second.puzzle));
    expect(formatGrid(first.solution)).toBe(formatGrid(second.solution));
    expect(first.difficulty).toBe(second.difficulty);
    expect(first.clues).toBe(second.clues);
  });

  it('makes a different puzzle from a different seed', () => {
    const first = generate(createRng(1), 'medium');
    const second = generate(createRng(2), 'medium');
    expect(formatGrid(first.puzzle)).not.toBe(formatGrid(second.puzzle));
  });

  it('makes a proper puzzle at every grade', () => {
    for (const target of DIFFICULTIES) {
      const made = generate(createRng(4242), target);
      expect(made.difficulty).toBe(target);
      expect(isSolved(made.solution)).toBe(true);
      expect(hasUniqueSolution(made.puzzle)).toBe(true);
      expect(formatGrid(solve(made.puzzle) as number[])).toBe(formatGrid(made.solution));
      expect(made.clues).toBe(clueCount(made.puzzle));
      expect(made.clues).toBeGreaterThanOrEqual(17);
      expect(made.clues).toBeLessThan(81);
    }
  });

  it('hits the asked-for grade across a run of seeds', () => {
    for (const target of DIFFICULTIES) {
      for (let seed = 1; seed <= 3; seed += 1) {
        expect(generate(createRng(seed * 8191), target).difficulty).toBe(target);
      }
    }
  }, 30000);

  it('returns the closest grade it found rather than nothing', () => {
    // One attempt at the rarest grade will usually fall short; the puzzle it
    // hands back is still a proper puzzle.
    const made = generate(createRng(11), 'expert', 1);
    expect(hasUniqueSolution(made.puzzle)).toBe(true);
    expect(DIFFICULTIES).toContain(made.difficulty);
  });
});
