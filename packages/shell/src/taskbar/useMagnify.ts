/**
 * Dock magnification: the icon under the pointer grows, its neighbours less
 * so, and the effect fades out a couple of icons away.
 *
 * The pointer moves at pointer rate, so nothing here goes through React. The
 * handler records a coordinate, a single animation frame writes a transform
 * on each glyph, and the layout box of every button stays exactly where it
 * was — only the glyph inside it scales, so no icon can push another aside.
 */

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { magnifyScale } from './logic';

/** How far the effect reaches, as a multiple of the icon pitch. */
const RANGE = 2.2;
/** Scale added under the pointer. A glyph is 0.62 of its button, so it fits. */
const AMOUNT = 0.45;

export interface Magnifier {
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerLeave: () => void;
}

interface Geometry {
  glyphs: HTMLElement[];
  centres: number[];
  pitch: number;
}

export function useMagnify(
  rowRef: RefObject<HTMLElement | null>,
  options: { enabled: boolean; vertical: boolean; size: number },
): Magnifier {
  const { enabled, vertical, size } = options;
  const geometry = useRef<Geometry | null>(null);
  const pointer = useRef(0);
  const frame = useRef(0);

  const paint = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const geo = geometry.current;
      if (!geo) return;
      // An app launching while the pointer rests on the bar changes what the
      // measurements describe; drop them and measure again on the next move.
      const live = rowRef.current?.querySelectorAll('[data-taskbar-icon]').length ?? 0;
      if (live !== geo.glyphs.length) {
        for (const glyph of geo.glyphs) glyph.style.transform = '';
        geometry.current = null;
        return;
      }
      geo.glyphs.forEach((glyph, i) => {
        const centre = geo.centres[i] ?? 0;
        const scale = magnifyScale(pointer.current - centre, geo.pitch * RANGE, AMOUNT);
        glyph.style.transform = scale > 1.001 ? `scale(${scale.toFixed(3)})` : '';
      });
    });
  }, [rowRef]);

  const clear = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    for (const glyph of geometry.current?.glyphs ?? []) glyph.style.transform = '';
    geometry.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) clear();
    return clear;
  }, [enabled, clear]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const row = rowRef.current;
      if (!enabled || !row) return;
      // A drag owns the buttons' transforms; two writers on one property is
      // one writer too many.
      if (row.querySelector('[data-dragging="true"]')) {
        clear();
        return;
      }
      pointer.current = vertical ? event.clientY : event.clientX;
      if (!geometry.current) {
        const buttons = [...row.querySelectorAll<HTMLElement>('[data-taskbar-icon]')];
        const glyphs: HTMLElement[] = [];
        const centres: number[] = [];
        for (const button of buttons) {
          const glyph = button.querySelector<HTMLElement>('[data-taskbar-glyph]');
          if (!glyph) continue;
          const r = button.getBoundingClientRect();
          glyphs.push(glyph);
          centres.push(vertical ? r.top + r.height / 2 : r.left + r.width / 2);
        }
        if (glyphs.length === 0) return;
        const first = centres[0] ?? 0;
        const last = centres[centres.length - 1] ?? 0;
        const pitch =
          centres.length > 1 ? Math.abs(last - first) / (centres.length - 1) : size || 1;
        geometry.current = { glyphs, centres, pitch: pitch || size || 1 };
      }
      paint();
    },
    [enabled, vertical, size, rowRef, paint, clear],
  );

  return { onPointerMove, onPointerLeave: clear };
}
