// deslop-ignore-file 19 — a slider track and its thumb are round on every
// platform that ships one; a squared-off thumb reads as a broken control.
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '../cx';

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show the value in mono next to the track. */
  showValue?: boolean | ((v: number) => string);
}

/**
 * Does the caller say how wide this is?
 *
 * `cx` concatenates class names; it does not resolve conflicts between them.
 * So a caller's `w-32` and this component's `w-full` both landed in the list
 * and the stylesheet decided — `w-full` won, and six callers across Paint,
 * Preview and Media Player were sizing a slider that ignored them. Media
 * Player's took the full width of its row and pushed the playlist and
 * full-screen buttons 385 px past the window edge.
 *
 * So the component yields: it fills its box only when nobody said otherwise.
 */
function callerSizedIt(className: string | undefined): boolean {
  return /(?:^|\s)(?:w-|min-w-|max-w-|size-|basis-|flex-1|flex-auto)/.test(className ?? '');
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { value, onChange, min = 0, max = 100, step = 1, showValue, className, ...rest },
  ref,
) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-3',
        !callerSizedIt(className) && 'w-full',
        className,
      )}
    >
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
        className={cx(
          'h-4 w-full cursor-pointer appearance-none bg-transparent lumen-focus rounded-full',
          '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full',
          '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--lumen-accent)_var(--pct),var(--lumen-surface-3)_var(--pct))]',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[6px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-rule-strong [&::-webkit-slider-thumb]:shadow-sm',
          '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-3',
          '[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-accent',
          '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-rule-strong',
        )}
        {...rest}
      />
      {showValue && (
        <span className="mono w-10 shrink-0 text-right text-sm text-ink-2 tabular-nums">
          {typeof showValue === 'function' ? showValue(value) : value}
        </span>
      )}
    </span>
  );
});
