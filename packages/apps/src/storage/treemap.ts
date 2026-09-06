/**
 * Squarified treemap layout (Bruls, Huizing and van Wijk, 2000) and the
 * geometric neighbour search the keyboard uses to move between tiles.
 *
 * Two properties this file is written to keep, and that the tests check:
 * a tile's area is proportional to its weight, and the tiles cover the
 * container exactly — no gaps, no overlap. A treemap that fails either one is
 * a picture of nothing.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Weighted {
  index: number;
  weight: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Lay `weights` out inside `rect`. The result is parallel to the input, so a
 * caller can zip it with its own nodes; a zero, negative or non-finite weight
 * gets an empty rect and takes no space from the others.
 */
export function squarify(weights: readonly number[], rect: Rect): Rect[] {
  const out: Rect[] = weights.map(() => ({ ...EMPTY, x: rect.x, y: rect.y }));
  const items: Weighted[] = [];
  let total = 0;
  for (const [index, weight] of weights.entries()) {
    if (!Number.isFinite(weight) || weight <= 0) continue;
    items.push({ index, weight });
    total += weight;
  }
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return out;
  items.sort((a, b) => b.weight - a.weight || a.index - b.index);

  const scale = (rect.width * rect.height) / total;
  let free: Rect = { ...rect };
  let row: Weighted[] = [];
  let cursor = 0;
  while (cursor < items.length) {
    const item = items[cursor];
    if (item === undefined) break;
    const side = Math.min(free.width, free.height);
    if (row.length === 0 || worst([...row, item], side, scale) <= worst(row, side, scale)) {
      row.push(item);
      cursor++;
      continue;
    }
    free = placeRow(row, free, scale, out, false);
    row = [];
  }
  if (row.length > 0) placeRow(row, free, scale, out, true);
  return out;
}

/**
 * The worst (largest) aspect ratio in a row laid along a side of length
 * `side`. Lower is squarer, which is the whole point of the algorithm.
 */
function worst(row: readonly Weighted[], side: number, scale: number): number {
  if (row.length === 0 || side <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const item of row) {
    const area = item.weight * scale;
    sum += area;
    if (area < min) min = area;
    if (area > max) max = area;
  }
  if (sum <= 0) return Number.POSITIVE_INFINITY;
  const side2 = side * side;
  return Math.max((side2 * max) / (sum * sum), (sum * sum) / (side2 * min));
}

/**
 * Write one row into the free rectangle and return what is left of it. The
 * last item of a row, and every item of the last row, takes the remainder
 * exactly, so rounding cannot open a seam between tiles.
 */
function placeRow(
  row: readonly Weighted[],
  free: Rect,
  scale: number,
  out: Rect[],
  last: boolean,
): Rect {
  const area = row.reduce((sum, item) => sum + item.weight * scale, 0);
  const vertical = free.width >= free.height;
  if (vertical) {
    const width = last ? free.width : clamp(area / free.height, 0, free.width);
    let y = free.y;
    row.forEach((item, i) => {
      const height =
        i === row.length - 1
          ? free.y + free.height - y
          : width > 0
            ? (item.weight * scale) / width
            : 0;
      out[item.index] = { x: free.x, y, width, height: Math.max(0, height) };
      y += height;
    });
    return { x: free.x + width, y: free.y, width: free.width - width, height: free.height };
  }
  const height = last ? free.height : clamp(area / free.width, 0, free.height);
  let x = free.x;
  row.forEach((item, i) => {
    const width =
      i === row.length - 1
        ? free.x + free.width - x
        : height > 0
          ? (item.weight * scale) / height
          : 0;
    out[item.index] = { x, y: free.y, width: Math.max(0, width), height };
    x += width;
  });
  return { x: free.x, y: free.y + height, width: free.width, height: free.height - height };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * The tile a keyboard arrow should move to: the nearest tile whose centre
 * lies in that direction, preferring one that overlaps the current tile
 * across the arrow's axis. Returns `from` when nothing lies that way, so the
 * edge of the map is a wall rather than a wrap.
 */
export function neighbour(rects: readonly Rect[], from: number, direction: Direction): number {
  const current = rects[from];
  if (!current || current.width <= 0 || current.height <= 0) return from;
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;
  const centre = centreOf(current);
  let best = from;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [index, rect] of rects.entries()) {
    if (index === from || rect.width <= 0 || rect.height <= 0) continue;
    const other = centreOf(rect);
    const along = horizontal ? (other.x - centre.x) * sign : (other.y - centre.y) * sign;
    if (along <= 0) continue;
    const across = horizontal ? Math.abs(other.y - centre.y) : Math.abs(other.x - centre.x);
    const overlaps = horizontal
      ? overlap(current.y, current.height, rect.y, rect.height) > 0
      : overlap(current.x, current.width, rect.x, rect.width) > 0;
    const score = along + across * (overlaps ? 0.25 : 4);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

function centreOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function overlap(a: number, aSize: number, b: number, bSize: number): number {
  return Math.min(a + aSize, b + bSize) - Math.max(a, b);
}
