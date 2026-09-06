/**
 * What fits in the window. Measured from the window itself, never from the
 * viewport: two of these open side by side on a large display still have to
 * fold the way a narrow one does.
 */

/** At or above this width the blocks stand in a list down the side. */
export const SIDEBAR_WIDTH = 720;
/** At or above this width the details stand in a column beside the grid. */
export const DETAILS_PANEL_WIDTH = 560;
/** Below this width the search field takes a row of its own under the toolbar. */
export const ONE_ROW_WIDTH = 620;
/** Below this height the details give way to the grid; the strip stays. */
export const DETAILS_ROWS_HEIGHT = 420;
/** Below this width the strip has room for the code point and nothing else. */
export const STRIP_DETAIL_WIDTH = 420;

export interface CharmapLayout {
  /** How a block is chosen: a list beside the grid, or a select in the toolbar. */
  blocks: 'sidebar' | 'select';
  /** Where the character's details go. */
  details: 'panel' | 'strip';
  /** Search on the toolbar row, or on a row of its own beneath it. */
  search: 'toolbar' | 'row';
  /** The strip has room for the encodings under the code point. */
  stripDetail: boolean;
}

export interface Viewport {
  width: number;
  height: number;
}

export function layoutFor(size: Viewport, options: { showSidebar: boolean }): CharmapLayout {
  return {
    blocks: options.showSidebar && size.width >= SIDEBAR_WIDTH ? 'sidebar' : 'select',
    details:
      size.width >= DETAILS_PANEL_WIDTH && size.height >= DETAILS_ROWS_HEIGHT ? 'panel' : 'strip',
    search: size.width >= ONE_ROW_WIDTH ? 'toolbar' : 'row',
    stripDetail: size.width >= STRIP_DETAIL_WIDTH,
  };
}
