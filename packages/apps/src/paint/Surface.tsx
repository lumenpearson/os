/**
 * The drawing surface: the document, the stroke in progress, and the overlay
 * that carries the pixel grid and the selection marquee.
 *
 * Three canvases, stacked. The document holds the committed pixels and is
 * owned by the app rather than by React — it is handed in and only drawn on
 * here, because a canvas React re-created would take the picture with it. The
 * stroke in progress goes onto the preview canvas at full opacity and is
 * composited down once, when the pointer lifts: that is what stops a soft
 * brush darkening where it crosses itself, and it makes the eraser the same
 * code path with a different composite mode. The overlay is viewport-sized
 * rather than image-sized, so a grid line stays one device pixel wide at any
 * zoom.
 *
 * No React state is written while the pointer is down. A pan moves the stage
 * by writing its style inside `requestAnimationFrame` and reports the view
 * once, at the end; the selection marquee is drawn straight onto the overlay
 * and becomes state only when the drag finishes. The wheel makes the same
 * bargain, with a short timer standing in for the pointer lifting. The price
 * is the overlay: it is drawn from the committed view, so through a pan or a
 * wheel the grid sits where the stage was rather than where it is, and catches
 * up when the gesture lands.
 */

import { cx } from '@lumen/ui';
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { formatHex, parseHex, type Rgba } from './colour';
import { type Bitmap, floodFill, sampleAt } from './flood';
import {
  clampRect,
  isEmptyRect,
  normalizeRect,
  type Point,
  point,
  type Rect,
  type Size,
  snapAngle,
  squareOff,
} from './geometry';
import type { PaintPrefs } from './prefs';
import {
  compositeStroke,
  context,
  paintBrush,
  paintDot,
  paintLine,
  paintPencil,
  paintShape,
} from './raster';
import { isFreehandTool, isShapeTool, type ToolId, toolSpec } from './tools';
import {
  backingSize,
  clampDpr,
  clampPixel,
  containsPixel,
  gridLines,
  panBy,
  toImagePixel,
  type View,
  zoomTo,
} from './transform';

/** Zoom per wheel notch. A trackpad sends many small deltas; a mouse, few big. */
const WHEEL_ZOOM = 1.0015;

/** How long after the last wheel notch the view is handed back to React. */
const WHEEL_SETTLE_MS = 120;

/**
 * Transparency is shown as a check rather than as white, because white is a
 * colour a document can actually contain. Two neutrals, 16 px, fixed to the
 * screen so it does not swim when the image is zoomed.
 */
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(var(--color-surface-2) 0% 25%, var(--color-surface) 0% 50%)',
  backgroundSize: '16px 16px',
};

export interface SurfaceProps {
  /** The committed pixels. Owned by the app; this component only draws on it. */
  document: HTMLCanvasElement | null;
  size: Size;
  view: View;
  viewport: Size;
  tool: ToolId;
  prefs: PaintPrefs;
  selection: Rect | null;
  /** Bumped whenever the document changed, which is how undo reaches the grid. */
  revision: number;
  onView: (view: View) => void;
  onSelection: (rect: Rect | null) => void;
  /** A gesture finished and the document changed: take a snapshot. */
  onCommit: () => void;
  onPickColour: (hex: string) => void;
  onPlaceText: (at: Point) => void;
}

