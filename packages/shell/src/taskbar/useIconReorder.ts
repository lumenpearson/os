/**
 * Reordering pinned icons by dragging them along the bar.
 *
 * While the pointer is down nothing is committed and nothing re-renders: the
 * dragged button and the icons it passes are moved by writing a transform in
 * one animation frame per pointer move. The drop is the only moment the
 * pinned list in Settings changes, so an abandoned drag leaves no trace.
 */

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { dropTarget, shiftFor } from './logic';

/** How far the pointer travels before a press becomes a drag, in px. */
const THRESHOLD = 4;

interface DragState {
  index: number;
  target: number;
  start: number;
  pointer: number;
  extent: number;
  buttons: HTMLElement[];
  moved: boolean;
}

export interface IconReorder {
  /** Goes on the element that holds the draggable buttons. */
  rowRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (index: number) => (event: ReactPointerEvent) => void;
  /** True once for the click that ends a drag, so it does not also activate. */
  consumeClick: () => boolean;
}

export interface IconReorderOptions {
  vertical: boolean;
  /** Icon pitch to fall back on when the row has not been laid out yet. */
  fallbackExtent: number;
  onDrop: (from: number, to: number) => void;
}

export function useIconReorder(options: IconReorderOptions): IconReorder {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const frame = useRef(0);
  const swallowClick = useRef(false);
  // The window listeners are registered once and live for the drag, so they
  // read what they need through this rather than closing over a render.
  const latest = useRef(options);
  latest.current = options;

  const paint = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const d = drag.current;
      if (!d) return;
      const axis = latest.current.vertical ? 'Y' : 'X';
      const delta = d.pointer - d.start;
      d.buttons.forEach((el, i) => {
        const offset = i === d.index ? delta : shiftFor(i, d.index, d.target, d.extent);
        el.style.transform = offset ? `translate${axis}(${Math.round(offset)}px)` : '';
      });
    });
  }, []);

  /** Ends the drag and hands back the state it ended in. */
  const finish = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const row = rowRef.current;
    if (row) delete row.dataset.dragging;
    if (!d) return null;
    for (const el of d.buttons) {
      el.style.transform = '';
      el.style.transition = '';
      el.style.zIndex = '';
    }
    return d;
  }, []);

  const onMove = useCallback(
    (event: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.pointer = latest.current.vertical ? event.clientY : event.clientX;
      const delta = d.pointer - d.start;
      if (!d.moved) {
        if (Math.abs(delta) < THRESHOLD) return;
        d.moved = true;
        const row = rowRef.current;
        if (row) row.dataset.dragging = 'true';
        d.buttons.forEach((el, i) => {
          // The dragged icon tracks the hand; the ones it displaces glide.
          el.style.transition =
            i === d.index ? 'none' : 'transform var(--duration-fast) var(--ease-standard)';
          if (i === d.index) el.style.zIndex = '2';
        });
      }
      d.target = dropTarget(d.index, delta, d.extent, d.buttons.length);
      paint();
    },
    [paint],
  );

  const onUp = useCallback(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const d = finish();
    if (!d?.moved) return;
    swallowClick.current = true;
    if (d.target !== d.index) latest.current.onDrop(d.index, d.target);
  }, [onMove, finish]);

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      finish();
    },
    [onMove, onUp, finish],
  );

  const onPointerDown = useCallback(
    (index: number) => (event: ReactPointerEvent) => {
      swallowClick.current = false;
      if (event.button !== 0) return;
      const row = rowRef.current;
      if (!row) return;
      const buttons = [...row.querySelectorAll<HTMLElement>('[data-taskbar-icon]')];
      if (buttons.length < 2) return;
      const vertical = latest.current.vertical;
      const rects = buttons.map((el) => el.getBoundingClientRect());
      const centre = (r: DOMRect) => (vertical ? r.top + r.height / 2 : r.left + r.width / 2);
      const first = rects[0];
      const last = rects[rects.length - 1];
      const span = first && last ? Math.abs(centre(last) - centre(first)) : 0;
      const extent = span > 0 ? span / (buttons.length - 1) : latest.current.fallbackExtent;
      const start = vertical ? event.clientY : event.clientX;
      drag.current = { index, target: index, start, pointer: start, extent, buttons, moved: false };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [onMove, onUp],
  );

  const consumeClick = useCallback(() => {
    const swallow = swallowClick.current;
    swallowClick.current = false;
    return swallow;
  }, []);

  return { rowRef, onPointerDown, consumeClick };
}
