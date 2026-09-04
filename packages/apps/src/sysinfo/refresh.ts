/**
 * Refresh-rate measurement. No browser API reports the display's refresh
 * rate, so the only number this app is allowed to print is one it measured:
 * animation-frame timestamps, the median interval between them, and the
 * frame count that produced it. Every result carries how it was obtained.
 */

export interface RefreshEstimate {
  /** Frames per second from the median frame interval; null when unmeasured. */
  hz: number | null;
  /** Timestamps collected. */
  frames: number;
  /** Milliseconds between the first and the last timestamp. */
  spanMs: number;
  /** Why no rate could be measured. Set when `hz` is null. */
  reason?: string;
}

/** Below this many frames the median is noise rather than a measurement. */
export const MIN_FRAMES = 10;
/** Stop after this many frames however long the sample runs. */
export const MAX_FRAMES = 400;
/**
 * Gaps longer than this are a throttled or backgrounded tab, not a frame
 * interval, so they are dropped before the median is taken.
 */
export const MAX_INTERVAL_MS = 100;
/**
 * No display refreshes faster than a thousand times a second, so a shorter
 * gap is a frame clock that does not tick in real time (a headless runtime, a
 * synchronous shim) rather than a very fast monitor. Dropping these is what
 * keeps the row from printing a six-figure rate as if it were a measurement.
 */
export const MIN_INTERVAL_MS = 1;

export const NOT_ENOUGH_FRAMES =
  'Too few animation frames arrived to measure a rate. The window may be hidden or throttled.';
export const NO_PLAUSIBLE_INTERVAL =
  'The gaps between animation frames were not ones a display could produce, so no rate was measured.';

/** Positive, plausible gaps between consecutive timestamps. */
export function frameIntervals(timestamps: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const previous = timestamps[i - 1];
    const current = timestamps[i];
    if (previous === undefined || current === undefined) continue;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = current - previous;
    if (delta >= MIN_INTERVAL_MS && delta <= MAX_INTERVAL_MS) out.push(delta);
  }
  return out;
}

/** Median of a list. NaN for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle] ?? Number.NaN;
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (low === undefined || high === undefined) return Number.NaN;
  return (low + high) / 2;
}

function span(timestamps: readonly number[]): number {
  const finite = timestamps.filter((t) => Number.isFinite(t));
  const first = finite[0];
  const last = finite[finite.length - 1];
  if (first === undefined || last === undefined) return 0;
  return Math.max(0, last - first);
}

/** Turn a run of frame timestamps into a rate, or into a reason there is none. */
export function estimateRefreshRate(timestamps: readonly number[]): RefreshEstimate {
  const frames = timestamps.length;
  const spanMs = Math.round(span(timestamps));
  const intervals = frameIntervals(timestamps);
  if (intervals.length < MIN_FRAMES - 1) {
    // Enough frames arrived, but none of the gaps between them was one a
    // display could have produced — a different fault, and a different line.
    return {
      hz: null,
      frames,
      spanMs,
      reason: frames >= MIN_FRAMES ? NO_PLAUSIBLE_INTERVAL : NOT_ENOUGH_FRAMES,
    };
  }
  const middle = median(intervals);
  if (!Number.isFinite(middle) || middle <= 0) {
    return { hz: null, frames, spanMs, reason: NOT_ENOUGH_FRAMES };
  }
  return { hz: Math.round((1000 / middle) * 10) / 10, frames, spanMs };
}

export interface FrameSampler {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

/** `requestAnimationFrame` as a sampler; tests pass a driven stub instead. */
export function windowSampler(): FrameSampler {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
  };
}

export interface FrameSample {
  timestamps: Promise<number[]>;
  /** Stop early and resolve with whatever was collected. */
  cancel: () => void;
}

/** Collect animation-frame timestamps for `durationMs`. */
export function sampleFrames(durationMs: number, sampler: FrameSampler): FrameSample {
  const timestamps: number[] = [];
  let handle = 0;
  let done = false;
  let finish: (value: number[]) => void = () => {};
  const promise = new Promise<number[]>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    if (done) return;
    done = true;
    sampler.cancel(handle);
    finish(timestamps);
  };
  const start = sampler.now();
  const step = (timestamp: number) => {
    if (done) return;
    timestamps.push(timestamp);
    if (timestamp - start >= durationMs || timestamps.length >= MAX_FRAMES) stop();
    else handle = sampler.request(step);
  };
  handle = sampler.request(step);
  return { timestamps: promise, cancel: stop };
}
