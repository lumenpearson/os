// deslop-ignore-file 24 — the SVG here is a clock face: the dial ring, the
// tick marks and the centre pin. Drawing a watch dial is what this file is
// for, and circles are the shape a dial has.
/**
 * The analogue face. The hands are placed by `rotate(angle 50 50)` written to
 * the SVG on every frame — the angle comes from the instant itself, including
 * its sub-second part, so the second hand sweeps as a reading of the clock and
 * cannot drift away from the digits the way a CSS animation would.
 */

import { type CSSProperties, useRef } from 'react';
import { useFrames } from './frames';
import { handAngles } from './zones';

/** Twelve marks; the quarters are drawn longer. */
const MARKS = Array.from({ length: 12 }, (_, index) => ({
  angle: index * 30,
  quarter: index % 3 === 0,
}));

export interface AnalogueFaceProps {
  timeZone: string;
  className?: string;
  style?: CSSProperties;
  /** Stop the sweep (a window that is not showing the clock). */
  active?: boolean;
}

export function AnalogueFace({ timeZone, className, style, active = true }: AnalogueFaceProps) {
  const hours = useRef<SVGLineElement>(null);
  const minutes = useRef<SVGLineElement>(null);
  const seconds = useRef<SVGLineElement>(null);
  const initial = handAngles(timeZone, Date.now());

  useFrames(active, () => {
    const angles = handAngles(timeZone, Date.now());
    hours.current?.setAttribute('transform', `rotate(${angles.hours} 50 50)`);
    minutes.current?.setAttribute('transform', `rotate(${angles.minutes} 50 50)`);
    seconds.current?.setAttribute('transform', `rotate(${angles.seconds} 50 50)`);
  });

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-hidden
      // The face is a circle and the hands are lines: this is the drawing
      // itself, not an icon standing in for one.
      // deslop-ignore-next-line 24
      fill="none"
    >
      <circle cx="50" cy="50" r="47" className="stroke-rule-strong" strokeWidth="1" />
      {MARKS.map((mark) => (
        <line
          key={mark.angle}
          x1="50"
          y1={mark.quarter ? 8 : 10}
          x2="50"
          y2="14"
          className={mark.quarter ? 'stroke-ink-2' : 'stroke-ink-3'}
          strokeWidth={mark.quarter ? 2 : 1}
          strokeLinecap="round"
          transform={`rotate(${mark.angle} 50 50)`}
        />
      ))}
      <line
        ref={hours}
        x1="50"
        y1="52"
        x2="50"
        y2="28"
        className="stroke-ink"
        strokeWidth="4"
        strokeLinecap="round"
        transform={`rotate(${initial.hours} 50 50)`}
      />
      <line
        ref={minutes}
        x1="50"
        y1="54"
        x2="50"
        y2="16"
        className="stroke-ink"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${initial.minutes} 50 50)`}
      />
      <line
        ref={seconds}
        x1="50"
        y1="60"
        x2="50"
        y2="13"
        className="stroke-accent"
        strokeWidth="1"
        strokeLinecap="round"
        transform={`rotate(${initial.seconds} 50 50)`}
      />
      <circle cx="50" cy="50" r="2.5" className="fill-ink" />
      <circle cx="50" cy="50" r="1" className="fill-surface" />
    </svg>
  );
}
