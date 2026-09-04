import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

export function Divider({
  vertical,
  className,
  ...rest
}: HTMLAttributes<HTMLHRElement> & { vertical?: boolean }) {
  return (
    <hr
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cx(
        'border-0 bg-rule shrink-0',
        vertical ? 'h-full w-px' : 'h-px w-full',
        className,
      )}
      {...rest}
    />
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx('lumen-spin text-ink-2', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ProgressProps {
  /** 0–1; undefined renders an indeterminate bar. */
  value?: number;
  label?: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const pct = value === undefined ? undefined : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cx(
          'h-full rounded-full bg-accent transition-[width] duration-(--duration-slow) ease-(--ease-standard)',
          pct === undefined && 'w-1/3 animate-[lumen-indeterminate_1.2s_ease-in-out_infinite]',
        )}
        style={pct === undefined ? undefined : { width: `${pct}%` }}
      />
      <style>
        {
          '@keyframes lumen-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'
        }
      </style>
    </div>
  );
}

/** A count for real state only (unread messages, running processes). */
export function Count({ value, className }: { value: number; className?: string }) {
  if (value <= 0) return null;
  return (
    <span
      className={cx(
        'mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-2xs font-medium text-ink-inverse',
        className,
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

export interface AvatarProps {
  name: string;
  /** Data URL, or "preset:<id>". */
  src?: string;
  size?: number;
  className?: string;
}

const PRESET_HUES: Record<string, number> = {
  ember: 18,
  moss: 140,
  tide: 200,
  iris: 262,
  slate: 220,
  sand: 42,
};

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const preset = src?.startsWith('preset:') ? src.slice(7) : null;
  const hue = preset ? (PRESET_HUES[preset] ?? 220) : null;
  if (src && !preset) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cx('rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: hue === null ? 'var(--lumen-ink-3)' : `hsl(${hue} 32% 42%)`,
      }}
    >
      {initials || '?'}
    </span>
  );
}

export function Surface({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={cx('rounded-md border border-rule bg-surface', className)} {...rest}>
      {children}
    </div>
  );
}
