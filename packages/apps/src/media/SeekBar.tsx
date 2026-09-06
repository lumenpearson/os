import { cx } from '@lumen/ui';
import { useEffect, useRef, useState } from 'react';
import { useMediaFrames } from './clock';
import { SEEK_STEP, SEEK_STEP_LARGE } from './keys';
import {
  clamp,
  clampTime,
  formatTimecode,
  isKnownDuration,
  progress,
  seekBy,
  timeAtFraction,
  UNKNOWN_TIME,
} from './time';

/** Buffered ranges drawn behind the played range; a browser rarely reports more. */
const BUFFER_SLOTS = 6;

export interface SeekBarProps {
  media: HTMLMediaElement | null;
  playing: boolean;
  /** Duration as React knows it, for the disabled state. NaN until metadata. */
  duration: number;
  /** Commit a new position, on pointer-up or a key. */
  onSeek: (time: number) => void;
  onToggle?: () => void;
  className?: string;
}

/**
 * The drag surface. Scrubbing writes the played width, the thumb and the
 * preview time straight to the DOM inside `requestAnimationFrame`; React only
 * hears about the new position when the pointer comes up, so a scrub costs no
 * renders and the media element is not seeked forty times a second.
 */
export function SeekBar({ media, playing, duration, onSeek, onToggle, className }: SeekBarProps) {
  const rail = useRef<HTMLDivElement>(null);
  const played = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const buffers = useRef<Array<HTMLDivElement | null>>([]);
  /** Position held by the pointer, 0–1, or null when not scrubbing. */
  const held = useRef<number | null>(null);
  const frame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const seekable = isKnownDuration(duration);

  const paint = (el: HTMLMediaElement) => {
    const known = isKnownDuration(el.duration);
    const at = held.current;
    const fraction = at ?? progress(el.currentTime, el.duration);
    const time = at === null ? el.currentTime : at * el.duration;
    const percent = `${(fraction * 100).toFixed(3)}%`;
    if (played.current) played.current.style.width = percent;
    if (thumb.current) thumb.current.style.left = percent;
    if (elapsed.current) elapsed.current.textContent = formatTimecode(time);
    if (total.current)
      total.current.textContent = known ? formatTimecode(el.duration) : UNKNOWN_TIME;
    if (bubble.current) {
      bubble.current.style.left = percent;
      bubble.current.textContent = known ? formatTimecode(time) : UNKNOWN_TIME;
    }
    if (rail.current) {
      rail.current.setAttribute('aria-valuemax', known ? String(Math.round(el.duration)) : '0');
      rail.current.setAttribute('aria-valuenow', known ? String(Math.round(time)) : '0');
      rail.current.setAttribute(
        'aria-valuetext',
        known ? `${formatTimecode(time)} of ${formatTimecode(el.duration)}` : 'Position unknown',
      );
    }
    const ranges = el.buffered;
    for (let i = 0; i < BUFFER_SLOTS; i++) {
      const node = buffers.current[i];
      if (!node) continue;
      if (!known || i >= ranges.length) {
        node.style.display = 'none';
        continue;
      }
      const start = clamp(ranges.start(i) / el.duration, 0, 1);
      const end = clamp(ranges.end(i) / el.duration, 0, 1);
      node.style.display = end > start ? 'block' : 'none';
      node.style.left = `${(start * 100).toFixed(3)}%`;
      node.style.width = `${((end - start) * 100).toFixed(3)}%`;
    }
  };

  // While the pointer is down the element's own events are ignored: the drag
  // owns the bar until it is released.
  useMediaFrames(media, playing && !dragging, paint);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const schedule = () => {
    if (frame.current || !media) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (media) paint(media);
    });
  };

  const fractionAt = (clientX: number): number => {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 0;
    return clamp((clientX - box.left) / box.width, 0, 1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !media || !seekable) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    target.focus();
    held.current = fractionAt(event.clientX);
    setDragging(true);
    schedule();

    const detach = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onCancel);
      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      held.current = null;
      setDragging(false);
    };
    const onMove = (moved: PointerEvent) => {
      held.current = fractionAt(moved.clientX);
      schedule();
    };
    const onUp = (up: PointerEvent) => {
      const fraction = fractionAt(up.clientX);
      detach();
      onSeek(timeAtFraction(fraction, media.duration));
      paint(media);
    };
    const onCancel = () => {
      detach();
      paint(media);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onCancel);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!media) return;
    const step = event.shiftKey ? SEEK_STEP_LARGE : SEEK_STEP;
    const at = media.currentTime;
    const span = media.duration;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onSeek(seekBy(at, -step, span));
        break;
      case 'ArrowRight':
        event.preventDefault();
        onSeek(seekBy(at, step, span));
        break;
      case 'PageDown':
        event.preventDefault();
        onSeek(seekBy(at, -SEEK_STEP_LARGE, span));
        break;
      case 'PageUp':
        event.preventDefault();
        onSeek(seekBy(at, SEEK_STEP_LARGE, span));
        break;
      case 'Home':
        event.preventDefault();
        onSeek(0);
        break;
      case 'End':
        event.preventDefault();
        onSeek(clampTime(span, span));
        break;
      case ' ':
        if (onToggle) {
          event.preventDefault();
          onToggle();
        }
        break;
    }
  };

  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span ref={elapsed} className="mono w-11 shrink-0 text-right text-xs text-ink-2 tabular-nums">
        {UNKNOWN_TIME}
      </span>
      <div className="relative flex h-4 min-w-0 flex-1 items-center">
        <div
          ref={rail}
          role="slider"
          tabIndex={0}
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={0}
          aria-valuenow={0}
          aria-disabled={!seekable}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className={cx(
            'relative h-4 w-full rounded-sm lumen-focus',
            seekable ? 'cursor-pointer' : 'cursor-default opacity-50',
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-xs bg-surface-3">
            {Array.from({ length: BUFFER_SLOTS }, (_, i) => (
              <div
                key={`buffer-${i}`}
                ref={(node) => {
                  buffers.current[i] = node;
                }}
                className="absolute inset-y-0 hidden bg-rule-strong"
              />
            ))}
            <div ref={played} className="absolute inset-y-0 left-0 w-0 bg-accent" />
          </div>
          <div
            ref={thumb}
            className={cx(
              'pointer-events-none absolute top-1/2 left-0 size-3 -translate-x-1/2 -translate-y-1/2',
              // A round thumb is what every platform slider draws; a square one
              // reads as a broken control. deslop-ignore-next-line 19
              'rounded-full border border-rule-strong bg-surface shadow-sm',
            )}
          />
        </div>
        <div
          ref={bubble}
          aria-hidden
          className={cx(
            'mono pointer-events-none absolute bottom-full left-0 mb-1 -translate-x-1/2 rounded-sm',
            'border border-rule bg-surface px-1.5 py-0.5 text-xs text-ink shadow-sm tabular-nums',
            !dragging && 'hidden',
          )}
        >
          {UNKNOWN_TIME}
        </div>
      </div>
      <span ref={total} className="mono w-11 shrink-0 text-xs text-ink-2 tabular-nums">
        {UNKNOWN_TIME}
      </span>
    </div>
  );
}
