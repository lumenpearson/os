/**
 * Which part of a window a drag can start from.
 *
 * A window with an inset title bar has no title bar of its own: the app draws
 * its toolbar up there and the three controls float over it. The strip has to
 * pass its clicks through to the app, so it cannot be the thing that listens
 * for the drag — the whole frame listens instead, and this decides whether the
 * pointer landed on somewhere draggable. That is also the macOS rule: the bar
 * drags from anywhere that is not a control.
 */

/** Anything a person can operate, plus whatever opts out by hand. */
const CONTROLS =
  'button, a[href], input, select, textarea, [contenteditable="true"], [role="button"], [role="tab"], [role="slider"], [role="menuitem"], [data-no-drag]';

export interface DragSurface {
  /** Where the pointer went down, relative to the top of the window. */
  offsetY: number;
  /** Height of the title bar strip, in px. */
  titleBarHeight: number;
  target: Element | null;
  /** The window frame; the search for a control stops here. */
  frame: Element | null;
}

export function isDragSurface({ offsetY, titleBarHeight, target, frame }: DragSurface): boolean {
  if (offsetY < 0 || offsetY > titleBarHeight) return false;
  if (!(target instanceof Element)) return true;
  const control = target.closest(CONTROLS);
  // A control outside this window belongs to someone else's stacking context.
  return control === null || (frame !== null && !frame.contains(control));
}

/** The title bar height the frame is drawn with, read from the theme. */
export function titleBarHeight(element: Element | null): number {
  if (!element) return 36;
  const value = getComputedStyle(element).getPropertyValue('--lumen-window-titlebar-h');
  return Number.parseFloat(value) || 36;
}
