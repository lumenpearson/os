/**
 * The number pad. Ten buttons that send the same two commands the keyboard
 * does, so a pointer can play the whole game and so can a keyboard.
 *
 * Each digit carries how many of it are still missing. That is counted off
 * the board, not decoration: it is the one number a player keeps in their
 * head, and a digit with none left has nothing to be clicked for.
 */

import { cx } from '@lumen/ui';
import { Eraser } from 'lucide-react';
import { DIGITS } from './grid';

export interface NumberPadProps {
  /** A row under the board, or a three-by-three block beside it. */
  layout: 'row' | 'block';
  /** Digits are pencilled in rather than written. */
  pencil: boolean;
  /** How many of each digit are still to be placed, indexed 1–9. */
  left: (digit: number) => number;
  disabled: boolean;
  /** Show the count under each digit; dropped when the buttons get narrow. */
  counts: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
}

export function NumberPad({
  layout,
  pencil,
  left,
  disabled,
  counts,
  onDigit,
  onErase,
}: NumberPadProps) {
  const block = layout === 'block';
  return (
    <div
      role="group"
      aria-label="Number pad"
      className={cx('flex gap-1', block ? 'flex-col' : 'flex-row')}
    >
      {/* deslop-ignore-next-line 28 — three by three is the shape of a number pad, not a card grid */}
      <div className={cx('grid gap-1', block ? 'grid-cols-3' : 'grid-flow-col auto-cols-fr grow')}>
        {DIGITS.map((digit) => {
          const remaining = left(digit);
          return (
            <button
              key={digit}
              type="button"
              disabled={disabled}
              onClick={() => onDigit(digit)}
              aria-label={`${pencil ? 'Pencil' : 'Write'} ${digit}`}
              className={cx(
                'mono flex h-11 min-w-0 flex-col items-center justify-center gap-0 rounded-sm border tabular-nums select-none lumen-focus',
                'transition-[background-color,border-color,color] duration-(--duration-fast) ease-(--ease-standard)',
                'disabled:pointer-events-none disabled:opacity-40',
                remaining === 0
                  ? 'border-rule bg-canvas text-ink-3'
                  : 'border-rule-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-3',
              )}
            >
              <span className={cx('text-md leading-none', pencil && 'text-ink-2')}>{digit}</span>
              {counts && <span className="text-2xs leading-none text-ink-3">{remaining}</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onErase}
        aria-label="Clear cell"
        className={cx(
          'flex items-center justify-center gap-1.5 rounded-sm border border-rule-strong bg-surface text-ink-2 select-none lumen-focus',
          'transition-[background-color,color] duration-(--duration-fast) ease-(--ease-standard)',
          'hover:bg-surface-2 hover:text-ink active:bg-surface-3',
          'disabled:pointer-events-none disabled:opacity-40',
          block ? 'h-8 w-full' : 'h-11 w-11 shrink-0',
        )}
      >
        <Eraser className="size-4" />
        {block && <span className="text-sm">Clear</span>}
      </button>
    </div>
  );
}
