/**
 * Grid geometry: turning column widths and row heights into pixel offsets,
 * and pixel positions back into cells. Pure, so the virtualisation maths is
 * tested without a layout engine.
 */

/** Running offsets: `out[i]` is where track `i` starts, `out[count]` the total size. */
export function offsets(count: number, size: (index: number) => number): number[] {
  const out = new Array<number>(count + 1);
  out[0] = 0;
  for (let i = 0; i < count; i++) out[i + 1] = (out[i] ?? 0) + size(i);
  return out;
}

/** The track containing `position`, clamped to the grid. Binary search over the offsets. */
export function indexAt(list: number[], position: number, count: number): number {
  if (count <= 0) return 0;
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((list[mid] ?? 0) <= position) low = mid;
    else high = mid - 1;
  }
  return Math.max(0, Math.min(count - 1, low));
}

export interface VisibleWindow {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

/** The cells to render for a scroll position, plus `overscan` on each side. */
export function visibleWindow(
  colOffsets: number[],
  rowOffsets: number[],
  size: { cols: number; rows: number },
  scroll: { left: number; top: number },
  viewport: { width: number; height: number },
  overscan = 3,
): VisibleWindow {
  const firstCol = indexAt(colOffsets, scroll.left, size.cols);
  const firstRow = indexAt(rowOffsets, scroll.top, size.rows);
  const lastCol = indexAt(colOffsets, scroll.left + viewport.width, size.cols);
  const lastRow = indexAt(rowOffsets, scroll.top + viewport.height, size.rows);
  return {
    startCol: Math.max(0, firstCol - overscan),
    endCol: Math.min(size.cols - 1, lastCol + overscan),
    startRow: Math.max(0, firstRow - overscan),
    endRow: Math.min(size.rows - 1, lastRow + overscan),
  };
}

/** Scroll offsets that bring a cell fully into view, or null when it already is. */
export function scrollToShow(
  cell: { start: number; end: number },
  view: { offset: number; size: number },
): number | null {
  if (cell.start < view.offset) return cell.start;
  if (cell.end > view.offset + view.size) return cell.end - view.size;
  return null;
}
