import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

/** A monospace accent: labels, values, paths, shortcuts. */
export function Mono({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('mono', className)} {...rest}>
      {children}
    </span>
  );
}

/** A small uppercase mono label that introduces a group. Use sparingly. */
export function Label({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx('mono text-xs uppercase tracking-[0.08em] text-ink-3', className)}
      {...rest}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'mono inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-rule-strong bg-surface px-1 text-xs text-ink-2',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3;
}

const headingSizes = {
  1: 'text-xl font-semibold tracking-tight',
  2: 'text-lg font-semibold',
  3: 'text-md font-medium',
} as const;

export function Heading({ level = 2, className, children, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cx(headingSizes[level], 'text-ink', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Muted({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('text-ink-2', className)} {...rest}>
      {children}
    </span>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
