import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cx } from '../cx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; rendered as aria-label and tooltip. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  variant?: 'ghost' | 'outline';
  children: ReactNode;
}

const sizes = {
  sm: 'size-6 rounded-xs [&>svg]:size-3.5',
  md: 'size-7 rounded-sm [&>svg]:size-4',
  lg: 'size-9 rounded-md [&>svg]:size-5',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center justify-center text-ink-2 hover:text-ink select-none',
        'transition-[background-color,color] duration-(--duration-fast) ease-(--ease-standard)',
        'hover:bg-surface-2 active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none lumen-focus',
        variant === 'outline' && 'border border-rule-strong bg-surface',
        active && 'bg-surface-3 text-ink',
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
