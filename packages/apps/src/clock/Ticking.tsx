/**
 * A reading that changes many times a second. React renders it once; after
 * that every frame writes straight to the text node through a ref, and only
 * when the string is not the one already on screen. No state, no re-render,
 * no reconciliation between the eye and the clock.
 */

import { cx } from '@lumen/ui';
import { type CSSProperties, useRef } from 'react';
import { useFrames } from './frames';

export interface TickingProps {
  /** Reads the clock and returns what should be on screen now. */
  read: () => string;
  /** Stop looking (a paused stopwatch keeps its last reading). */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Ticking({ read, active = true, className, style, title }: TickingProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef('');
  const latest = useRef(read);
  latest.current = read;

  useFrames(active, () => {
    const text = latest.current();
    if (text === shown.current) return;
    shown.current = text;
    if (ref.current) ref.current.textContent = text;
  });

  // The value at render time is also the value React will diff against; the
  // frames above own the node from here on.
  shown.current = read();
  return (
    <span ref={ref} className={cx('tabular-nums', className)} style={style} title={title}>
      {shown.current}
    </span>
  );
}
