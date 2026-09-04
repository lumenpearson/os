/**
 * Maths for the audio visualiser: how the analyser's frequency bins become
 * bar heights. Pure numbers so the drawing code stays a few lines of canvas
 * calls and the behaviour can be tested without an AudioContext.
 *
 * Bins are grouped logarithmically because hearing is: the first bars cover a
 * handful of low bins, the last cover hundreds of high ones.
 */
import { clamp } from './time';

/**
 * Bins `[start, end)` that feed one bar. Ranges are contiguous and cover every
 * bin; each bar keeps at least one bin, which straightens the lowest bars where
 * the logarithmic curve is flatter than one bin per bar.
 */
export function binRange(bar: number, bars: number, binCount: number): [number, number] {
  if (binCount <= 0) return [0, 0];
  if (bars <= 0) return [0, binCount];
  if (bars >= binCount) {
    const only = clamp(bar, 0, binCount - 1);
    return [only, only + 1];
  }
  const edge = (i: number) => {
    const curve = Math.floor((binCount + 1) ** (i / bars) - 1);
    // At least one bin per bar before this edge, and one left for each after it.
    return clamp(Math.max(curve, i), 0, binCount - (bars - i));
  };
  const start = edge(bar);
  const end = clamp(edge(bar + 1), start + 1, binCount);
  return [start, end];
}

/**
 * Average each bar's bins into a 0–1 level. `bins` are byte magnitudes from
 * `AnalyserNode.getByteFrequencyData`.
 */
export function groupBands(bins: ArrayLike<number>, bars: number, max = 255): number[] {
  const out: number[] = [];
  const count = bins.length;
  for (let bar = 0; bar < bars; bar++) {
    const [start, end] = binRange(bar, bars, count);
    let total = 0;
    for (let i = start; i < end; i++) total += bins[i] ?? 0;
    const width = end - start;
    out.push(width > 0 ? clamp(total / width / max, 0, 1) : 0);
  }
  return out;
}

export interface SmoothingOptions {
  /** Share of the rise taken in one frame; near 1 reacts instantly. */
  attack?: number;
  /** Share of the fall taken in one frame; small values hold the peak. */
  release?: number;
}

/** Ease each bar towards its new level: quick to rise, slow to fall. */
export function smoothBars(
  previous: readonly number[],
  next: readonly number[],
  options: SmoothingOptions = {},
): number[] {
  const attack = clamp(options.attack ?? 0.55, 0, 1);
  const release = clamp(options.release ?? 0.14, 0, 1);
  return next.map((target, i) => {
    const from = previous[i] ?? 0;
    const factor = target > from ? attack : release;
    return clamp(from + (target - from) * factor, 0, 1);
  });
}

/** Fall towards silence when the audio stops, so the bars settle instead of freezing. */
export function decayBars(previous: readonly number[], factor = 0.82): number[] {
  return previous.map((level) => {
    const next = clamp(level * clamp(factor, 0, 1), 0, 1);
    return next < 0.002 ? 0 : next;
  });
}

/** True once every bar has settled, so the animation loop can stop. */
export function isSilent(bars: readonly number[], threshold = 0.002): boolean {
  return bars.every((level) => level <= threshold);
}

/** Pixel height of one bar, keeping a hairline visible at silence. */
export function barHeight(level: number, height: number, minimum = 2): number {
  if (height <= 0) return 0;
  const drawn = clamp(level, 0, 1) * height;
  return clamp(Math.max(drawn, Math.min(minimum, height)), 0, height);
}

/** How many bars fit a width, within sensible bounds. */
export function barCountFor(width: number, slot = 8, min = 8, max = 72): number {
  if (!Number.isFinite(width) || width <= 0) return min;
  return Math.round(clamp(Math.floor(width / slot), min, max));
}
