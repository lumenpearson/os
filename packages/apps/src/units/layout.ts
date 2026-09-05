/**
 * What fits in the window. Every threshold is read from the measured window,
 * not from the viewport: two of these windows side by side on a 4K display
 * still have to fold the way a narrow one does.
 */

/** At or above this width the categories stand in a list down the side. */
export const SIDEBAR_WIDTH = 700;
/** At or above this width they are a row of tabs instead. */
export const TABS_WIDTH = 460;
/** At or above this width a value and its unit share a row. */
export const PAIR_ROW_WIDTH = 520;
/** Below this height the recents list is dropped: the fields come first. */
export const RECENTS_HEIGHT = 420;

export type CategoryPicker = 'sidebar' | 'tabs' | 'select';

export interface UnitsLayout {
  /** How the category is chosen. */
  picker: CategoryPicker;
  /** Value field and unit picker on one row rather than stacked. */
  pairRow: boolean;
  /** Whether the recents list has room. */
  recents: boolean;
}

export interface Viewport {
  width: number;
  height: number;
}

export function layoutFor(size: Viewport, options: { showRecents: boolean }): UnitsLayout {
  const picker: CategoryPicker =
    size.width >= SIDEBAR_WIDTH ? 'sidebar' : size.width >= TABS_WIDTH ? 'tabs' : 'select';
  return {
    picker,
    pairRow: size.width >= PAIR_ROW_WIDTH,
    recents: options.showRecents && size.height >= RECENTS_HEIGHT,
  };
}
