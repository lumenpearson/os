import { describe, expect, it } from 'vitest';
import {
  barCountFor,
  barHeight,
  binRange,
  decayBars,
  groupBands,
  isSilent,
  smoothBars,
} from './visualiser';

describe('binRange', () => {
  it('covers every bin exactly once, in order', () => {
    const bars = 16;
    const binCount = 256;
    let previousEnd = 0;
    for (let bar = 0; bar < bars; bar++) {
      const [start, end] = binRange(bar, bars, binCount);
      expect(start).toBe(previousEnd);
      expect(end).toBeGreaterThan(start);
      previousEnd = end;
    }
    expect(previousEnd).toBe(binCount);
  });

  it('gives low bars fewer bins than high ones', () => {
    const [firstStart, firstEnd] = binRange(0, 12, 512);
    const [lastStart, lastEnd] = binRange(11, 12, 512);
    expect(firstEnd - firstStart).toBeLessThan(lastEnd - lastStart);
  });

  it('never returns an empty range when there are more bars than bins', () => {
    for (let bar = 0; bar < 20; bar++) {
      const [start, end] = binRange(bar, 20, 4);
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(4);
    }
  });

  it('handles the degenerate cases', () => {
    expect(binRange(0, 8, 0)).toEqual([0, 0]);
    expect(binRange(0, 0, 32)).toEqual([0, 32]);
  });
});

describe('groupBands', () => {
  it('averages bins into 0–1 levels', () => {
    const bins = new Uint8Array(64).fill(255);
    expect(groupBands(bins, 8)).toEqual(Array(8).fill(1));
    expect(groupBands(new Uint8Array(64), 8)).toEqual(Array(8).fill(0));
  });

  it('follows where the energy is', () => {
    const bins = new Uint8Array(128);
    bins.fill(200, 0, 4);
    const bars = groupBands(bins, 8);
    expect(bars[0]).toBeGreaterThan(0.5);
    expect(bars[7]).toBe(0);
  });

  it('returns a level for every bar even without bins', () => {
    expect(groupBands([], 5)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('smoothing', () => {
  it('rises faster than it falls', () => {
    const up = smoothBars([0], [1]);
    const down = smoothBars([1], [0]);
    expect(up[0]).toBeGreaterThan(0.5);
    expect(down[0]).toBeGreaterThan(0.5);
  });

  it('converges on the target', () => {
    let bars = [0];
    for (let i = 0; i < 40; i++) bars = smoothBars(bars, [0.8]);
    expect(bars[0]).toBeCloseTo(0.8, 3);
  });

  it('treats missing history as silence and stays in range', () => {
    expect(smoothBars([], [1, 1])).toEqual(smoothBars([0, 0], [1, 1]));
    expect(smoothBars([0.5], [4])[0]).toBeLessThanOrEqual(1);
    expect(smoothBars([0.5], [-4])[0]).toBeGreaterThanOrEqual(0);
  });

  it('takes the whole step when attack is one', () => {
    expect(smoothBars([0], [0.6], { attack: 1 })).toEqual([0.6]);
  });
});

describe('settling', () => {
  it('decays towards zero and reports silence', () => {
    let bars = [1, 0.5];
    expect(isSilent(bars)).toBe(false);
    for (let i = 0; i < 100; i++) bars = decayBars(bars);
    expect(bars).toEqual([0, 0]);
    expect(isSilent(bars)).toBe(true);
    expect(isSilent([])).toBe(true);
  });
});

describe('drawing sizes', () => {
  it('maps a level to pixels with a visible minimum', () => {
    expect(barHeight(1, 100)).toBe(100);
    expect(barHeight(0.25, 100)).toBe(25);
    expect(barHeight(0, 100)).toBe(2);
    expect(barHeight(0, 1)).toBe(1);
    expect(barHeight(0.5, 0)).toBe(0);
    expect(barHeight(4, 100)).toBe(100);
  });

  it('picks a bar count for the width', () => {
    expect(barCountFor(0)).toBe(8);
    expect(barCountFor(160)).toBe(20);
    expect(barCountFor(10_000)).toBe(72);
    expect(barCountFor(Number.NaN)).toBe(8);
  });
});
