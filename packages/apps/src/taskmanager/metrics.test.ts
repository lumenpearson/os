import { afterEach, describe, expect, it } from 'vitest';
import {
  frameRate,
  heapSupported,
  type MetricEnv,
  type MetricId,
  MIN_FRAME_SPAN_MS,
  metricSupport,
  readHeap,
} from './metrics';

const browser: MetricEnv = { host: 'web', realMetrics: false, heap: false, storage: true };
const desktop: MetricEnv = { host: 'tauri', realMetrics: true, heap: false, storage: true };

function note(id: MetricId, env: MetricEnv): string {
  const support = metricSupport(id, env);
  return support.available ? '' : support.note;
}

describe('metricSupport', () => {
  it('always has the two sources that live in this document', () => {
    for (const env of [browser, desktop]) {
      expect(metricSupport('frameRate', env)).toEqual({ available: true });
      expect(metricSupport('processes', env)).toEqual({ available: true });
    }
  });

  it('follows the engine for the JS heap', () => {
    expect(metricSupport('heap', { ...browser, heap: true })).toEqual({ available: true });
    expect(metricSupport('heap', browser).available).toBe(false);
    expect(note('heap', browser)).toContain('performance.memory');
  });

  it('follows the storage adapter for usage', () => {
    expect(metricSupport('storage', browser)).toEqual({ available: true });
    expect(metricSupport('storage', { ...browser, storage: false }).available).toBe(false);
    expect(note('storage', { ...browser, storage: false })).toContain('usage');
  });

  it('gives host CPU and memory only to a host that reports them', () => {
    expect(metricSupport('hostCpu', desktop)).toEqual({ available: true });
    expect(metricSupport('hostMemory', desktop)).toEqual({ available: true });
    expect(metricSupport('hostCpu', browser).available).toBe(false);
    expect(metricSupport('hostMemory', browser).available).toBe(false);
    expect(note('hostCpu', browser)).toContain('browser');
    expect(note('hostMemory', browser)).toContain('browser');
  });

  it('never claims memory per app, and says why on each host', () => {
    expect(metricSupport('appMemory', browser).available).toBe(false);
    expect(metricSupport('appMemory', desktop).available).toBe(false);
    expect(note('appMemory', desktop)).toContain('one host process');
    expect(note('appMemory', browser)).toContain('browser');
  });

  it('explains every metric it withholds', () => {
    const ids: MetricId[] = [
      'frameRate',
      'heap',
      'storage',
      'processes',
      'hostCpu',
      'hostMemory',
      'appMemory',
    ];
    for (const env of [browser, desktop]) {
      for (const id of ids) {
        const support = metricSupport(id, env);
        if (!support.available) expect(support.note.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('frameRate', () => {
  it('divides frames by the span in seconds', () => {
    expect(frameRate(60, 1000)).toBe(60);
    expect(frameRate(30, 500)).toBe(60);
    expect(frameRate(6, 100)).toBe(60);
  });

  it('reports a genuinely stalled window as zero', () => {
    expect(frameRate(0, 1000)).toBe(0);
  });

  it('refuses a span too short to hold a frame', () => {
    expect(frameRate(0, MIN_FRAME_SPAN_MS - 1)).toBeNull();
    expect(frameRate(1, 0.01)).toBeNull();
    expect(frameRate(0, 0)).toBeNull();
    expect(frameRate(1, -50)).toBeNull();
  });

  it('refuses input that is not a number', () => {
    expect(frameRate(Number.NaN, 1000)).toBeNull();
    expect(frameRate(10, Number.NaN)).toBeNull();
    expect(frameRate(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(frameRate(-1, 1000)).toBeNull();
  });
});

interface HeapCarrier {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

function stubHeap(value: HeapCarrier['memory']) {
  Object.defineProperty(performance, 'memory', { value, configurable: true });
}

afterEach(() => {
  delete (performance as unknown as HeapCarrier).memory;
});

describe('readHeap', () => {
  it('reports nothing where the engine hides performance.memory', () => {
    expect(heapSupported()).toBe(false);
    expect(readHeap()).toBeNull();
  });

  it('reads the three figures the engine exposes', () => {
    stubHeap({ usedJSHeapSize: 12, totalJSHeapSize: 34, jsHeapSizeLimit: 56 });
    expect(heapSupported()).toBe(true);
    expect(readHeap()).toEqual({ used: 12, total: 34, limit: 56 });
  });

  it('rejects a memory object without the figure it needs', () => {
    stubHeap({} as HeapCarrier['memory']);
    expect(heapSupported()).toBe(false);
    expect(readHeap()).toBeNull();
  });
});
