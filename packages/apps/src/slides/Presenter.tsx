import { cx, IconButton, useElementSize } from '@lumen/ui';
import { ChevronLeft, ChevronRight, StickyNote, X } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type Deck, fitScale } from './deck';
import { SlideCanvas } from './SlideCanvas';

/** The chrome fades this long after the last slide change or pointer move. */
const IDLE_MS = 2000;
/** Scale of the "next slide" preview in the presenter strip. */
const NEXT_SCALE = 0.16;

export interface PresenterProps {
  deck: Deck;
  index: number;
  onIndex: (index: number) => void;
  onExit: () => void;
}

/**
 * The player: one slide on a black stage, letterboxed. Arrow keys, Space and
 * Page keys move; N shows the presenter strip with the notes and what is next;
 * Escape hands the window back.
 */
export function Presenter({ deck, index, onIndex, onExit }: PresenterProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [strip, setStrip] = useState(false);
  const [chrome, setChrome] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = deck.slides.length;
  const slide = deck.slides[index];
  const next = deck.slides[index + 1];
  const theme = deck.theme ?? 'light';

  const wake = useCallback(() => {
    setChrome(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setChrome(false), IDLE_MS);
  }, []);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, []);

  // Each new slide brings the chrome back for a moment, then it fades again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the slide index is the trigger
  useEffect(() => {
    wake();
  }, [wake, index]);

  const go = useCallback(
    (to: number) => onIndex(Math.max(0, Math.min(count - 1, to))),
    [onIndex, count],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    // A focused control handles Space and Enter itself; do not advance twice.
    const onControl = target instanceof HTMLElement && target.tagName === 'BUTTON';
    switch (event.key) {
      case ' ':
      case 'Enter':
        if (onControl) return;
        event.preventDefault();
        go(index + 1);
        break;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        go(index + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        go(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(count - 1);
        break;
      case 'Escape':
        event.preventDefault();
        onExit();
        break;
      case 'n':
      case 'N':
        event.preventDefault();
        setStrip((open) => !open);
        break;
      default:
        wake();
        return;
    }
    wake();
  };

  const fade = cx(
    'transition-opacity duration-(--duration-slow) ease-(--ease-standard)',
    chrome ? 'opacity-100' : 'pointer-events-none opacity-0',
  );

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      aria-label={`Presenting slide ${index + 1} of ${count}`}
      className="absolute inset-0 z-20 flex flex-col bg-black outline-none"
    >
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        {slide && (
          <SlideCanvas
            slide={slide}
            theme={theme}
            framed={false}
            scale={fitScale(stage, { minWidth: 0, maxScale: 8 })}
          />
        )}
        <div className={cx('absolute right-4 bottom-3 flex items-center gap-3', fade)}>
          <span className="mono text-sm text-white/60 tabular-nums">
            {index + 1} / {count}
          </span>
        </div>
        <div
          className={cx(
            'absolute bottom-3 left-4 flex items-center gap-0.5 rounded-md border border-rule bg-surface p-0.5 shadow-sm',
            fade,
          )}
        >
          <IconButton
            label="Previous slide"
            size="sm"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next slide"
            size="sm"
            disabled={index >= count - 1}
            onClick={() => go(index + 1)}
          >
            <ChevronRight />
          </IconButton>
          <IconButton
            label="Presenter notes"
            size="sm"
            active={strip}
            onClick={() => setStrip((open) => !open)}
          >
            <StickyNote />
          </IconButton>
          <IconButton label="Exit presentation" size="sm" onClick={onExit}>
            <X />
          </IconButton>
        </div>
      </div>

      {strip && (
        <div className="flex h-40 shrink-0 gap-6 border-t border-rule bg-surface p-3">
          <div className="lumen-scroll flex min-w-0 flex-1 flex-col gap-1">
            <span className="mono text-xs text-ink-3">Notes</span>
            <p className="whitespace-pre-wrap text-base text-ink">
              {slide?.notes?.trim() ? slide.notes : 'No notes on this slide.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="mono text-xs text-ink-3">Next</span>
            {next ? (
              <SlideCanvas slide={next} theme={theme} scale={NEXT_SCALE} />
            ) : (
              <span className="text-sm text-ink-3">End of deck</span>
            )}
          </div>
        </div>
      )}

      <div className="h-px w-full shrink-0">
        <div
          className="h-px bg-accent transition-[width] duration-(--duration-base) ease-(--ease-standard)"
          style={{ width: `${count > 0 ? ((index + 1) / count) * 100 : 0}%` }}
        />
      </div>
    </section>
  );
}
