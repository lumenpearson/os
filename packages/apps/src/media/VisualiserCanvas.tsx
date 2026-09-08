import { events } from '@lumen/kernel';
import { cx, useElementSize } from '@lumen/ui';
import { useEffect, useRef } from 'react';
import { barCountFor, barHeight, decayBars, groupBands, isSilent, smoothBars } from './visualiser';

/** Gap between bars, in CSS pixels. */
const GAP = 3;

export interface VisualiserProps {
  /** Null until the audio graph is built; the bars then rest at silence. */
  analyser: AnalyserNode | null;
  /** True while sound is coming out; false lets the bars fall and the loop stop. */
  active: boolean;
  className?: string;
}

/**
 * Bars driven by a real `AnalyserNode`. When there is no analyser the bars sit
 * at their resting hairline instead of inventing movement, and the loop stops
 * as soon as they have settled or the document is hidden.
 */
export function Visualiser({ analyser, active, className }: VisualiserProps) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>([]);
  const frame = useRef(0);
  const tint = useRef('#8b8f98');
  const { width, height } = size;

  // The bars follow the theme's neutral ink; read it from the canvas itself so
  // a theme change repaints in the new ramp.
  useEffect(() => {
    const read = () => {
      const node = canvas.current;
      if (node) tint.current = getComputedStyle(node).color || tint.current;
    };
    read();
    return events.on('theme:change', read);
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!node || width <= 0 || height <= 0) return;
    const context = node.getContext('2d');
    if (!context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    node.width = Math.round(width * ratio);
    node.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const bars = barCountFor(width);
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const slot = width / bars;
    const thickness = Math.max(1, slot - GAP);

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = tint.current;
      for (let i = 0; i < bars; i++) {
        const drawn = barHeight(levels.current[i] ?? 0, height);
        context.fillRect(i * slot + (slot - thickness) / 2, height - drawn, thickness, drawn);
      }
    };

    const step = () => {
      frame.current = 0;
      if (analyser && bins && active) {
        analyser.getByteFrequencyData(bins);
        levels.current = smoothBars(levels.current, groupBands(bins, bars));
      } else {
        levels.current = decayBars(levels.current);
      }
      draw();
      if (!active && isSilent(levels.current)) return;
      frame.current = requestAnimationFrame(step);
    };
    const start = () => {
      if (!frame.current && !document.hidden) frame.current = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    draw();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [analyser, active, width, height]);

  return (
    <div ref={box} className={cx('h-16 shrink-0 px-4 pb-3', className)}>
      <canvas ref={canvas} aria-hidden className="h-full w-full text-ink-3" />
    </div>
  );
}
