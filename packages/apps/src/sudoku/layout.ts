/**
 * How big the board may be.
 *
 * The board is a square, so it is measured against the smaller side of
 * whatever the window gives it, in whole pixels — a fractional cell puts the
 * hairlines between cells on half a physical pixel, and nine of them smear
 * differently. Below the floor the board stops shrinking and its container
 * scrolls instead; above the ceiling a maximised window would print digits
 * the size of a fist.
 */

export interface Area {
  width: number;
  height: number;
}

/** Under this a pencil mark at a fifth of the cell stops being readable. */
export const MIN_CELL = 26;
export const MAX_CELL = 72;
/** Used for the first frame, before the board has been measured. */
export const DEFAULT_CELL = 44;

/**
 * Everything on a board's edge that is not a cell: the ten hairline gaps
 * between the nine cells and the two box rules, the two box rules themselves,
 * and the border round the outside.
 */
export const CHROME = 10 + 2 + 2;

export function boardSize(cell: number): number {
  return cell * 9 + CHROME;
}

/** The largest whole-pixel cell whose board fits in `area`. */
export function fitCell(area: Area): number {
  const side = Math.min(area.width, area.height);
  if (!(side > 0)) return DEFAULT_CELL;
  const cell = Math.floor((side - CHROME) / 9);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
}

/**
 * Whether the number pad has room to stand beside the board rather than
 * under it. Keyed off the window's own width, measured — a media query would
 * be asking about the screen, which is not what the app is inside.
 */
export const SIDE_BY_SIDE = 700;

export function padBeside(width: number): boolean {
  return width >= SIDE_BY_SIDE;
}
