/**
 * Grid geometry: how many columns fit, which tiles are near enough to the
 * scroll port to be worth decoding, and where an arrow key moves the cursor.
 *
 * The window matters because every thumbnail is a blob URL of the whole
 * picture. A folder of two thousand photographs must never hold two thousand
 * blobs, so the tiles outside the range below draw a glyph and hold nothing;
 * the ones that scroll out of it revoke what they had. Keeping this as
 * arithmetic — rather than an observer per tile — is what makes it testable.
 */

export type ThumbSize = 'small' | 'medium' | 'large';

export const THUMB_SIZES: ReadonlyArray<{ id: ThumbSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/** Height of the picture box in a tile, in pixels. */
export const TILE_HEIGHT: Record<ThumbSize, number> = { small: 76, medium: 116, large: 168 };

/** Narrowest a column may be before a column is dropped. */
export const TILE_MIN_WIDTH: Record<ThumbSize, number> = { small: 84, medium: 124, large: 176 };

/** Space between tiles, and the caption line under each one. */
export const GRID_GAP = 8;
export const CAPTION_HEIGHT = 18;

/** Breathing room above the first row and below the last. */
export const GRID_PAD = 12;

/** One row of the grid, gap included, so row `n` starts at `rowTop(n)`. */
export function rowHeight(size: ThumbSize): number {
  return TILE_HEIGHT[size] + CAPTION_HEIGHT + GRID_GAP;
}

/** Offset of a row's top edge inside the scrolled content. */
export function rowTop(row: number, height: number): number {
  return GRID_PAD + Math.max(0, row) * height;
}

export function rowCount(total: number, columns: number): number {
  if (total <= 0 || columns <= 0) return 0;
  return Math.ceil(total / columns);
}

/** Columns that fit in `width` pixels of scroll port; never fewer than one. */
export function columnsFor(width: number, size: ThumbSize, gap = GRID_GAP): number {
  const min = TILE_MIN_WIDTH[size];
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

export interface Range {
  /** First tile index, inclusive. */
  start: number;
  /** Last tile index, exclusive. */
  end: number;
}

export const EMPTY_RANGE: Range = { start: 0, end: 0 };

export interface RangeInput {
  scrollTop: number;
  /** Height of the scroll port. Zero before it has been measured. */
  viewportHeight: number;
  rowHeight: number;
  columns: number;
  total: number;
  /** Rows kept live above and below, so a flick does not show empty tiles. */
  overscanRows?: number;
}

/**
 * The tiles that read their file. Every row the port touches is included,
 * plus `overscanRows` either side; everything else is dropped, and dropping a
 * tile from this range is what revokes its blob.
 */
export function visibleRange(input: RangeInput): Range {
  const { scrollTop, viewportHeight, rowHeight: height, columns, total } = input;
  const overscan = Math.max(0, input.overscanRows ?? 2);
  if (total <= 0 || columns <= 0 || height <= 0) return EMPTY_RANGE;
  const top = Math.max(0, scrollTop - GRID_PAD);
  const rows = rowCount(total, columns);
  const firstRow = Math.max(0, Math.floor(top / height) - overscan);
  const lastRow = Math.min(
    rows,
    Math.ceil((top + Math.max(0, viewportHeight)) / height) + overscan,
  );
  const start = Math.min(total, firstRow * columns);
  const end = Math.min(total, Math.max(start, lastRow * columns));
  return { start, end };
}

/**
 * Where the scroll port has to be for tile `index` to be wholly on screen,
 * moving as little as possible: a row already in view does not move at all.
 * The arrow keys need this rather than `scrollIntoView`, because the row they
 * are moving to may not be in the DOM yet.
 */
export function scrollTopFor(
  index: number,
  columns: number,
  height: number,
  scrollTop: number,
  viewportHeight: number,
): number {
  if (index < 0 || columns <= 0 || height <= 0) return scrollTop;
  const row = Math.floor(index / columns);
  if (row === 0) return 0;
  const top = rowTop(row, height);
  if (top < scrollTop) return top;
  const bottom = top + height;
  if (viewportHeight > 0 && bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
  return scrollTop;
}

/**
 * Where an arrow key takes the cursor, or null if the key means nothing here.
 * The grid does not wrap: Right on the last picture stays, and Down from a
 * short last row lands on the last picture rather than on nothing.
 */
export function moveCursor(
  index: number,
  key: string,
  columns: number,
  total: number,
  rowsPerPage = 1,
): number | null {
  if (total <= 0 || columns <= 0) return null;
  const from = index < 0 ? 0 : Math.min(index, total - 1);
  const clamp = (value: number) => Math.min(total - 1, Math.max(0, value));
  switch (key) {
    case 'ArrowLeft':
      return clamp(from - 1);
    case 'ArrowRight':
      return clamp(from + 1);
    case 'ArrowUp':
      return from - columns < 0 ? from : from - columns;
    case 'ArrowDown':
      return from + columns >= total ? clamp(total - 1) : from + columns;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    case 'PageUp':
      return clamp(from - columns * Math.max(1, rowsPerPage));
    case 'PageDown':
      return clamp(from + columns * Math.max(1, rowsPerPage));
    default:
      return null;
  }
}

/** Whole rows in a port of `height` pixels: how far Page Up and Page Down go. */
export function rowsPerPage(viewportHeight: number, height: number): number {
  if (height <= 0 || viewportHeight <= 0) return 1;
  return Math.max(1, Math.floor(viewportHeight / height));
}
