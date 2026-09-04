import { describe, expect, it } from 'vitest';
import {
  estimateRefreshRate,
  type FrameSampler,
  frameIntervals,
  MAX_FRAMES,
  MIN_FRAMES,
  median,
  sampleFrames,
} from './refresh';

function run(count: number, intervalMs: number, from = 1000): number[] {
  return Array.from({ length: count }, (_, i) => from + i * intervalMs);
}

/** A sampler the test drives frame by frame. */
function stubSampler(): FrameSampler & {
  tick: (timestamp: number) => void;
  pending: () => number;
} {
  const queue: Array<(t: number) => void> = [];
  let clock = 0;
  return {
    request(callback) {
      queue.push(callback);
      return queue.length;
    },
    cancel() {
      queue.length = 0;
    },
    now() {
      return clock;
    },
    pending: () => queue.length,
    tick(timestamp) {
      clock = timestamp;
      const next = queue.shift();
      next?.(timestamp);
    },
  };
}

describe('frameIntervals', () => {
  it('returns the gaps between consecutive timestamps', () => {
    expect(frameIntervals([0, 16, 32, 48])).toEqual([16, 16, 16]);
  });

  it('drops gaps that are a throttled tab rather than a frame', () => {
    expect(frameIntervals([0, 16, 2000, 2016])).toEqual([16, 16]);
  });

  it('drops zero and negative gaps and non-finite timestamps', () => {
    expect(frameIntervals([0, 0, 16, 8, Number.NaN, 24])).toEqual([16]);
  });

  it('is empty for fewer than two timestamps', () => {
    expect(frameIntervals([])).toEqual([]);
    expect(frameIntervals([5])).toEqual([]);
  });
});

describe('median', () => {
  it('takes the middle of an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middles of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is NaN for an empty list', () => {
    expect(median([])).toBeNaN();
  });
});

describe('estimateRefreshRate', () => {
  it('reports 60 Hz for 16.67 ms frames', () => {
    const estimate = estimateRefreshRate(run(30, 1000 / 60));
    expect(estimate.hz).toBe(60);
    expect(estimate.frames).toBe(30);
    expect(estimate.spanMs).toBe(483);
    expect(estimate.reason).toBeUndefined();
  });

  it('reports 120 Hz for 8.33 ms frames', () => {
    expect(estimateRefreshRate(run(60, 1000 / 120)).hz).toBe(120);
  });

  it('ignores a stall in the middle of the run', () => {
    const stalled = [...run(20, 16), 3000, 3016, 3032];
    expect(estimateRefreshRate(stalled).hz).toBe(62.5);
  });

  it('refuses to guess from too few frames', () => {
    const estimate = estimateRefreshRate(run(MIN_FRAMES - 2, 16));
    expect(estimate.hz).toBeNull();
    expect(estimate.reason).toMatch(/Too few animation frames/);
    expect(estimate.frames).toBe(MIN_FRAMES - 2);
  });

  it('refuses to guess when every gap was a stall', () => {
    const estimate = estimateRefreshRate([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]);
    expect(estimate.hz).toBeNull();
    expect(estimate.spanMs).toBe(4500);
  });

  it('has no rate and no span for an empty run', () => {
    expect(estimateRefreshRate([])).toEqual({
      hz: null,
      frames: 0,
      spanMs: 0,
      reason: expect.any(String),
    });
  });
});

describe('sampleFrames', () => {
  it('collects frames until the duration is reached', async () => {
    const sampler = stubSampler();
    const sample = sampleFrames(50, sampler);
    for (let i = 1; i <= 5; i++) sampler.tick(i * 16);
    await expect(sample.timestamps).resolves.toEqual([16, 32, 48, 64]);
    expect(sampler.pending()).toBe(0);
  });

  it('resolves with what it has when cancelled', async () => {
    const sampler = stubSampler();
    const sample = sampleFrames(10_000, sampler);
    sampler.tick(16);
    sampler.tick(32);
    sample.cancel();
    await expect(sample.timestamps).resolves.toEqual([16, 32]);
  });

  it('stops at the frame cap even when the clock never advances', async () => {
    const sampler = stubSampler();
    const sample = sampleFrames(10_000, sampler);
    for (let i = 0; i < MAX_FRAMES + 5; i++) sampler.tick(0);
    await expect(sample.timestamps).resolves.toHaveLength(MAX_FRAMES);
  });
});
