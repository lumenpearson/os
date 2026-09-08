import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from '../cx';

export interface RowActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Stop, Quit, Remove: reads in the danger colour once the pointer is on it. */
  danger?: boolean;
}

/**
 * An action that lives inside a table row.
 *
 * A full button is right when there is one of it. A hundred and twenty-six of
 * them down the side of a table is a wall of borders and shadows competing
 * with the data they belong to, and the eye reads the buttons instead of the
 * rows. So this one carries no border and no fill until the pointer or the
 * keyboard reaches it, and states itself in a single word.
 *
 * It also keeps a minimum width. A cell whose button says Start now and Stop
 * a moment later would otherwise change width under the pointer, and the
 * whole column would shift every time a service changed state.
 */
export const RowAction = forwardRef<HTMLButtonElement, RowActionProps>(function RowAction(
  { danger, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex h-6 min-w-16 shrink-0 items-center justify-center rounded-xs px-2',
        'text-sm font-medium whitespace-nowrap select-none',
        'border border-transparent bg-transparent text-ink-2',
        'transition-[background-color,border-color,color] duration-(--duration-fast) ease-(--ease-standard)',
        'hover:border-rule hover:bg-surface-2 hover:text-ink active:bg-surface-3',
        danger && 'hover:text-danger',
        'disabled:pointer-events-none disabled:opacity-50',
        'lumen-focus',
        className,
      )}
      {...rest}
    />
  );
});
