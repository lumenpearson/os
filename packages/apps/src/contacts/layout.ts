/**
 * What fits in the window.
 *
 * Everything here is decided from the size of the window itself, measured with
 * `useElementSize`, never from the viewport: a 380 px window on a 4K display
 * has to fold to one pane just as a 380 px display would.
 *
 * The order things are given up in, as the window narrows: the groups sidebar,
 * then the A–Z rail, then the detail pane, which becomes the whole window with
 * the list behind it.
 */

/** Below this the list and the detail cannot both be read, so they take turns. */
const SPLIT_AT = 620;

/** The groups sidebar costs 176 px, and the two panes still need their room. */
const SIDEBAR_AT = 860;

/**
 * The rail is 27 rows of 13 px plus its padding, so it needs about 360 px of
 * content height; below that, or in a list column too narrow to spare 20 px,
 * it is not drawn.
 */
const RAIL_AT_WIDTH = 460;
const RAIL_AT_HEIGHT = 420;

export const SIDEBAR_WIDTH = 176;

const LIST_MIN = 260;
const LIST_MAX = 360;

export type Pane = 'list' | 'detail';

export interface WindowSize {
  width: number;
  height: number;
}

export interface ContactsLayout {
  /** List and detail side by side. */
  split: boolean;
  /** The groups sidebar is on screen. */
  sidebar: boolean;
  /** There is room for a sidebar at all, whatever the preference says. */
  canSidebar: boolean;
  /** The A–Z rail is on screen. */
  rail: boolean;
  /** Width of the list column while split. */
  listWidth: number;
}

export interface LayoutOptions {
  /** The user's preference; the window still has the last word. */
  showGroups: boolean;
}

export function layoutFor(size: WindowSize, options: LayoutOptions): ContactsLayout {
  // Before the first measurement the width is 0; assume the declared window
  // size rather than folding everything away for one frame.
  const width = size.width > 0 ? size.width : SIDEBAR_AT;
  const height = size.height > 0 ? size.height : RAIL_AT_HEIGHT;
  const split = width >= SPLIT_AT;
  const canSidebar = width >= SIDEBAR_AT;
  const listRoom = split ? clamp(Math.round(width * 0.3), LIST_MIN, LIST_MAX) : width;
  return {
    split,
    sidebar: canSidebar && options.showGroups,
    canSidebar,
    rail: width >= RAIL_AT_WIDTH && height >= RAIL_AT_HEIGHT,
    listWidth: listRoom,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Which pane a folded window shows. */
export function visiblePane(layout: ContactsLayout, pane: Pane, hasSelection: boolean): Pane {
  if (layout.split) return 'list';
  return pane === 'detail' && hasSelection ? 'detail' : 'list';
}
