import { useSetting } from '@lumen/kernel/react';
import { useEffect, useRef } from 'react';
import { formatHeap, heapBytes, SAMPLE_MS, sampleFrames } from './frames';

/**
 * A small readout of how the interface is actually running: frames per
 * second, the longest frame in the last half second, and the heap where the
 * host reports one.
 *
 * It writes to the DOM through refs inside the animation callback it is
 * already using to count. Rendering these figures through React would put a
 * component update on every frame and make the overlay part of what it is
 * supposed to be measuring.
 */
export function PerformanceOverlay() {
  const [display] = useSetting('display');
  const shown = display.performanceOverlay;
  // Two of these are <dd> and one a <span>, so the common element type is
  // what they share.
  const fps = useRef<HTMLElement>(null);
  const worst = useRef<HTMLElement>(null);
  const heap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    let times: number[] = [];
    let windowStart = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      times.push(now);
      if (windowStart === 0) windowStart = now;
      if (now - windowStart < SAMPLE_MS) return;

      const sample = sampleFrames(times, heapBytes());
      times = [now];
      windowStart = now;
      if (sample === null) return;
      if (fps.current) fps.current.textContent = String(sample.fps);
      if (worst.current) worst.current.textContent = sample.worst.toFixed(1);
      if (heap.current) heap.current.textContent = formatHeap(sample.heap);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      // Above the windows and out of the way of the pointer: it is a readout,
      // not a control, and it must never take a click meant for the desktop.
      className="pointer-events-none fixed bottom-2 left-2 z-[1500] select-none"
      data-testid="performance-overlay"
      role="status"
      aria-label="Performance"
    >
      <dl className="mono flex items-baseline gap-3 rounded-sm border border-rule bg-surface/90 px-2 py-1 text-2xs text-ink-2 tabular-nums">
        <div className="flex items-baseline gap-1">
          <dt className="text-ink-3">fps</dt>
          <dd ref={fps} className="text-ink">
            —
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-ink-3">worst</dt>
          <dd>
            <span ref={worst}>—</span> ms
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-ink-3">heap</dt>
          <dd ref={heap}>—</dd>
        </div>
      </dl>
    </div>
  );
}
