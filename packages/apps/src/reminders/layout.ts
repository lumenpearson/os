/**
 * What fits at a given window width. The window is measured, never the
 * viewport: two Reminders windows side by side each get the layout their own
 * size earns.
 */

/** Below this the sidebar does not fit beside the list and folds away. */
export const SIDEBAR_BREAKPOINT = 640;
/** Below this the toolbar goes to icons and the search field narrows. */
export const COMPACT_BREAKPOINT = 560;
/** Below this a row stops naming the list a reminder came from. */
export const LIST_NAME_BREAKPOINT = 520;

export const SIDEBAR_WIDTH = 208;
/** A line of text stays readable; the rest of a wide window is margin. */
export const CONTENT_MAX_WIDTH = 880;

export interface RemindersLayout {
  /** The sidebar is on screen. */
  sidebar: boolean;
  /** There is room for it, so the toolbar button can toggle it. Below this
      the same button opens the lists as a menu instead. */
  sidebarFits: boolean;
  listNames: boolean;
  compact: boolean;
}

export function layoutFor(width: number, options: { showSidebar: boolean }): RemindersLayout {
  const sidebarFits = width >= SIDEBAR_BREAKPOINT;
  return {
    sidebar: options.showSidebar && sidebarFits,
    sidebarFits,
    listNames: width >= LIST_NAME_BREAKPOINT,
    compact: width < COMPACT_BREAKPOINT,
  };
}
