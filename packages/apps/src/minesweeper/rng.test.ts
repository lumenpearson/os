import { describe, expect, it } from 'vitest';
import { createRng, randomSeed, shuffle } from './rng';

const draw = (seed: number, count: number) => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe('createRng', () => {
  it('repeats itself for the same seed and differs for another', () => {
    expect(draw(1234, 8)).toEqual(draw(1234, 8));
    expect(draw(1234, 8)).not.toEqual(draw(1235, 8));
  });

  it('stays inside [0, 1)', () => {
    for (const value of draw(7, 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads int() over the whole range', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      const value = rng.int(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('returns 0 for an empty range', () => {
    expect(createRng(1).int(0)).toBe(0);
    expect(createRng(1).int(-4)).toBe(0);
  });
});

describe('shuffle', () => {
  const input = Array.from({ length: 64 }, (_, i) => i);

  it('is a permutation: every element comes out exactly once', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const out = shuffle(input, createRng(seed));
      expect(out).toHaveLength(input.length);
      expect([...out].sort((a, b) => a - b)).toEqual(input);
    }
  });

  it('leaves the input untouched', () => {
    const source = [1, 2, 3, 4, 5];
    shuffle(source, createRng(3));
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });

  it('actually moves things', () => {
    expect(shuffle(input, createRng(11))).not.toEqual(input);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(['only'], createRng(1))).toEqual(['only']);
  });

  it('is reproducible from the seed', () => {
    expect(shuffle(input, createRng(5))).toEqual(shuffle(input, createRng(5)));
  });
});

describe('randomSeed', () => {
  it('gives an unsigned 32-bit integer', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(0x100000000);
    }
  });
});
