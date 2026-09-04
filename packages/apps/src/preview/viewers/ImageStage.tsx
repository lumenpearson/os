import { cx, useElementSize, useLatest } from '@lumen/ui';
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  applyZoom,
  clampPan,
  displayedSize,
  fitView,
  panBy,
  type Size,
  transformCss,
  type View,
} from '../zoom';

export interface ImageStageProps {
  url: string;
  /** The file name: the picture's accessible name. */
  name: string;
  view: View;
  onViewChange: (view: View) => void;
  /** Intrinsic pixels, once the image has loaded. */
  content: Size | null;
  onContentSize: (size: Size) => void;
  onError: () => void;
  /** Checkerboard behind the picture, so transparency reads as transparency. */
  checkered?: boolean;
}

/** Pixels of overhang before the picture counts as pannable. */
const OVERFLOW_EPSILON = 0.5;

/** How long after the last wheel notch the zoom is written back to React. */
const SETTLE_MS = 120;

/** Arrow-key pan distance, in screen pixels. */
const PAN_STEP = 48;

/** Past this the pixels themselves are the subject; stop smoothing them. */
const PIXELATE_ABOVE = 4;

const EMPTY: Size = { width: 0, height: 0 };

/** Two neutral squares, the long-standing sign for "nothing is painted here". */
const CHECKERBOARD: CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(var(--lumen-surface-2) 0% 25%, var(--lumen-surface) 0% 50%)',
  backgroundSize: '16px 16px',
};

/**
 * The picture itself: fit, zoom towards the cursor, drag to pan.
 *
 * Pointer moves and wheel notches write the transform straight to the DOM
 * inside `requestAnimationFrame`; React hears about the new view once, when
 * the gesture ends. All of the geometry lives in `zoom.ts`.
 */
export function ImageStage({
  url,
  name,
  view,
  onViewChange,
  content,
  onContentSize,
  onError,
  checkered,
}: ImageStageProps) {
  const [stage, viewport] = useElementSize<HTMLDivElement>();
  const surface = useRef<HTMLDivElement>(null);
  const live = useRef<View>(view);
  const frame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: View } | null>(null);
  const box = content ?? EMPTY;
  const latest = useLatest({ box, viewport, onViewChange });

  const paint = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (surface.current) surface.current.style.transform = transformCss(live.current);
    });
  }, []);

  useLayoutEffect(() => {
    live.current = view;
    if (surface.current) surface.current.style.transform = transformCss(view);
  }, [view]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  // A window resize keeps a fitted picture fitted; a zoomed one stays put but
  // may need pulling back inside the new bounds.
  useEffect(() => {
    if (viewport.width === 0 || box.width === 0) return;
    if (view.fit) {
      const fitted = fitView(view, box, viewport);
      if (fitted.scale !== view.scale) onViewChange(fitted);
      return;
    }
    const pulled = clampPan(view, box, viewport);
    if (pulled.x !== view.x || pulled.y !== view.y) onViewChange({ ...view, ...pulled });
  }, [viewport, box, view, onViewChange]);

  const overflows = useCallback(
    (state: View) => {
      const shown = displayedSize(latest.current.box, state);
      const port = latest.current.viewport;
      return (
        shown.width - port.width > OVERFLOW_EPSILON || shown.height - port.height > OVERFLOW_EPSILON
      );
    },
    [latest],
  );

  // Wheel has to be a non-passive listener to keep the gesture off the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const lines = e.deltaMode === 1 ? 16 : 1;
      const factor = Math.exp(-e.deltaY * lines * 0.0015);
      const { box: size, viewport: port } = latest.current;
      live.current = applyZoom(live.current, live.current.scale * factor, anchor, size, port);
      paint();
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        settle.current = null;
        latest.current.onViewChange(live.current);
      }, SETTLE_MS);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stage, paint, latest]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !overflows(live.current)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: live.current };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held || held.id !== e.pointerId) return;
    const { box: size, viewport: port } = latest.current;
    live.current = panBy(held.from, e.clientX - held.x, e.clientY - held.y, size, port);
    paint();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    latest.current.onViewChange(live.current);
  };

  /** Arrows pan while the picture overflows; otherwise they step through files. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
    };
    const move = moves[e.key];
    if (!move || !overflows(view)) return;
    e.preventDefault();
    e.stopPropagation();
    onViewChange(panBy(view, move[0], move[1], box, viewport));
  };

  const grabbable = overflows(view);
  return (
    <div
      ref={stage}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage answers the arrow keys, so it has to be reachable by keyboard
      tabIndex={0}
      role="group"
      aria-label={`${name}. Drag or use the arrow keys to pan.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() =>
        onViewChange(
          view.fit ? { ...view, scale: 1, x: 0, y: 0, fit: false } : fitView(view, box, viewport),
        )
      }
      className={cx(
        'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-canvas',
        'lumen-focus focus-visible:-outline-offset-2',
        grabbable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div ref={surface} style={{ transform: transformCss(view) }}>
        <img
          src={url}
          alt={name}
          draggable={false}
          onLoad={(e) =>
            onContentSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          onError={onError}
          className="block max-w-none select-none"
          style={{
            ...(checkered ? CHECKERBOARD : null),
            ...(content ? { width: content.width, height: content.height } : null),
            imageRendering: view.scale >= PIXELATE_ABOVE ? 'pixelated' : undefined,
          }}
        />
      </div>
    </div>
  );
}
