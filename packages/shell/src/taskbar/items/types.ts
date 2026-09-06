/** What every piece of the bar is told about the bar it sits in. */

import type { DockPosition } from '@lumen/kernel';
import { cx } from '@lumen/ui';

export interface TaskbarItemProps {
  /** Icon edge in px, from Settings > Taskbar. */
  size: number;
  /** The bar runs down the side rather than along the bottom. */
  vertical: boolean;
  position: DockPosition;
  /** App names beside the icons (horizontal bars only). */
  showLabels: boolean;
}

/** Tooltips point away from the bar. */
export function tooltipSide(position: DockPosition): 'top' | 'bottom' {
  return position === 'bottom' ? 'top' : 'bottom';
}

/** The row (or column) one piece of the bar lays its own buttons out in. */
export function groupClass(vertical: boolean): string {
  return cx('flex items-center gap-1', vertical ? 'flex-col' : 'flex-row');
}

/**
 * The shared shape of a button on the bar: one radius, one focus ring, and
 * colour as the only thing hover changes.
 */
export const ITEM_BUTTON =
  'relative flex shrink-0 items-center justify-center rounded-md lumen-focus text-ink transition-colors duration-(--duration-fast) ease-(--ease-standard)';
