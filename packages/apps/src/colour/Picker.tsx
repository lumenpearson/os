/**
 * The picker: a saturation/value field with a hue strip and an alpha strip.
 *
 * The field is the one thing here that moves at pointer rate. A pointer move
 * only records where the pointer is; a frame later the handler writes the
 * thumb's position straight to the element through a ref and commits the
 * colour once. So React sees at most one update per frame, and the thumb stays
 * glued to the pointer even when it sees more than that.
 *
 * HSV, not RGB, is what the field holds. Dragging value down to black and back
 * up has to return the hue it started from, and a colour that has been through
 * RGB no longer remembers one.
 */

import { useLatest } from '@lumen/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  clampUnit,
  type Hsv,
  hsvToRgb,
  type Rgba,
  rgbToHsv,
  withAlpha,
  wrapHue,
} from '../paint/colour';
import { ChannelSlider } from './ChannelSlider';
import { cssOpaque, cssRgba } from './model';
import { Swatch } from './Swatch';

/*
 * White across and black down: the two axes of the field. The gradient here is
 * the data — it is the colour space — rather than atmosphere behind it.
 */
// deslop-ignore-next-line 06
const VALUE_AXIS = 'linear-gradient(to top, rgb(0 0 0), rgb(0 0 0 / 0))';
const SATURATION_AXIS = 'linear-gradient(to right, rgb(255 255 255), rgb(255 255 255 / 0))';

const HUE_TRACK = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((hue) => `hsl(${hue} 100% 50%)`)
  .join(', ')})`;

/** How far one arrow key moves across the field, and one with Shift held. */
const STEP = 0.01;
const BIG_STEP = 0.1;

function sameRgb(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export interface PickerProps {
  colour: Rgba;
  /** From the measured window; the field is a third of its height. */
  fieldHeight: number;
  onChange: (colour: Rgba) => void;
}

export function Picker({ colour, fieldHeight, onChange }: PickerProps) {
  const fieldRef = useRef<HTMLButtonElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const frame = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const labelId = useId();

  /**
   * `rgb` records the colour this component last produced. When the prop
   * differs from it the colour came from somewhere else — a notation field, a
   * swatch, the clipboard — and the HSV has to be taken from it afresh.
   */
  const [held, setHeld] = useState(() => ({ hsv: rgbToHsv(colour), rgb: colour }));
  if (!sameRgb(held.rgb, colour)) setHeld({ hsv: rgbToHsv(colour), rgb: colour });
  const hsv = held.hsv;
  const latest = useLatest({ hsv, alpha: colour.a });

  const commit = useCallback(
    (next: Hsv) => {
      const rgb = hsvToRgb(next, latest.current.alpha);
      setHeld({ hsv: next, rgb });
      onChange(rgb);
    },
    [latest, onChange],
  );

  /** The only DOM write on the drag path. */
  const paintThumb = useCallback((next: Hsv) => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    thumb.style.left = `${next.s * 100}%`;
    thumb.style.top = `${(1 - next.v) * 100}%`;
  }, []);

  const flush = useCallback(() => {
    frame.current = 0;
    const point = pointer.current;
    const field = fieldRef.current;
    if (!point || !field) return;
    const rect = field.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const next: Hsv = {
      h: latest.current.hsv.h,
      s: clampUnit((point.x - rect.left) / rect.width),
      v: clampUnit(1 - (point.y - rect.top) / rect.height),
    };
    paintThumb(next);
    commit(next);
  }, [commit, latest, paintThumb]);

  const track = useCallback(
    (event: { clientX: number; clientY: number }) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (frame.current) return;
      frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const nudge = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next: Hsv = {
      h: hsv.h,
      s: clampUnit(hsv.s + move[0]),
      v: clampUnit(hsv.v + move[1]),
    };
    paintThumb(next);
    commit(next);
  };

  const pure = hsvToRgb({ h: hsv.h, s: 1, v: 1 });
  const opaque = { ...colour, a: 255 };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-3">
        <button
          ref={fieldRef}
          type="button"
          aria-labelledby={labelId}
          className="relative block min-w-0 flex-1 cursor-crosshair overflow-hidden rounded-sm hairline lumen-focus"
          style={{ height: fieldHeight, background: cssOpaque(pure) }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            track(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) track(event);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onKeyDown={nudge}
        >
          <span aria-hidden className="absolute inset-0" style={{ background: SATURATION_AXIS }} />
          <span aria-hidden className="absolute inset-0" style={{ background: VALUE_AXIS }} />
          <span
            ref={thumbRef}
            aria-hidden
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-white"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              boxShadow: '0 0 0 1px rgb(0 0 0 / 0.45)',
            }}
          />
        </button>
        {/* The colour at size, so a low alpha is obvious rather than deduced. */}
        <Swatch colour={colour} className="w-14 shrink-0" style={{ height: fieldHeight }} />
      </div>

      <span id={labelId} className="sr-only">
        Saturation and brightness. Arrow keys adjust; hold Shift for larger steps.
      </span>

      <ChannelSlider
        label="Hue"
        value={Math.round(hsv.h)}
        max={360}
        track={HUE_TRACK}
        format={(value) => `${value}°`}
        onChange={(value) => commit({ ...hsv, h: wrapHue(value) })}
      />
      <ChannelSlider
        label="Alpha"
        value={colour.a}
        max={255}
        chequer
        track={`linear-gradient(to right, ${cssRgba(withAlpha(opaque, 0))}, ${cssOpaque(opaque)})`}
        format={(value) => `${Math.round((value / 255) * 100)}%`}
        onChange={(value) => onChange(withAlpha(colour, value))}
      />
    </div>
  );
}
