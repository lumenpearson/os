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
