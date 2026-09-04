/**
 * Everything the tools rasterise: the line, the shape outlines and fills, the
 * brush stamp, and the constraints Shift and Alt put on a drag.
 *
 * Coordinates here are whole image pixels — `{ x: 3, y: 4 }` is the pixel, not
 * a point on its edge — and every rectangle is inclusive: a drag from pixel 2
 * to pixel 5 is four pixels wide.
 *
 * There is one circle rasteriser, `ellipseSpans`: a pixel is inside when its
 * centre is inside the ellipse inscribed in the box. The brush stamp is built
 * from it as well, so a single dot from a size-N brush covers exactly the
 * pixels an N×N ellipse would.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One horizontal run of pixels, both ends included. */
export interface Span {
  y: number;
  x0: number;
  x1: number;
}

/** The angles Shift snaps a line to. */
export const ANGLE_STEP = 15;

export function point(x: number, y: number): Point {
  return { x: Math.round(x), y: Math.round(y) };
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Bresenham, both ends included. A zero-length line is one pixel. */
export function linePoints(from: Point, to: Point): Point[] {
  let x = Math.round(from.x);
  let y = Math.round(from.y);
  const x1 = Math.round(to.x);
  const y1 = Math.round(to.y);
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const stepX = x < x1 ? 1 : -1;
  const stepY = y < y1 ? 1 : -1;
  let error = dx + dy;
  const points: Point[] = [];
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) return points;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

/**
 * Points to stamp a soft brush at, from just after `from` up to and including
 * `to`. The end is always included so the pixel under the cursor is painted.
 */
export function strokePoints(from: Point, to: Point, spacing: number): Point[] {
  const step = Math.max(0.25, spacing);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [{ x: to.x, y: to.y }];
  const count = Math.floor(length / step);
  const points: Point[] = [];
  for (let i = 1; i <= count; i++) {
    const t = (i * step) / length;
    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
  const last = points[points.length - 1];
  if (!last || last.x !== to.x || last.y !== to.y) points.push({ x: to.x, y: to.y });
  return points;
}

/** Distance between stamps for a brush of this diameter, in image pixels. */
export function stampSpacing(diameter: number): number {
  return Math.max(0.5, diameter * 0.2);
}

/** Shift on a line: keep the length, snap the angle to a multiple of `step`. */
export function snapAngle(from: Point, to: Point, step = ANGLE_STEP): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const length = Math.hypot(dx, dy);
  const radians = (step * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / radians) * radians;
  return {
    x: from.x + Math.round(Math.cos(angle) * length),
    y: from.y + Math.round(Math.sin(angle) * length),
  };
}

/** Shift on a shape: the longer axis wins, so the box is square. */
export function squareOff(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + (dx < 0 ? -size : size), y: from.y + (dy < 0 ? -size : size) };
}

/** The inclusive box between two pixels. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 };
}

/** The box a drag makes, with Shift (square) and Alt (from the centre) applied. */
export function dragRect(
  from: Point,
  to: Point,
  options: { square?: boolean; fromCentre?: boolean } = {},
): Rect {
  const corner = options.square ? squareOff(from, to) : to;
  if (!options.fromCentre) return normalizeRect(from, corner);
  const dx = Math.abs(corner.x - from.x);
  const dy = Math.abs(corner.y - from.y);
  return { x: from.x - dx, y: from.y - dy, width: dx * 2 + 1, height: dy * 2 + 1 };
}

export function isEmptyRect(rect: Rect | null): boolean {
  return rect === null || rect.width <= 0 || rect.height <= 0;
}

export function rectContains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;
}

/** The part of `rect` inside the image; null when it falls outside entirely. */
export function clampRect(rect: Rect, bounds: Size): Rect | null {
  const x0 = Math.max(0, Math.min(rect.x, bounds.width));
  const y0 = Math.max(0, Math.min(rect.y, bounds.height));
  const x1 = Math.min(bounds.width, Math.max(rect.x + rect.width, 0));
  const y1 = Math.min(bounds.height, Math.max(rect.y + rect.height, 0));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function rectSpans(rect: Rect): Span[] {
  if (isEmptyRect(rect)) return [];
  const spans: Span[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    spans.push({ y, x0: rect.x, x1: rect.x + rect.width - 1 });
  }
  return spans;
}

/** The one-pixel border of the box. */
export function rectPath(rect: Rect): Point[] {
  if (isEmptyRect(rect)) return [];
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  const points: Point[] = [];
  for (let x = rect.x; x <= right; x++) {
    points.push({ x, y: rect.y });
    if (bottom !== rect.y) points.push({ x, y: bottom });
  }
  for (let y = rect.y + 1; y < bottom; y++) {
    points.push({ x: rect.x, y });
    if (right !== rect.x) points.push({ x: right, y });
  }
  return points;
}

/** Rows of the ellipse inscribed in the box: a pixel is in when its centre is. */
export function ellipseSpans(rect: Rect): Span[] {
  if (isEmptyRect(rect)) return [];
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const spans: Span[] = [];
  for (let row = 0; row < rect.height; row++) {
    const dy = (row + 0.5 - ry) / ry;
    const remainder = 1 - dy * dy;
    if (remainder < 0) continue;
    const half = rx * Math.sqrt(remainder);
    const x0 = Math.max(0, Math.ceil(rx - half - 0.5));
    const x1 = Math.min(rect.width - 1, Math.floor(rx + half - 0.5));
    if (x1 < x0) continue;
    spans.push({ y: rect.y + row, x0: rect.x + x0, x1: rect.x + x1 });
  }
  return spans;
}

/** The outline of that ellipse: the filled pixels with a gap on one side. */
export function ellipsePath(rect: Rect): Point[] {
  const spans = ellipseSpans(rect);
  const rows = new Map<number, Span>();
  for (const span of spans) rows.set(span.y, span);
  const inside = (y: number, x: number) => {
    const span = rows.get(y);
    return span !== undefined && x >= span.x0 && x <= span.x1;
  };
  const points: Point[] = [];
  for (const span of spans) {
    for (let x = span.x0; x <= span.x1; x++) {
      if (x === span.x0 || x === span.x1 || !inside(span.y - 1, x) || !inside(span.y + 1, x)) {
        points.push({ x, y: span.y });
      }
    }
  }
  return points;
}

/**
 * The pixels a brush of this diameter covers, as offsets from the pixel under
 * the cursor. Even sizes lean down and right, which is the only way to centre
 * an even disc on a pixel grid.
 */
export function discOffsets(diameter: number): Point[] {
  const size = Math.max(1, Math.round(diameter));
  const anchor = Math.floor((size - 1) / 2);
  const offsets: Point[] = [];
  for (const span of ellipseSpans({ x: 0, y: 0, width: size, height: size })) {
    for (let x = span.x0; x <= span.x1; x++) offsets.push({ x: x - anchor, y: span.y - anchor });
  }
  return offsets;
}
