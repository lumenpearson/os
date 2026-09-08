/**
 * Frame timing and, where the host offers it, heap use.
 *
 * The numbers are measured, never estimated: frames are counted between two
 * readings of the clock the browser hands the animation callback, and the
 * heap figure is only ever the one `performance.memory` reports. Chromium is
 * the only engine that reports it, so everywhere else this says it does not
 * know rather than showing a number it made up.
 */

/** How long a sample runs before the reading is replaced, in ms. */
export const SAMPLE_MS = 500;

export interface Sample {
  /** Frames per second over the last window, rounded. */
  fps: number;
  /** The longest single frame in the window, in ms, to one decimal. */
  worst: number;
  /** Heap in use, in bytes, or null where the host does not say. */
  heap: number | null;
}

/** What a rolling window of frame timestamps says. */
export function sampleFrames(times: readonly number[], heap: number | null): Sample | null {
  if (times.length < 2) return null;
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined) return null;
  const span = last - first;
  if (span <= 0) return null;
  let worst = 0;
  for (let i = 1; i < times.length; i += 1) {
    const a = times[i - 1];
    const b = times[i];
    if (a === undefined || b === undefined) continue;
    const gap = b - a;
    if (gap > worst) worst = gap;
  }
  return {
    fps: Math.round(((times.length - 1) / span) * 1000),
    worst: Math.round(worst * 10) / 10,
    heap,
  };
}

interface MemoryReading {
  usedJSHeapSize?: unknown;
}

/**
 * The heap figure, where there is one. `performance.memory` is not in any
 * standard and exists only on Chromium, so it is read defensively and a
 * missing or nonsensical value becomes null rather than a zero that would
 * read as "no memory in use".
 */
export function heapBytes(perf: Performance | undefined = globalThis.performance): number | null {
  const memory = (perf as unknown as { memory?: MemoryReading } | undefined)?.memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) && used > 0 ? used : null;
}

/** Bytes as a short figure: 42 MB, 1.4 GB. */
export function formatHeap(bytes: number | null): string {
  if (bytes === null) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
