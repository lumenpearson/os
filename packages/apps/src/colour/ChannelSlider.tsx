/**
 * A range input over a track the app paints itself.
 *
 * The Slider atom is the right control everywhere its own accent track is the
 * point. Here the track carries information — the hue wheel, the colour fading
 * to nothing — so this one draws the strip behind a native range input and
 * keeps the input's keyboard behaviour, which is the part that matters.
 */

import { cx } from '@lumen/ui';
import { useId } from 'react';

/** The chequer under the alpha strip, matching the swatches. */
const CHEQUER =
  'repeating-conic-gradient(var(--color-surface-2) 0% 25%, var(--color-surface) 0% 50%)';

export interface ChannelSliderProps {
  label: string;
  value: number;
  max: number;
  min?: number;
  step?: number;
  /** CSS background for the strip behind the thumb. */
  track: string;
  /** Lay the strip over a chequerboard (alpha). */
  chequer?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export function ChannelSlider({
  label,
  value,
  max,
  min = 0,
  step = 1,
  track,
  chequer,
  format,
  onChange,
}: ChannelSliderProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-10 shrink-0 text-sm text-ink-2">
        {label}
      </label>
      <span className="relative flex min-w-0 flex-1 items-center">
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-xs hairline"
          style={
            chequer
              ? { backgroundImage: `${track}, ${CHEQUER}`, backgroundSize: 'auto, 8px 8px' }
              : { background: track }
          }
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cx(
            'relative h-4 w-full cursor-pointer appearance-none bg-transparent rounded-xs lumen-focus',
            '[&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[3px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-2.5',
            '[&::-webkit-slider-thumb]:rounded-xs [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-rule-strong [&::-webkit-slider-thumb]:shadow-sm',
            '[&::-moz-range-track]:h-2.5 [&::-moz-range-track]:bg-transparent',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-xs',
            '[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-rule-strong',
          )}
        />
      </span>
      <span className="mono w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">
        {format(value)}
      </span>
    </div>
  );
}
