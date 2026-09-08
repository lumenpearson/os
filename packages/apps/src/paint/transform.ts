/**
 * The one mapping between the screen and the image, and its inverse.
 *
 * The image sits in the viewport at `view.x, view.y` (CSS pixels, measured
 * from the viewport's top-left) scaled by `view.scale`, which is exactly what
 * `transform: translate(x, y) scale(s)` with `transform-origin: 0 0` does. So
 *
 *     screen = view.{x,y} + image · scale        image = (screen − view.{x,y}) / scale
 *
 * Pointer events arrive in CSS pixels, so `devicePixelRatio` does not appear
 * in that conversion — but it does decide where the image grid lands on the
 * physical grid. Every view is settled through `settleView`, which rounds the
 * translation to whole device pixels; without it a 0.4 px offset at 10 % zoom
 * puts the pointer four image pixels away from the pixel under it. The same
 * ratio sizes the overlay's backing store (`backingSize`), so the grid and the
 * selection outline are one device pixel wide rather than a blurry pair.
 */

import type { Point, Rect, Size } from './geometry';

export interface View {
  /** Screen pixels per image pixel. */
  scale: number;
  /** Where the image's top-left corner sits in the viewport, in CSS pixels. */
  x: number;
  y: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 32;

/** The ladder Zoom In and Zoom Out step along: 10 % to 3200 %. */
export const ZOOM_STOPS = [
  0.1, 0.125, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32,
] as const;

/** At and above this the pixel grid is worth drawing. */
export const GRID_SCALE = 8;

const EPSILON = 1e-6;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Above 3 the extra pixels cost more than they show. */
export function clampDpr(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(3, Math.max(1, ratio));
}

/** Backing store for a canvas of this CSS size on this display. */
export function backingSize(css: Size, dpr: number): Size {
  const ratio = clampDpr(dpr);
  return {
    width: Math.max(1, Math.round(css.width * ratio)),
    height: Math.max(1, Math.round(css.height * ratio)),
  };
}

export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function zoomStepIn(scale: number): number {
  for (const stop of ZOOM_STOPS) if (stop > scale + EPSILON) return stop;
  return MAX_SCALE;
}

export function zoomStepOut(scale: number): number {
  for (let i = ZOOM_STOPS.length - 1; i >= 0; i--) {
    const stop = ZOOM_STOPS[i] as number;
    if (stop < scale - EPSILON) return stop;
  }
  return MIN_SCALE;
}

/** The scale that shows the whole image, never magnifying past 100 %. */
export function fitScale(image: Size, viewport: Size, padding = 0): number {
  const width = viewport.width - padding * 2;
  const height = viewport.height - padding * 2;
  if (image.width <= 0 || image.height <= 0 || width <= 0 || height <= 0) return 1;
  return clampScale(Math.min(1, Math.min(width / image.width, height / image.height)));
}

/**
 * Centre the image on any axis that fits, and stop the other from being
 * dragged past its own edge; then put the corner on a device pixel.
 */
export function settleView(view: View, image: Size, viewport: Size, dpr = 1): View {
  const ratio = clampDpr(dpr);
  const snap = (value: number) => Math.round(value * ratio) / ratio;
  const place = (offset: number, shown: number, available: number) => {
    if (shown <= available) return snap((available - shown) / 2);
    return snap(Math.min(0, Math.max(available - shown, offset)));
  };
  return {
    scale: view.scale,
    x: place(view.x, image.width * view.scale, viewport.width),
    y: place(view.y, image.height * view.scale, viewport.height),
  };
}

export function fitView(image: Size, viewport: Size, dpr = 1): View {
  const scale = fitScale(image, viewport, 12);
  return settleView({ scale, x: 0, y: 0 }, image, viewport, dpr);
}

/** Zoom to `scale` holding the image pixel under `anchor` (viewport CSS px) still. */
export function zoomTo(
  view: View,
  scale: number,
  anchor: Point,
  image: Size,
  viewport: Size,
  dpr = 1,
): View {
  const next = clampScale(scale);
  const ratio = next / view.scale;
  const moved: View = {
    scale: next,
    x: anchor.x - ratio * (anchor.x - view.x),
    y: anchor.y - ratio * (anchor.y - view.y),
  };
  return settleView(moved, image, viewport, dpr);
}

export function panBy(
  view: View,
  dx: number,
  dy: number,
  image: Size,
  viewport: Size,
  dpr = 1,
): View {
  return settleView({ ...view, x: view.x + dx, y: view.y + dy }, image, viewport, dpr);
}

export function viewportCentre(viewport: Size): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

/** Continuous image coordinates: 3.5 is the middle of pixel 3. */
export function toImagePoint(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.scale, y: (screen.y - view.y) / view.scale };
}

/** The pixel a screen point lands on. May be outside the image. */
export function toImagePixel(view: View, screen: Point): Point {
  const p = toImagePoint(view, screen);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** The inverse of `toImagePoint`: where an image coordinate lands on screen. */
export function toScreenPoint(view: View, image: Point): Point {
  return { x: view.x + image.x * view.scale, y: view.y + image.y * view.scale };
}

/** The middle of a pixel, which is the point that maps back to it. */
export function pixelCentre(p: Point): Point {
  return { x: p.x + 0.5, y: p.y + 0.5 };
}

export function containsPixel(p: Point, image: Size): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < image.width && p.y < image.height;
}

/** Hold a pixel inside the image; a drag that leaves the canvas still draws. */
export function clampPixel(p: Point, image: Size): Point {
  return {
    x: Math.min(image.width - 1, Math.max(0, p.x)),
    y: Math.min(image.height - 1, Math.max(0, p.y)),
  };
}

/** The part of the image currently on screen, in whole pixels. */
export function visibleRect(view: View, image: Size, viewport: Size): Rect {
  const start = toImagePoint(view, { x: 0, y: 0 });
  const end = toImagePoint(view, { x: viewport.width, y: viewport.height });
  const x0 = Math.max(0, Math.floor(start.x));
  const y0 = Math.max(0, Math.floor(start.y));
  const x1 = Math.min(image.width, Math.ceil(end.x));
  const y1 = Math.min(image.height, Math.ceil(end.y));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export function shouldShowGrid(scale: number): boolean {
  return scale >= GRID_SCALE;
}

/**
 * Where the pixel boundaries fall in the viewport, in CSS pixels — only the
 * ones on screen, and only while a pixel is big enough to bound.
 */
export function gridLines(view: View, image: Size, viewport: Size): { xs: number[]; ys: number[] } {
  if (!shouldShowGrid(view.scale)) return { xs: [], ys: [] };
  const box = visibleRect(view, image, viewport);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = box.x; x <= box.x + box.width; x++) xs.push(view.x + x * view.scale);
  for (let y = box.y; y <= box.y + box.height; y++) ys.push(view.y + y * view.scale);
  return { xs, ys };
}

export function transformCss(view: View): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}
