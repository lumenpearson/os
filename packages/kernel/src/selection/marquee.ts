import type { Rect } from '../types';

/**
 * Geometry for a selection rectangle, wherever one is dragged.
 *
 * The drag is measured in the coordinates of the layer it happens in, so the
 * same numbers describe the rectangle that is drawn and the boxes it is tested
 * against — icons on the desktop, rows and tiles in a file listing. Nothing
 * here touches the DOM: the component measures the boxes once when the drag
 * starts and asks these functions on every frame.
 */

export interface Point {
  x: number;
  y: number;
}

/** Something selectable and the box it occupies in the layer being dragged in. */
export interface IconBox {
  path: string;
  box: Rect;
}

/**
 * The rectangle two corners span. Either corner may be the anchor, so a drag
 * that goes up and to the left gives the same rectangle as the drag back down
 * and to the right: width and height are never negative.
 */
export function marqueeRect(from: Point, to: Point): Rect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/**
 * Whether the rectangle overlaps the box. Edges that only meet do not count —
 * a rectangle dragged up to an icon selects it once it is over it, not once it
 * is beside it. A drag that never moved spans nothing, so it touches only a box
 * it started inside; on empty desktop it selects nothing, which is what a plain
 * click does.
 */
export function touchesBox(rect: Rect, box: Rect): boolean {
  return (
    rect.x < box.x + box.width &&
    box.x < rect.x + rect.width &&
    rect.y < box.y + box.height &&
    box.y < rect.y + rect.height
  );
}

/**
 * Whether two selections hold the same paths. The rectangle is redrawn every
 * frame, but React only has to hear about the frames where the selection
 * actually changed.
 */
export function sameSelection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
