import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cx } from '../cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon element. */
  icon?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 border border-transparent',
  secondary:
    'bg-surface text-ink border border-rule-strong hover:bg-surface-2 active:bg-surface-3 shadow-sm',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 active:bg-surface-3 border border-transparent',
  danger:
    'bg-danger text-accent-ink hover:brightness-110 active:brightness-95 border border-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-sm rounded-xs gap-1.5',
  md: 'h-7 px-3 text-base rounded-sm gap-2',
  lg: 'h-9 px-4 text-md rounded-md gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    block,
    loading,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-[background-color,border-color,filter] duration-(--duration-fast) ease-(--ease-standard)',
        'disabled:opacity-50 disabled:pointer-events-none lumen-focus',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          // deslop-ignore-next-line 19 — a spinner is a ring; the radius scale does not apply.
          className="size-3.5 rounded-full border-2 border-current border-t-transparent lumen-spin"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
