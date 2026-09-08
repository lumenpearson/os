/**
 * What fits at a given size. Every number here is measured against the
 * window and the pane, never the viewport: a 400-pixel window on a 4K screen
 * has to fold exactly as it would on a small one.
 */

/** Below this window width the sidebar folds into a select in the toolbar. */
export const SIDEBAR_AT = 620;

/** Below this pane width the input and the output stack instead of sitting side by side. */
export const SPLIT_AT = 640;

/** Below this pane width the diff shows one column with a marker per line. */
export const DIFF_COLUMNS_AT = 560;

/** Below this pane width the toolbar drops the words from its buttons. */
export const LABELS_AT = 520;

export const SIDEBAR_WIDTH = 168;

export interface WorkbenchLayout {
  sidebar: boolean;
  labels: boolean;
}

export function layoutFor(windowWidth: number): WorkbenchLayout {
  return { sidebar: windowWidth >= SIDEBAR_AT, labels: windowWidth >= LABELS_AT };
}

export interface PaneLayout {
  /** Input and output side by side rather than stacked. */
  split: boolean;
  /** The diff has room for two columns. */
  columns: boolean;
}

export function paneLayoutFor(paneWidth: number): PaneLayout {
  return { split: paneWidth >= SPLIT_AT, columns: paneWidth >= DIFF_COLUMNS_AT };
}
