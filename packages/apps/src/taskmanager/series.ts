/**
 * A fixed-capacity ring buffer of samples and the SVG geometry for drawing
 * one. Both are pure: the charts hand in a width and a height in viewBox
 * units and get back path data.
 */

export interface SeriesStats {
  count: number;
  last: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export const EMPTY_STATS: SeriesStats = {
  count: 0,
  last: null,
  min: null,
  max: null,
  avg: null,
};

/** Oldest sample first when read back; pushing past the capacity drops the oldest. */
export class Series {
  readonly capacity: number;
  private readonly buffer: number[];
  private start = 0;
  private length = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`series capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.buffer = new Array<number>(capacity).fill(0);
  }

  get size(): number {
    return this.length;
  }

  /** A sample that is not a finite number is not a measurement, so it is dropped. */
  push(value: number): void {
    if (!Number.isFinite(value)) return;
    this.buffer[(this.start + this.length) % this.capacity] = value;
    if (this.length < this.capacity) this.length += 1;
    else this.start = (this.start + 1) % this.capacity;
  }

  clear(): void {
    this.start = 0;
    this.length = 0;
  }

  at(index: number): number | undefined {
    if (index < 0 || index >= this.length) return undefined;
    return this.buffer[(this.start + index) % this.capacity];
  }

  values(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.length; i++) {
      const v = this.buffer[(this.start + i) % this.capacity];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  stats(): SeriesStats {
    if (this.length === 0) return EMPTY_STATS;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let last = 0;
    for (let i = 0; i < this.length; i++) {
      const v = this.buffer[(this.start + i) % this.capacity] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      last = v;
    }
    return { count: this.length, last, min, max, avg: sum / this.length };
  }
}

export interface PlotOptions {
  /** viewBox units. */
  width: number;
  height: number;
  /** Bottom of the scale; defaults to 0. */
  min?: number;
  /** Top of the scale; defaults to the highest sample. */
  max?: number;
  /**
   * X slots. The newest sample sits on the right edge and older ones step
   * left, so a filling buffer slides in instead of stretching.
   */
  slots?: number;
}

export interface PlotPoint {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function plotRange(
  values: readonly number[],
  options: Pick<PlotOptions, 'min' | 'max'>,
): { min: number; max: number } {
  const min = options.min ?? 0;
  let max = options.max ?? (values.length > 0 ? Math.max(...values) : min + 1);
  if (!(max > min)) max = min + 1;
  return { min, max };
}

export function plotPoints(values: readonly number[], options: PlotOptions): PlotPoint[] {
  const { width, height } = options;
  const slots = Math.max(1, Math.floor(options.slots ?? values.length));
  const step = slots > 1 ? width / (slots - 1) : 0;
  const { min, max } = plotRange(values, options);
  const n = values.length;
  return values.map((value, i) => {
    const x = Math.max(0, width - (n - 1 - i) * step);
    const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
    return { x: round(x), y: round(height - ratio * height) };
  });
}

/** Polyline through every sample. Empty when there is nothing measured yet. */
export function linePath(values: readonly number[], options: PlotOptions): string {
  const points = plotPoints(values, options);
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/** The same line closed down to the baseline, for the filled area. */
export function areaPath(values: readonly number[], options: PlotOptions): string {
  const points = plotPoints(values, options);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  const body = points.map((p) => `L${p.x},${p.y}`).join(' ');
  const base = round(options.height);
  return `M${first.x},${base} ${body} L${last.x},${base} Z`;
}

/**
 * A zero-length subpath at the newest sample. With a round line cap it draws
 * the dot that marks the current value.
 */
export function lastPointPath(values: readonly number[], options: PlotOptions): string {
  const points = plotPoints(values, options);
  const last = points[points.length - 1];
  if (!last) return '';
  return `M${last.x},${last.y} L${last.x},${last.y}`;
}
