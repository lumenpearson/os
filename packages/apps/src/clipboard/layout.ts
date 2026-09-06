/**
 * What fits in the window, measured from the window itself rather than the
 * viewport: two of these open side by side on a large display fold exactly as
 * one narrow window does.
 *
 * The list and the detail are both necessary — a row shows one line and the
 * detail shows the rest — so the detail is never given up. Below the split
 * width it moves under the list instead of beside it.
 */

/** At or above this width the detail pane stands beside the list. */
export const SPLIT_WIDTH = 600;

const LIST_MIN = 240;
const LIST_MAX = 340;
const DETAIL_MIN = 104;
const DETAIL_MAX = 240;

export interface Viewport {
  width: number;
  height: number;
}

export interface ClipboardLayout {
  /** List and detail side by side. */
  split: boolean;
  /** Width of the list column while split. */
  listWidth: number;
  /** Height of the detail pane while stacked. */
  detailHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function layoutFor(size: Viewport): ClipboardLayout {
  // Before the first measurement the size reads zero, and an unmeasured
  // window is not a small one: assume the width the shell opened it at.
  const width = size.width > 0 ? size.width : SPLIT_WIDTH;
  const height = size.height > 0 ? size.height : DETAIL_MAX;
  return {
    split: width >= SPLIT_WIDTH,
    listWidth: clamp(Math.round(width * 0.38), LIST_MIN, LIST_MAX),
    detailHeight: clamp(Math.round(height * 0.38), DETAIL_MIN, DETAIL_MAX),
  };
}
