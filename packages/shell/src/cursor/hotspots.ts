/**
 * Where the point of each cursor is inside its drawing.
 *
 * The layer places the drawing's top-left corner at the pointer, so a shape
 * whose point is at (4, 2.5) in its 24×24 box lands four pixels right and two
 * and a half down from where the click actually goes. Every shape therefore
 * carries the coordinates of its own point, and the layer shifts it back by
 * exactly that much: the tip does the clicking, not the pixels beside it.
 */

/** Every glyph is drawn in this box. */
export const VIEWBOX = 24;

export interface Hotspot {
  x: number;
  y: number;
}

/** The two arrows, with their point as the first coordinate of the path. */
export const ARROW_PATH =
  'M4 2.5v16.8l4.2-3.9 2.8 6.3c.2.5.8.7 1.3.5l1.9-.8c.5-.2.7-.8.5-1.3l-2.8-6.3 5.7-.5z';
export const ARROW_CLASSIC_PATH = 'M3 2l0 17 4.5-4.2 3 6.7 3.2-1.4-3-6.6 6.3-.4z';

/** The tip of the pointing hand, which is where a hand cursor clicks. */
export const POINTER_HOTSPOT: Hotspot = { x: 10.5, y: 3 };

/** The point of a path that starts with an absolute move. */
export function firstPoint(path: string): Hotspot {
  const move = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(path.trim());
  if (!move) throw new Error(`path does not start with a move: ${path.slice(0, 12)}`);
  return { x: Number(move[1]), y: Number(move[2]) };
}

export const ARROW_HOTSPOT = firstPoint(ARROW_PATH);
export const ARROW_CLASSIC_HOTSPOT = firstPoint(ARROW_CLASSIC_PATH);

/**
 * The CSS that moves a glyph so its point sits on the pointer.
 *
 * `box` is the width of the coordinate system the point was measured in — 24
 * for the shapes drawn in this file, 32 for the drawings in `set/`. The
 * percentage is of the rendered size, so the same transform is right at any
 * cursor size.
 */
export function hotspotTransform({ x, y }: Hotspot, box: number = VIEWBOX): string {
  const percent = (value: number) => `${((-value / box) * 100).toFixed(3)}%`;
  return `translate(${percent(x)}, ${percent(y)})`;
}

/**
 * The same point as a transform origin. Percentages, not pixels: the glyph is
 * drawn at whatever size the cursor setting asks for, and a pixel origin would
 * only be right at 24 px.
 */
export function hotspotOrigin({ x, y }: Hotspot, box: number = VIEWBOX): string {
  const percent = (value: number) => `${((value / box) * 100).toFixed(3)}%`;
  return `${percent(x)} ${percent(y)}`;
}

/** Shapes drawn around their middle — resize arrows, the beam, the ring. */
export const CENTRED_TRANSFORM = 'translate(-50%, -50%)';
