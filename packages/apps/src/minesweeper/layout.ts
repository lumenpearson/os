/**
 * How big a cell may be. The field scales to whatever the window gives it,
 * down to a floor below which the digits stop being readable — under that,
 * the field scrolls instead of shrinking further.
 */

import type { BoardConfig } from './difficulty';

/** Below this a mono digit at 56% of the cell is no longer legible. */
export const MIN_CELL = 16;
/** Above this a beginner board turns into a wall of buttons. */
export const MAX_CELL = 34;
/** Used for the first frame, before the field has been measured. */
export const DEFAULT_CELL = 24;

export interface Area {
  width: number;
  height: number;
}

/**
 * The largest whole-pixel cell that fits `config` in `area`, allowing one
 * pixel between cells for the hairline. Whole pixels keep those hairlines
 * from smearing across two rows of physical pixels.
 */
export function fitCell(area: Area, config: BoardConfig): number {
  if (!(area.width > 0) || !(area.height > 0)) return DEFAULT_CELL;
  const across = Math.floor((area.width - (config.width - 1)) / config.width);
  const down = Math.floor((area.height - (config.height - 1)) / config.height);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.min(across, down)));
}

/** The pixel size of the whole field at a given cell size, hairlines included. */
export function fieldSize(config: BoardConfig, cell: number): Area {
  return {
    width: config.width * cell + (config.width - 1),
    height: config.height * cell + (config.height - 1),
  };
}
