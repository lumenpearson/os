/**
 * What fits. Every decision here reads the width of the *window*, measured
 * with `useElementSize`, never the viewport: two archive windows side by side
 * are two different widths, and a media query cannot tell them apart.
 *
 * Columns fall away from the right as the window narrows, in the order the
 * user needs them least; the details panel folds away before the table does,
 * because the table is the app.
 */

import type { SortColumn } from './tree';

/** Fixed track for each value column; the name column takes what is left. */
export const COLUMN_WIDTHS: Record<Exclude<SortColumn, 'name'>, number> = {
  size: 88,
  packed: 88,
  ratio: 64,
  modified: 148,
};

/** The name column never goes below this, so the table scrolls instead of crushing. */
export const MIN_NAME_WIDTH = 180;

const DETAILS_WIDTH = 224;

/**
 * Below this the toolbar cannot hold four buttons, a search field and the
 * archive's name at once — the window controls float over its left end and
 * take 68px of it — so the two parts the File menu also carries drop out.
 */
const TIGHT_TOOLBAR_WIDTH = 480;

/** Widths at which each column stops earning its place. */
const COLUMN_STEPS: Array<{ column: Exclude<SortColumn, 'name'>; from: number }> = [
  { column: 'size', from: 0 },
  { column: 'packed', from: 420 },
  { column: 'ratio', from: 520 },
  { column: 'modified', from: 580 },
];

export interface ArchiveLayout {
  columns: SortColumn[];
  /** The details panel is open and there is room for it. */
  showDetails: boolean;
  detailsWidth: number;
  /** Toolbar buttons drop their labels and keep their icons. */
  compactToolbar: boolean;
  /**
   * The toolbar is down to the archive's name, the two ways in and Extract
   * All. Extract Selected stays on the File menu, where it is anyway.
   */
  tightToolbar: boolean;
  /** The table scrolls sideways below this. */
  minTableWidth: number;
}

export function layoutFor(width: number, options: { showDetails: boolean }): ArchiveLayout {
  const usable = options.showDetails && width >= 760 ? width - DETAILS_WIDTH : width;
  const columns: SortColumn[] = ['name'];
  for (const step of COLUMN_STEPS) {
    if (usable >= step.from) columns.push(step.column);
  }
  const fixed = columns
    .filter((column): column is Exclude<SortColumn, 'name'> => column !== 'name')
    .reduce((sum, column) => sum + COLUMN_WIDTHS[column], 0);
  return {
    columns,
    showDetails: options.showDetails && width >= 760,
    detailsWidth: DETAILS_WIDTH,
    compactToolbar: width < 620,
    // A window that has not been measured yet reads as 0: assume the room is
    // there rather than hiding a button and putting it straight back.
    tightToolbar: width > 0 && width < TIGHT_TOOLBAR_WIDTH,
    minTableWidth: MIN_NAME_WIDTH + fixed,
  };
}

/** The CSS grid template the header and every row share. */
export function columnTemplate(columns: readonly SortColumn[]): string {
  return columns
    .map((column) =>
      column === 'name'
        ? `minmax(${MIN_NAME_WIDTH}px, 1fr)`
        : `${COLUMN_WIDTHS[column as Exclude<SortColumn, 'name'>]}px`,
    )
    .join(' ');
}
