import { type RefObject, useRef } from 'react';
import { type IconBox, marqueeRect, type Point, sameSelection, touchesBox } from './marquee';

/** How far the pointer must travel before a press becomes a drag, in px. */
export const DRAG_THRESHOLD = 4;

export interface MarqueeOptions {
  /** The layer the drag is measured in; also what captures the pointer. */
  layer: RefObject<HTMLElement | null>;
  /** The rectangle drawn. Hidden until the pointer has actually travelled. */
  band: RefObject<HTMLElement | null>;
  /** The boxes to test, in the layer's coordinates, measured once per drag. */
  boxes: () => IconBox[];
  /** What is selected as the drag starts. */
  current: () => ReadonlySet<string>;
  /** Called with each new set, at most once a frame. */
  onChange: (keys: ReadonlySet<string>) => void;
}

export interface Marquee {
  /** Attach to the layer's `onPointerDown`. */
  start: (e: {
    button: number;
    clientX: number;
    clientY: number;
    pointerId: number;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }) => void;
  /** Abandon a drag in progress and put the selection back, if one is running. */
  cancel: () => void;
}

/**
 * Dragging a rectangle over things to select them.
 *
 * The rectangle is written straight to its element inside the animation frame
 * that computes it, so a drag across a full window costs no React renders of
 * its own; only a change of selection reaches the caller. A press that never
 * travels `DRAG_THRESHOLD` stays a click, which is what makes "press empty
 * space to clear the selection" and "drag to select" the same gesture.
 *
 * Escape puts back what was selected before the drag, and so does a pointer
 * the host takes away.
 */
export function useMarquee({ layer, band, boxes, current, onChange }: MarqueeOptions): Marquee {
  const abort = useRef<(() => void) | null>(null);

  const start: Marquee['start'] = (e) => {
    const root = layer.current;
    if (!root || e.button !== 0) return;

    // Shift and Meta/Ctrl add to what is already selected; a plain press replaces it.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const before = current();
    const base = additive ? before : new Set<string>();
    if (!additive) onChange(base);

    const origin = root.getBoundingClientRect();
    const measured = boxes();
    const from: Point = { x: e.clientX - origin.left, y: e.clientY - origin.top };
    const pointerId = e.pointerId;
    let to = from;
    let applied: ReadonlySet<string> = base;
    let moved = false;
    let raf = 0;

    const draw = () => {
      raf = 0;
      const rect = marqueeRect(from, to);
      const el = band.current;
      if (el) {
        el.hidden = false;
        el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
      }
      const next = new Set(base);
      for (const item of measured) if (touchesBox(rect, item.box)) next.add(item.path);
      if (sameSelection(next, applied)) return;
      applied = next;
      onChange(next);
    };

    const onMove = (ev: PointerEvent) => {
      to = { x: ev.clientX - origin.left, y: ev.clientY - origin.top };
      if (!moved && Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < DRAG_THRESHOLD) return;
      moved = true;
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKeyDown);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
      const el = band.current;
      if (el) el.hidden = true;
      abort.current = null;
    };

    const cancel = () => {
      stop();
      onChange(before);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      cancel();
    };

    // Captured so the release still arrives when the pointer leaves the window.
    root.setPointerCapture(pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKeyDown);
    abort.current = cancel;
  };

  return { start, cancel: () => abort.current?.() };
}

/**
 * The boxes of everything inside the layer carrying the given attribute, in
 * the layer's own coordinates. Measured once when a drag starts: reading them
 * per frame would be a layout on every move.
 *
 * The attribute is one argument rather than a selector and a name, because two
 * of those can disagree — and a mismatch shows up as a rectangle that selects
 * nothing at all.
 */
export function boxesByPath(root: HTMLElement, attribute = 'data-path'): IconBox[] {
  const origin = root.getBoundingClientRect();
  const boxes: IconBox[] = [];
  for (const node of root.querySelectorAll(`[${attribute}]`)) {
    const path = node.getAttribute(attribute);
    if (path === null || path === '') continue;
    const box = node.getBoundingClientRect();
    boxes.push({
      path,
      box: {
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: box.width,
        height: box.height,
      },
    });
  }
  return boxes;
}
