/**
 * The geometry of the character grid, and where the cursor goes.
 *
 * The grid is virtualised: CJK Unified Ideographs is 20,992 characters and
 * Hangul Syllables 11,172, and building that many cells would cost several
 * seconds and hold them in the DOM for as long as the window is open. Cells
 * are all one size, so the row a scroll position lands on is arithmetic
 * rather than measurement, and only the rows the viewport covers are built.
 *
 * All of it is pure, so the awkward parts — the last, short row; a cursor at
 * either end; a viewport taller than the content — are tested rather than
 * discovered.
 */

/** Cell edge in pixels. Large enough for a CJK glyph at a readable size. */
export const CELL_SIZE = 40;

/** Rows kept either side of the viewport so a fast scroll shows no gap. */
const OVERSCAN = 4;

export interface RowWindow {
  /** First row to build. */
  start: number;
  /** One past the last row to build. */
  end: number;
}

/** How many cells fit across. Always at least one, however narrow the window. */
export function columnsFor(width: number, cell: number = CELL_SIZE): number {
  if (cell <= 0) return 1;
  return Math.max(1, Math.floor(Math.max(0, width) / cell));
}

export function rowsFor(count: number, columns: number): number {
  if (count <= 0 || columns <= 0) return 0;
  return Math.ceil(count / columns);
}

export function rowOf(index: number, columns: number): number {
  return columns <= 0 ? 0 : Math.floor(index / columns);
}

export function columnOf(index: number, columns: number): number {
  return columns <= 0 ? 0 : index % columns;
}

/** The rows a viewport covers, plus the overscan margin. */
export function visibleRows(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  cell: number = CELL_SIZE,
  overscan: number = OVERSCAN,
): RowWindow {
  if (rowCount <= 0 || cell <= 0) return { start: 0, end: 0 };
  const first = Math.min(rowCount - 1, Math.floor(Math.max(0, scrollTop) / cell));
  const covered = Math.ceil(Math.max(0, viewportHeight) / cell) + 1;
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(rowCount, first + covered + overscan),
  };
}

/**
 * Where the cursor lands for a navigation key, or null if the key is not one.
 * Left and right run through the whole grid rather than stopping at the edge
 * of a row: the characters are one sequence, and the row width is an accident
 * of how wide the window happens to be.
 */
export function moveCursor(
  cursor: number,
  count: number,
  columns: number,
  key: string,
  rowsPerPage = 1,
): number | null {
  if (count <= 0) return null;
  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index));
  const page = Math.max(1, rowsPerPage) * Math.max(1, columns);
  switch (key) {
    case 'ArrowLeft':
      return clamp(cursor - 1);
    case 'ArrowRight':
      return clamp(cursor + 1);
    case 'ArrowUp':
      return cursor - columns < 0 ? cursor : cursor - columns;
    case 'ArrowDown':
      return cursor + columns >= count ? cursor : cursor + columns;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageUp':
      return clamp(cursor - page);
    case 'PageDown':
      return clamp(cursor + page);
    default:
      return null;
  }
}

/**
 * The scroll position that brings a row into view, moving as little as
 * possible. Returns the current position when the row is already visible, so
 * the caller can skip writing to the element. A viewport too short for one
 * whole cell shows the top of it rather than the bottom.
 */
export function scrollTopFor(
  row: number,
  scrollTop: number,
  viewportHeight: number,
  cell: number = CELL_SIZE,
): number {
  const top = row * cell;
  const bottom = top + cell;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewportHeight)
    return Math.min(top, Math.max(0, bottom - viewportHeight));
  return scrollTop;
}
