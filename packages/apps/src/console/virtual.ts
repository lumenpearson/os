/**
 * Row geometry for the virtualised list. Every height is known before
 * anything is drawn — a collapsed row is one line, an expanded one is its
 * payload's line count — so the list can place the rows it renders by
 * absolute offset and leave the rest out of the DOM.
 */

/** A collapsed row, in pixels. Matches the OS list row rhythm. */
export const ROW_HEIGHT = 24;
/** One line of an expanded payload. */
export const DETAIL_LINE_HEIGHT = 16;
/** Space above and below an expanded payload. */
export const DETAIL_PADDING = 6;

/** The height an expanded payload adds; no lines means nothing to add. */
export function detailHeight(lineCount: number): number {
  if (lineCount <= 0) return 0;
  return lineCount * DETAIL_LINE_HEIGHT + DETAIL_PADDING * 2;
}

/** The full height of a row, expanded or not. */
export function rowHeight(detailLines = 0): number {
  return ROW_HEIGHT + detailHeight(detailLines);
}

/**
 * Running tops: `offsets[i]` is where row `i` starts and the last entry is
 * the total height, so the array is one longer than the list.
 */
export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  let top = 0;
  for (let i = 0; i < heights.length; i++) {
    top += Math.max(0, heights[i] ?? 0);
    offsets[i + 1] = top;
  }
  return offsets;
}

/** The height of every row together. */
export function totalHeight(offsets: readonly number[]): number {
  return offsets.length === 0 ? 0 : (offsets[offsets.length - 1] ?? 0);
}

/** The row a vertical position lands in, clamped to the list. */
export function rowAt(offsets: readonly number[], y: number): number {
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  if (y <= 0) return 0;
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((offsets[mid] ?? 0) <= y) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface RowWindow {
  /** First row to render. */
  start: number;
  /** One past the last row to render. */
  end: number;
}

/**
 * The rows a viewport covers, plus a margin either side so a fast scroll
 * does not show a gap before the next frame.
 */
export function windowFor(
  offsets: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 8,
): RowWindow {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const top = Math.max(0, scrollTop);
  const first = rowAt(offsets, top);
  const last = rowAt(offsets, top + Math.max(0, viewportHeight));
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + 1 + overscan),
  };
}
