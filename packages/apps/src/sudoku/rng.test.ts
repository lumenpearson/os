import { describe, expect, it } from 'vitest';
import { createRng, randomSeed, shuffle } from './rng';

describe('createRng', () => {
  it('gives the same run of numbers for the same seed', () => {
    const draw = (seed: number) => Array.from({ length: 8 }, () => createRng(seed).next());
    expect(draw(42)).toEqual(draw(42));
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 8 }, () => a.next())).toEqual(
      Array.from({ length: 8 }, () => b.next()),
    );
  });

  it('gives a different run for a different seed', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 8 }, () => a.next())).not.toEqual(
      Array.from({ length: 8 }, () => b.next()),
    );
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws integers below the bound, and nothing at all below one', () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(9);
    }
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-3)).toBe(0);
  });

  it('reaches every value in a small range', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) seen.add(rng.int(9));
    expect(seen.size).toBe(9);
  });
});

describe('shuffle', () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('always returns a permutation, never a subset', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const out = shuffle(items, createRng(seed));
      expect(out).toHaveLength(items.length);
      expect([...out].sort((a, b) => a - b)).toEqual(items);
    }
  });

  it('leaves the input alone', () => {
    const source = items.slice();
    shuffle(source, createRng(3));
    expect(source).toEqual(items);
  });

  it('shuffles the same way for the same seed', () => {
    expect(shuffle(items, createRng(5))).toEqual(shuffle(items, createRng(5)));
  });

  it('actually moves things around', () => {
    const orders = new Set(
      Array.from({ length: 10 }, (_, seed) => shuffle(items, createRng(seed)).join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('handles the empty and single cases', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(['x'], createRng(1))).toEqual(['x']);
  });
});

describe('randomSeed', () => {
  it('is a whole unsigned 32-bit number', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(0x100000000);
    }
  });
});
