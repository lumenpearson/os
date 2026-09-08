/**
 * What fits in the window. The window is not the screen, so every threshold
 * here is measured against the window's own width: a person can drag Photos
 * down to 360 px and everything that will not fit at that width has to leave
 * rather than be squeezed. What leaves is still reachable from the menubar.
 */

export interface LayoutPrefs {
  sidebar: boolean;
  info: boolean;
}

export interface PhotosLayout {
  /** The album list beside the grid. */
  sidebar: boolean;
  /** The facts panel on the other side. */
  info: boolean;
  /** An album picker in the toolbar, for when there is no room for the list. */
  albumPicker: boolean;
  /** The sort key and its direction. */
  sortControls: boolean;
  /** The thumbnail size. */
  sizeControl: boolean;
  /** The buttons that show and hide the two panels. */
  panelToggles: boolean;
}

/** Window widths, in pixels, at which each part earns its room. */
export const SIDEBAR_WIDTH_MIN = 640;
export const INFO_WIDTH_MIN = 520;
/** With the album list already taking 180 px, the facts panel needs more. */
export const INFO_WITH_SIDEBAR_WIDTH_MIN = 900;
export const ALBUM_PICKER_WIDTH_MIN = 420;
export const SORT_WIDTH_MIN = 520;
export const SIZE_WIDTH_MIN = 760;

export function layoutFor(width: number, prefs: LayoutPrefs): PhotosLayout {
  // Before the window has been measured, assume it is wide: the first paint
  // then matches the common case instead of flashing the narrow layout.
  const w = width > 0 ? width : SIDEBAR_WIDTH_MIN;
  const sidebar = prefs.sidebar && w >= SIDEBAR_WIDTH_MIN;
  const info = prefs.info && w >= (sidebar ? INFO_WITH_SIDEBAR_WIDTH_MIN : INFO_WIDTH_MIN);
  return {
    sidebar,
    info,
    albumPicker: !sidebar && w >= ALBUM_PICKER_WIDTH_MIN,
    sortControls: w >= SORT_WIDTH_MIN,
    sizeControl: w >= SIZE_WIDTH_MIN,
    panelToggles: w >= SIDEBAR_WIDTH_MIN,
  };
}
