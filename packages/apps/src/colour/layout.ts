/**
 * What fits. Every threshold reads the measured window, never the viewport: a
 * 380px window on a 4K display has to fold exactly as it would on a laptop.
 */

/** At or above this width the picker and the open panel stand side by side. */
export const COLUMNS_WIDTH = 840;

/** The saturation/value field never shrinks below this, and never grows past. */
export const MIN_FIELD_HEIGHT = 96;
export const MAX_FIELD_HEIGHT = 260;

export interface Size {
  width: number;
  height: number;
}

export interface ColourLayout {
  /** Picker beside the panel rather than above it. */
  columns: boolean;
  /** Height in pixels for the saturation/value field. */
  fieldHeight: number;
}

/**
 * The field takes about a third of the window's height. Below the floor it
 * stops being aimable; above the ceiling it starts crowding out the readouts,
 * which are the part of this app people came for.
 */
export function fieldHeightFor(height: number): number {
  const wanted = Math.round(height * 0.32);
  return Math.max(MIN_FIELD_HEIGHT, Math.min(MAX_FIELD_HEIGHT, wanted));
}

export function layoutFor(size: Size): ColourLayout {
  return {
    columns: size.width >= COLUMNS_WIDTH,
    fieldHeight: fieldHeightFor(size.height),
  };
}