export function Surface({
  document: doc,
  size,
  view,
  viewport,
  tool,
  prefs,
  selection,
  revision,
  onView,
  onSelection,
  onCommit,
  onPickColour,
  onPlaceText,
}: SurfaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  /** The live gesture. Never state: it changes on every pointer event. */
  const gesture = useRef<Gesture | null>(null);
  /** The marquee while it is being dragged, before it becomes the selection. */
  const marquee = useRef<Rect | null>(null);
  /**
   * The view on screen. Between the first wheel notch and the settle it is
   * ahead of the `view` prop, so everything that converts screen to image —
   * the next notch, a pan, the pixel under the pointer — reads it rather than
   * the prop, which is one gesture behind.
   */
  const liveView = useRef<View>(view);
  const wheelFrame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dpr = clampDpr(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

  // The document canvas is made by the app, so it is put into the stage by
  // hand: React must not own a node it did not create.
  useEffect(() => {
    const slot = stage.current;
    if (!slot || !doc) return;
    doc.className = 'absolute inset-0 size-full';
    slot.prepend(doc);
    return () => doc.remove();
  }, [doc]);

  const drawOverlay = useCallback(() => {
    const ctx = context(overlay.current);
    if (!ctx) return;
    const backing = backingSize(viewport, dpr);
    const ratio = backing.width / Math.max(1, viewport.width);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, backing.width, backing.height);
    ctx.scale(ratio, ratio);

    if (prefs.showGrid) {
      const lines = gridLines(view, size, viewport);
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
      ctx.lineWidth = 1 / ratio;
      ctx.beginPath();
      for (const x of lines.xs) {
        ctx.moveTo(x, view.y);
        ctx.lineTo(x, view.y + size.height * view.scale);
      }
      for (const y of lines.ys) {
        ctx.moveTo(view.x, y);
        ctx.lineTo(view.x + size.width * view.scale, y);
      }
      ctx.stroke();
    }

    const box = marquee.current ?? selection;
    if (box && !isEmptyRect(box)) {
      // Two passes, white then dashed black, so the outline reads on any
      // picture underneath without inventing a colour of its own.
      const x = view.x + box.x * view.scale + 0.5;
      const y = view.y + box.y * view.scale + 0.5;
      const w = box.width * view.scale;
      const h = box.height * view.scale;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [view, size, viewport, selection, prefs.showGrid, dpr]);

  // `revision` is not read by the body; its changing is the whole reason to
  // repaint, because an undo replaces the pixels under the marquee.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the revision is the signal that the document changed
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay, revision]);

  const frame = useRef(0);
  const repaint = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawOverlay();
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // The prop is the truth again the moment React has it, whether that came
  // from a gesture ending or from a zoom command on the menu.
  useLayoutEffect(() => {
    liveView.current = view;
  }, [view]);

  useEffect(
    () => () => {
      if (wheelFrame.current) cancelAnimationFrame(wheelFrame.current);
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  /** Put the stage where `liveView` says without going through React. */
  const paintStage = () => {
    if (wheelFrame.current) return;
    wheelFrame.current = requestAnimationFrame(() => {
      wheelFrame.current = 0;
      const node = stage.current;
      if (!node) return;
      const next = liveView.current;
      node.style.left = `${next.x}px`;
      node.style.top = `${next.y}px`;
      node.style.width = `${size.width * next.scale}px`;
      node.style.height = `${size.height * next.scale}px`;
    });
  };

  /** Hand the wheel's view to React now rather than on the settle timer. */
  const commitWheel = () => {
    if (!settle.current) return;
    clearTimeout(settle.current);
    settle.current = null;
    onView(liveView.current);
  };

  const ink = () => parseHex(prefs.foreground) ?? { r: 0, g: 0, b: 0, a: 255 };
  const paper = () => parseHex(prefs.background) ?? { r: 255, g: 255, b: 255, a: 255 };

  /** The image pixel under a pointer event; may be outside the image. */
  const pixelAt = (event: { clientX: number; clientY: number }): Point => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return point(0, 0);
    return toImagePixel(liveView.current, point(event.clientX - box.left, event.clientY - box.top));
  };

  const clearPreview = () => {
    const ctx = context(preview.current);
    if (ctx) ctx.clearRect(0, 0, size.width, size.height);
  };

  const eyedrop = (at: Point) => {
    const ctx = context(doc);
    if (!ctx || !containsPixel(at, size)) return;
    const data = ctx.getImageData(at.x, at.y, 1, 1);
    const found = sampleAt({ data: data.data, width: 1, height: 1 }, point(0, 0));
    if (found) onPickColour(formatHex(found));
  };

  const bucket = (at: Point) => {
    const ctx = context(doc);
    if (!ctx || !containsPixel(at, size)) return;
    const data = ctx.getImageData(0, 0, size.width, size.height);
    const bitmap: Bitmap = { data: data.data, width: size.width, height: size.height };
    if (!floodFill(bitmap, at, ink(), prefs.tolerance)) return;
    ctx.putImageData(data, 0, 0);
    onCommit();
  };

  /** A pan: the stage moves under the pointer, the view is told once, at the end. */
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = { x: event.clientX, y: event.clientY };
    const base = liveView.current;
    let latest = base;
    let pending = 0;
    const node = stage.current;
    // The tool's cursor is a claim about the next mark; while the middle
    // button carries the image the claim is that it is being carried. React
    // writes the attribute only when the tool changes, so the pan puts it back.
    const surface = host.current;
    if (surface) surface.dataset.cursor = 'grabbing';
    const move = (e: PointerEvent) => {
      latest = panBy(base, e.clientX - from.x, e.clientY - from.y, size, viewport, dpr);
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (node) {
          node.style.left = `${latest.x}px`;
          node.style.top = `${latest.y}px`;
        }
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (pending) cancelAnimationFrame(pending);
      if (surface) surface.dataset.cursor = toolSpec(tool).cursor;
      liveView.current = latest;
      onView(latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2) return;
    // A wheel gesture may still be holding its view back, and the pointer is
    // about to act on what is on screen. Hand it over now.
    commitWheel();
    // The middle button pans, whatever the tool is — the same gesture every
    // image editor has, and the only one that works with no keyboard.
    if (event.button === 1) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (!host.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    const raw = pixelAt(event);
    const at = clampPixel(raw, size);
    // Alt draws with the background colour, which is how a two-colour palette
    // is meant to work; the eyedropper and the bucket read the raw pixel so a
    // click outside the image does nothing rather than something at the edge.
    const colour = event.altKey ? paper() : ink();

    switch (tool) {
      case 'eyedropper':
        eyedrop(raw);
        return;
      case 'fill':
        bucket(raw);
        return;
      case 'text':
        if (containsPixel(raw, size)) onPlaceText(at);
        return;
      case 'select':
        gesture.current = { kind: 'select', anchor: at, cursor: at };
        marquee.current = null;
        onSelection(null);
        return;
      default:
        break;
    }

    const ctx = context(preview.current);
    if (!ctx) return;
    if (isFreehandTool(tool)) {
      gesture.current = { kind: 'freehand', anchor: at, cursor: at, points: [at], colour };
      if (tool === 'brush') paintBrush(ctx, [at], colour, prefs.brushSize, prefs.hardness);
      else paintDot(ctx, at, colour, prefs.brushSize);
      return;
    }
    gesture.current = { kind: 'shape', anchor: at, cursor: at, colour };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const live = gesture.current;
    if (!live) return;
    const at = clampPixel(pixelAt(event), size);
    if (at.x === live.cursor.x && at.y === live.cursor.y) return;
    const from = live.cursor;
    live.cursor = at;

    if (live.kind === 'select') {
      marquee.current = clampRect(normalizeRect(live.anchor, at), size);
      repaint();
      return;
    }

    const ctx = context(preview.current);
    if (!ctx) return;

    if (live.kind === 'freehand') {
      live.points.push(at);
      if (tool === 'brush') {
        ctx.clearRect(0, 0, size.width, size.height);
        paintBrush(ctx, live.points, live.colour, prefs.brushSize, prefs.hardness);
      } else {
        paintPencil(ctx, from, at, live.colour, prefs.brushSize);
      }
      return;
    }

    // A shape is redrawn from its anchor on every move, so the preview shows
    // where it will land rather than a smear of every shape on the way there.
    clearPreview();
    const end = constrain(live.anchor, at, tool, event.shiftKey);
    if (tool === 'line') {
      paintLine(ctx, live.anchor, end, live.colour, prefs.brushSize);
      return;
    }
    paintShape(ctx, tool === 'ellipse' ? 'ellipse' : 'rectangle', normalizeRect(live.anchor, end), {
      style: prefs.shapeStyle,
      stroke: live.colour,
      fill: paper(),
      size: prefs.brushSize,
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const live = gesture.current;
    gesture.current = null;
    if (!live) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (live.kind === 'select') {
      const rect = marquee.current;
      marquee.current = null;
      onSelection(rect && !isEmptyRect(rect) ? rect : null);
      return;
    }

    const target = context(doc);
    const layer = preview.current;
    if (target && layer) {
      compositeStroke(target, layer, tool === 'eraser' ? 'erase' : 'draw', live.colour.a / 255);
    }
    clearPreview();
    onCommit();
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    const anchor = point(event.clientX - box.left, event.clientY - box.top);
    const from = liveView.current;
    liveView.current =
      event.ctrlKey || event.metaKey
        ? zoomTo(from, from.scale * WHEEL_ZOOM ** -event.deltaY, anchor, size, viewport, dpr)
        : panBy(from, -event.deltaX, -event.deltaY, size, viewport, dpr);
    paintStage();
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      onView(liveView.current);
    }, WHEEL_SETTLE_MS);
  };

  const backing = backingSize(viewport, dpr);

  return (
    // The surface is a pointer instrument. Every command it can perform is
    // also on the menubar, and the tools themselves are a keyboard-reachable
    // toolbar of buttons beside it.
    <div
      ref={host}
      data-testid="paint-surface"
      data-cursor={toolSpec(tool).cursor}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div
        ref={stage}
        style={{
          ...CHECKER,
          left: view.x,
          top: view.y,
          width: size.width * view.scale,
          height: size.height * view.scale,
        }}
        className={cx(
          'absolute origin-top-left border border-rule',
          view.scale >= 1 && '[image-rendering:pixelated]',
        )}
      >
        <canvas
          ref={preview}
          width={size.width}
          height={size.height}
          className="absolute inset-0 size-full"
        />
      </div>
      <canvas
        ref={overlay}
        aria-hidden
        width={backing.width}
        height={backing.height}
        className="pointer-events-none absolute inset-0 size-full"
      />
    </div>
  );
}

type Gesture =
  | { kind: 'select'; anchor: Point; cursor: Point }
  | { kind: 'freehand'; anchor: Point; cursor: Point; points: Point[]; colour: Rgba }
  | { kind: 'shape'; anchor: Point; cursor: Point; colour: Rgba };

/** Shift holds a line to 15° and a rectangle or an ellipse to a square. */
function constrain(anchor: Point, cursor: Point, tool: ToolId, shift: boolean): Point {
  if (!shift) return cursor;
  if (tool === 'line') return snapAngle(anchor, cursor);
  return isShapeTool(tool) ? squareOff(anchor, cursor) : cursor;
}
