/**
 * What fits in the window. Every fold is decided from the measured width of
 * the window itself, so a narrow Mail window on a 4K screen folds exactly as
 * it would on a small one.
 */

/** Under this the reading pane takes the whole width and the list steps back. */
export const READING_BREAKPOINT = 900;
/** Under this the sidebar stops holding a column and opens over the content. */
export const SIDEBAR_BREAKPOINT = 640;

export const SIDEBAR_WIDTH = 208;
const LIST_WIDTH = 336;
const LIST_WIDTH_TIGHT = 280;

export type Pane = 'list' | 'reading';

export interface MailLayout {
  /** The sidebar holds its own column beside the list. */
  sidebar: boolean;
  /** The sidebar is a panel over the content, opened from the toolbar. */
  sidebarOverlay: boolean;
  list: boolean;
  reading: boolean;
  /** The reading pane stands alone and needs a way back to the list. */
  back: boolean;
  /** The list is the only pane, so it takes the width it is given. */
  listFills: boolean;
}

export interface LayoutInput {
  /** The View > Sidebar preference, which only applies to the wide layouts. */
  showSidebar: boolean;
  /** The transient overlay, which only applies to the narrow one. */
  sidebarOpen: boolean;
  pane: Pane;
  hasSelection: boolean;
}

/**
 * Width 0 means "not measured yet" and is read as roomy, so the first paint
 * is the full three-pane layout rather than a fold that flickers away.
 */
export function layoutFor(width: number, input: LayoutInput): MailLayout {
  const w = width > 0 ? width : READING_BREAKPOINT;
  const wide = w >= READING_BREAKPOINT;
  const readingOnly = !wide && input.pane === 'reading' && input.hasSelection;
  const roomForColumn = w >= SIDEBAR_BREAKPOINT;
  return {
    sidebar: roomForColumn && input.showSidebar,
    sidebarOverlay: !roomForColumn && input.sidebarOpen,
    list: wide || !readingOnly,
    reading: wide || readingOnly,
    back: readingOnly,
    listFills: !wide,
  };
}

/** How wide the message list is while the reading pane sits next to it. */
export function listWidthFor(width: number): number {
  return width > 0 && width < 1180 ? LIST_WIDTH_TIGHT : LIST_WIDTH;
}
