/**
 * Whether a press landed on a native scrollbar.
 *
 * A scrollbar is not an element: it is drawn by the browser outside the
 * element's client box, it takes the pointer for itself while it is dragged,
 * and the page hears nothing until it is let go. The drawn cursor therefore
 * cannot follow it — it stops where the drag began while the platform draws
 * its own arrow over the bar. Rather than leave two cursors on screen, the
 * shell hands over: it hides its own for the length of the drag.
 */

export function onScrollbar(target: EventTarget | null, x: number, y: number): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const rect = target.getBoundingClientRect();
  // clientWidth stops at the scrollbar, so anything past it is the gutter.
  const vertical = target.scrollHeight > target.clientHeight && x >= rect.left + target.clientWidth;
  const horizontal = target.scrollWidth > target.clientWidth && y >= rect.top + target.clientHeight;
  return vertical || horizontal;
}
