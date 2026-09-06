/**
 * Viewer geometry: fit-to-window, zoom towards a point, panning limits and
 * the CSS transform they compose into.
 *
 * The content is centred in the viewport, so the view is a translation from
 * that centre plus a linear map. A content point `p` (in unrotated image
 * pixels, measured from the image centre) lands at
 *
 *     screen = viewportCentre + t + Flip(Rotate(scale · p))
 *
 * which is exactly `transform: translate(t) scale(flip) rotate(r) scale(s)`.
 * Because the translation sits outside the linear part, zooming towards a
 * point never needs the rotation: see `zoomToward`.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface View {
  scale: number;
  /** Translation of the content centre from the viewport centre, in pixels. */
  x: number;
  y: number;
  rotation: Rotation;
  flipX: boolean;
  flipY: boolean;
  /** The scale follows the window until the user zooms. */
  fit: boolean;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 16;

/** The zoom ladder the +/- commands step through. */
export const ZOOM_STOPS = [
  0.1, 0.125, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16,
] as const;

export const INITIAL_VIEW: View = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  fit: true,
};

const EPSILON = 1e-6;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function normalizeRotation(degrees: number): Rotation {
  const wrapped = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return wrapped as Rotation;
}

/** The box the content occupies after rotation, before scaling. */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** The box the content occupies on screen. */
export function displayedSize(content: Size, view: View): Size {
  const box = rotatedSize(content, view.rotation);
  return { width: box.width * view.scale, height: box.height * view.scale };
}

/**
 * The scale that shows the whole thing. Small content is left at 100 % unless
 * `allowUpscale` is set, so a 16×16 icon does not fill the window.
 */
export function fitScale(
  content: Size,
  viewport: Size,
  rotation: Rotation = 0,
  options: { allowUpscale?: boolean; padding?: number } = {},
): number {
  const padding = options.padding ?? 0;
  const box = rotatedSize(content, rotation);
  const width = Math.max(0, viewport.width - padding * 2);
  const height = Math.max(0, viewport.height - padding * 2);
  if (box.width <= 0 || box.height <= 0 || width <= 0 || height <= 0) return 1;
  const scale = Math.min(width / box.width, height / box.height);
  return clampScale(options.allowUpscale ? scale : Math.min(1, scale));
}

/** The next stop up the ladder, or the top of it. */
export function zoomIn(scale: number): number {
  for (const stop of ZOOM_STOPS) if (stop > scale + EPSILON) return stop;
  return MAX_SCALE;
}

/** The next stop down the ladder, or the bottom of it. */
export function zoomOut(scale: number): number {
  for (let i = ZOOM_STOPS.length - 1; i >= 0; i--) {
    const stop = ZOOM_STOPS[i] as number;
    if (stop < scale - EPSILON) return stop;
  }
  return MIN_SCALE;
}

/**
 * Translation that keeps `anchor` — a point in viewport coordinates, origin
 * at the top-left — over the same pixel of the content after the scale
 * changes. Derived from `screen = centre + t + M·s·p`: the content point is
 * `M·p = (anchor − centre − t) / s`, and holding `screen` fixed at the new
 * scale gives `t' = c − (s'/s)·(c − t)` with `c = anchor − centre`.
 */
export function zoomToward(view: View, nextScale: number, anchor: Point, viewport: Size): Point {
  const cx = anchor.x - viewport.width / 2;
  const cy = anchor.y - viewport.height / 2;
  const ratio = nextScale / view.scale;
  return { x: cx - ratio * (cx - view.x), y: cy - ratio * (cy - view.y) };
}

/**
 * Keep the content in the window: an axis smaller than the viewport is
 * centred, a larger one may not be dragged past its own edge.
 */
export function clampPan(view: View, content: Size, viewport: Size): Point {
  const shown = displayedSize(content, view);
  const limit = (size: number, available: number) => Math.max(0, (size - available) / 2);
  const maxX = limit(shown.width, viewport.width);
  const maxY = limit(shown.height, viewport.height);
  // Negative zero is a real value to `Object.is`, and it reads as "-0px".
  const zeroed = (value: number) => (value === 0 ? 0 : value);
  return {
    x: zeroed(Math.min(maxX, Math.max(-maxX, view.x))),
    y: zeroed(Math.min(maxY, Math.max(-maxY, view.y))),
  };
}

/** Zoom to `scale`, holding `anchor` still, then pull the content back into view. */
export function applyZoom(
  view: View,
  scale: number,
  anchor: Point,
  content: Size,
  viewport: Size,
): View {
  const next = clampScale(scale);
  const shifted = zoomToward(view, next, anchor, viewport);
  const zoomed: View = { ...view, scale: next, x: shifted.x, y: shifted.y, fit: false };
  return { ...zoomed, ...clampPan(zoomed, content, viewport) };
}

/** The centre of the viewport: the anchor for keyboard and menu zooming. */
export function viewportCentre(viewport: Size): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

export function fitView(view: View, content: Size, viewport: Size): View {
  return {
    ...view,
    scale: fitScale(content, viewport, view.rotation),
    x: 0,
    y: 0,
    fit: true,
  };
}

export function actualView(view: View): View {
  return { ...view, scale: 1, x: 0, y: 0, fit: false };
}

export function panBy(view: View, dx: number, dy: number, content: Size, viewport: Size): View {
  const moved: View = { ...view, x: view.x + dx, y: view.y + dy };
  return { ...moved, ...clampPan(moved, content, viewport) };
}

/** Rotate by a multiple of 90°, re-fitting if the view was following the window. */
export function rotateBy(view: View, degrees: number, content: Size, viewport: Size): View {
  const rotation = normalizeRotation(view.rotation + degrees);
  const rotated: View = { ...view, rotation };
  if (view.fit) return fitView(rotated, content, viewport);
  return { ...rotated, ...clampPan(rotated, content, viewport) };
}

export function flip(view: View, axis: 'x' | 'y'): View {
  return axis === 'x' ? { ...view, flipX: !view.flipX } : { ...view, flipY: !view.flipY };
}

/** `translate() scale(flip) rotate() scale()`, in that order. */
export function transformCss(view: View): string {
  const parts = [`translate(${round(view.x)}px, ${round(view.y)}px)`];
  if (view.flipX || view.flipY) parts.push(`scale(${view.flipX ? -1 : 1}, ${view.flipY ? -1 : 1})`);
  if (view.rotation !== 0) parts.push(`rotate(${view.rotation}deg)`);
  parts.push(`scale(${round(view.scale, 4)})`);
  return parts.join(' ');
}

/**
 * Where a content point lands in the viewport. The transform is written once
 * in CSS and once here; the tests hold the two to the same answers.
 */
export function screenPoint(view: View, viewport: Size, point: Point): Point {
  const sx = point.x * view.scale;
  const sy = point.y * view.scale;
  const radians = (view.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;
  return {
    x: viewport.width / 2 + view.x + (view.flipX ? -rx : rx),
    y: viewport.height / 2 + view.y + (view.flipY ? -ry : ry),
  };
}

export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
