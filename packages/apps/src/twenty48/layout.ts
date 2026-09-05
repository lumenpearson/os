/**
 * How the board is sized and where each tile sits.
 *
 * The board is square and takes the smaller of the two measurements of the
 * space the window gives it, so the same code holds from the 320-pixel minimum
 * up to a 4K window. Everything is whole pixels: a half-pixel gap smears the
 * hairlines across two rows of physical pixels.
 */

import { columnOf, rowOf, SIZE } from './board';

export interface Area {
  width: number;
  height: number;
}

/** Below this the four-digit tiles stop being readable. */
export const MIN_BOARD = 200;
/** Above this the board stops being a board and becomes a wall. */
export const MAX_BOARD = 620;
/** Used for the first frame, before the space has been measured. */
export const DEFAULT_BOARD = 320;

export interface Layout {
  /** The outer square, hairline included. */
  size: number;
  /** The space around and between the cells. */
  gap: number;
  cell: number;
  radius: number;
  /** Nested radius: the outer one less the padding, never below 2. */
  tileRadius: number;
}

export function fitBoard(area: Area): Layout {
  const available = Math.min(area.width, area.height);
  const size = Number.isFinite(available)
    ? Math.max(MIN_BOARD, Math.min(MAX_BOARD, Math.floor(available)))
    : DEFAULT_BOARD;
  const gap = Math.max(4, Math.round(size * 0.022));
  const cell = Math.floor((size - gap * (SIZE + 1)) / SIZE);
  const radius = 8;
  return {
    size: cell * SIZE + gap * (SIZE + 1),
    gap,
    cell,
    radius,
    tileRadius: Math.max(2, radius - gap),
  };
}

/** The offset of a cell from the board's top-left corner. */
export function offsetOf(index: number, layout: Layout): { x: number; y: number } {
  const step = layout.cell + layout.gap;
  return {
    x: layout.gap + columnOf(index) * step,
    y: layout.gap + rowOf(index) * step,
  };
}

/**
 * Type size for a value: four digits have to fit the same square two do, so
 * the longer the number the smaller it is set.
 */
export function tileFontSize(cell: number, value: number): number {
  const digits = String(Math.max(0, value)).length;
  const share = digits <= 2 ? 0.42 : digits === 3 ? 0.34 : digits === 4 ? 0.27 : 0.22;
  return Math.max(9, Math.round(cell * share));
}

/**
 * Which band of the neutral ramp a value sits in. Value is carried by weight
 * and by a step along one grey ramp; the accent is kept for 2048 and above,
 * where it means something.
 */
export function tileBand(value: number): number {
  if (value >= 2048) return 4;
  if (value >= 512) return 3;
  if (value >= 64) return 2;
  if (value >= 8) return 1;
  return 0;
}
