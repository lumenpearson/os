/**
 * The primitives that put pixels on a 2D context. Everything that decides
 * *which* pixels lives in `geometry.ts`; this file only draws them.
 *
 * Two ways of laying down a stroke, on purpose:
 *
 *  - The pencil, the eraser and the shape outlines stamp an aliased disc
 *    along a rasterised path. Every pixel is on or off, so a 1 px pencil is
 *    one pixel and a zoomed-in edge is a staircase, which is what a bitmap
 *    editor is for.
 *  - The brush strokes the whole polyline in one `stroke()` call with a round
 *    cap and an optional blur. Redrawing the whole path each frame is what
 *    keeps a soft edge from darkening where the stamps overlap.
 *
 * Both draw into the preview canvas at full opacity; `compositeStroke` puts
 * that layer onto the document once, at the colour's own alpha. That is also
 * how the eraser works — the same layer, composited with `destination-out`.
 */

import { clampUnit, cssColour, type Rgba } from './colour';
import {
  discSpans,
  ellipsePath,
  ellipseSpans,
  linePoints,
  type Point,
  type Rect,
  rectPath,
  rectSpans,
  type Size,
  type Span,
} from './geometry';
import type { ShapeStyle } from './tools';

type Ctx = CanvasRenderingContext2D;

export interface Stamp {
  /** Rows of the disc, offset from the pixel under the cursor. */
  spans: readonly Span[];
  /** Stamp every nth pixel of a path; the disc is wide enough to cover the rest. */
  step: number;
}

export function makeStamp(size: number): Stamp {
  const diameter = Math.max(1, Math.round(size));
  return { spans: discSpans(diameter), step: Math.max(1, Math.floor(diameter / 4)) };
}

export function context(canvas: HTMLCanvasElement | null): Ctx | null {
  return canvas?.getContext('2d') ?? null;
}

/** An off-screen canvas the same size as a region, for scratch work. */
export function createSurface(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  return canvas;
}

export function clear(ctx: Ctx, size: Size): void {
  ctx.clearRect(0, 0, size.width, size.height);
}

export function fill(ctx: Ctx, size: Size, colour: Rgba): void {
  ctx.save();
  ctx.globalCompositeOperation = 'copy';
  ctx.fillStyle = cssColour(colour);
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.restore();
}

export function fillSpans(ctx: Ctx, spans: readonly Span[]): void {
  for (const span of spans) ctx.fillRect(span.x0, span.y, span.x1 - span.x0 + 1, 1);
}

export function stampAt(ctx: Ctx, stamp: Stamp, p: Point): void {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  for (const span of stamp.spans) {
    ctx.fillRect(x + span.x0, y + span.y, span.x1 - span.x0 + 1, 1);
  }
}

/**
 * Stamp along a rasterised path. The last point is always stamped so the
 * pixel under the cursor is painted and the next segment joins onto it.
 */
export function stampAlong(ctx: Ctx, stamp: Stamp, points: readonly Point[], skipFirst = false) {
  const last = points.length - 1;
  for (let i = skipFirst ? 1 : 0; i <= last; i++) {
    if (i % stamp.step !== 0 && i !== last) continue;
    const p = points[i];
    if (p) stampAt(ctx, stamp, p);
  }
}

/** One segment of a pencil or eraser stroke, aliased. */
export function paintPencil(ctx: Ctx, from: Point, to: Point, colour: Rgba, size: number): void {
  ctx.fillStyle = cssColour(opaque(colour));
  stampAlong(ctx, makeStamp(size), linePoints(from, to), true);
}

export function paintDot(ctx: Ctx, at: Point, colour: Rgba, size: number): void {
  ctx.fillStyle = cssColour(opaque(colour));
  stampAt(ctx, makeStamp(size), at);
}

/** The whole brush stroke so far, drawn in one pass so nothing doubles up. */
export function paintBrush(
  ctx: Ctx,
  points: readonly Point[],
  colour: Rgba,
  size: number,
  hardness: number,
): void {
  const first = points[0];
  if (!first) return;
  const radius = Math.max(0.5, size / 2);
  const blur = (1 - clampUnit(hardness)) * radius;
  ctx.save();
  ctx.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
  ctx.fillStyle = cssColour(opaque(colour));
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (points.length === 1) {
    ctx.arc(first.x + 0.5, first.y + 0.5, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(first.x + 0.5, first.y + 0.5);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p) ctx.lineTo(p.x + 0.5, p.y + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function paintLine(ctx: Ctx, from: Point, to: Point, colour: Rgba, size: number): void {
  ctx.fillStyle = cssColour(opaque(colour));
  stampAlong(ctx, makeStamp(size), linePoints(from, to));
}

export interface ShapePaint {
  style: ShapeStyle;
  /** The outline colour. `fill` alone uses this too. */
  stroke: Rgba;
  /** The inside colour, used by "outline and fill". */
  fill: Rgba;
  size: number;
}

export function paintShape(
  ctx: Ctx,
  kind: 'rectangle' | 'ellipse',
  rect: Rect,
  paint: ShapePaint,
): void {
  const spans = kind === 'rectangle' ? rectSpans(rect) : ellipseSpans(rect);
  const path = kind === 'rectangle' ? rectPath(rect) : ellipsePath(rect);
  if (paint.style !== 'stroke') {
    ctx.fillStyle = cssColour(opaque(paint.style === 'fill' ? paint.stroke : paint.fill));
    fillSpans(ctx, spans);
  }
  if (paint.style !== 'fill') {
    ctx.fillStyle = cssColour(opaque(paint.stroke));
    stampAlong(ctx, makeStamp(paint.size), path);
  }
}

export function paintText(
  ctx: Ctx,
  text: string,
  at: Point,
  options: { size: number; colour: Rgba; family: string },
): void {
  ctx.save();
  ctx.fillStyle = cssColour(opaque(options.colour));
  ctx.font = `${options.size}px ${options.family}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, at.x, at.y);
  ctx.restore();
}

/** Put the finished stroke layer onto the document, once, at its real alpha. */
export function compositeStroke(
  target: Ctx,
  layer: HTMLCanvasElement,
  mode: 'draw' | 'erase',
  alpha: number,
): void {
  target.save();
  target.globalAlpha = clampUnit(alpha);
  target.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  target.drawImage(layer, 0, 0);
  target.restore();
}

/** Strokes are drawn opaque and composited at the colour's alpha. */
function opaque(colour: Rgba): Rgba {
  return colour.a === 255 ? colour : { ...colour, a: 255 };
}
