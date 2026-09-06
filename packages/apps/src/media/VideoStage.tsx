import { cx } from '@lumen/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/** Idle time before the controls withdraw, while something is playing. */
const IDLE_MS = 2500;

export interface VideoStageProps {
  /** False for audio: the element stays mounted and silent-visible so the
   *  audio graph keeps its one source node. */
  active: boolean;
  playing: boolean;
  /** What is playing, shown with the controls. */
  caption?: ReactNode;
  /** The transport, shown over the picture. */
  controls: ReactNode;
  /** The media element itself. It never moves in the tree. */
  children: ReactNode;
  onPointerActivate?: () => void;
}

/**
 * The picture on a letterboxed backdrop, with controls that withdraw while a
 * film is running and come back on movement or focus. They never withdraw
 * from under the keyboard: if focus is inside them the timer starts again.
 */
export function VideoStage({
  active,
  playing,
  caption,
  controls,
  children,
  onPointerActivate,
}: VideoStageProps) {
  const overlay = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(true);
  /** Mirrors `visible` so a pointer moving at 120 Hz sets state at most once. */
  const shown = useRef(true);
  const running = active && playing;

  const show = useCallback(() => {
    if (!shown.current) {
      shown.current = true;
      setVisible(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!running) return;
    const hide = () => {
      if (overlay.current?.contains(document.activeElement)) {
        timer.current = setTimeout(hide, IDLE_MS);
        return;
      }
      timer.current = null;
      shown.current = false;
      setVisible(false);
    };
    timer.current = setTimeout(hide, IDLE_MS);
  }, [running]);

  // A new `show` means playing or active changed: the controls come back and,
  // if something is running, the timer starts again.
  useEffect(() => {
    show();
  }, [show]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div
      onPointerMove={show}
      onPointerDown={() => {
        onPointerActivate?.();
        show();
      }}
      onFocus={show}
      onBlur={show}
      className={cx(
        'relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-canvas',
        !active && 'hidden',
        active && !visible && 'cursor-none',
      )}
    >
      {children}
      {active && (
        <div
          ref={overlay}
          className={cx(
            'absolute inset-x-0 bottom-0 flex flex-col gap-1 border-t border-rule bg-surface px-3 py-2',
            'transition-opacity duration-(--duration-base) ease-(--ease-standard)',
            visible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {caption}
          {controls}
        </div>
      )}
    </div>
  );
}
