import { describe, expect, it } from 'vitest';
import { formatHeap, heapBytes, sampleFrames } from './frames';

describe('sampleFrames', () => {
  it('counts the gaps between frames, not the frames', () => {
    // Eleven timestamps 16 ms apart is ten gaps over 160 ms: 62.5 fps.
    const times = Array.from({ length: 11 }, (_, i) => i * 16);
    expect(sampleFrames(times, null)?.fps).toBe(63);
  });

  it('reports the longest single frame, which is what a stutter looks like', () => {
    expect(sampleFrames([0, 16, 32, 132, 148], null)?.worst).toBe(100);
  });

  it('says nothing when it has not seen two frames or any time pass', () => {
    expect(sampleFrames([], null)).toBeNull();
    expect(sampleFrames([12], null)).toBeNull();
    expect(sampleFrames([12, 12], null)).toBeNull();
  });

  it('carries the heap reading through untouched, including its absence', () => {
    expect(sampleFrames([0, 16], 1024)?.heap).toBe(1024);
    expect(sampleFrames([0, 16], null)?.heap).toBeNull();
  });
});

describe('heapBytes', () => {
  it('reads the figure where the host reports one', () => {
    expect(heapBytes({ memory: { usedJSHeapSize: 4096 } } as unknown as Performance)).toBe(4096);
  });

  it('is null where there is no reading, rather than zero', () => {
    expect(heapBytes({} as Performance)).toBeNull();
    expect(heapBytes(undefined)).toBeNull();
    expect(heapBytes({ memory: {} } as unknown as Performance)).toBeNull();
    // A zero or a non-number is not a measurement.
    expect(heapBytes({ memory: { usedJSHeapSize: 0 } } as unknown as Performance)).toBeNull();
    expect(heapBytes({ memory: { usedJSHeapSize: '9' } } as unknown as Performance)).toBeNull();
  });
});

describe('formatHeap', () => {
  it('shows a dash where there is nothing to show', () => {
    expect(formatHeap(null)).toBe('—');
  });

  it('reads in megabytes, and in gigabytes once that stops being short', () => {
    expect(formatHeap(42 * 1024 * 1024)).toBe('42 MB');
    expect(formatHeap(1433 * 1024 * 1024)).toBe('1.4 GB');
  });
});
