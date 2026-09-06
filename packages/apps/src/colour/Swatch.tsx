/**
 * A colour chip. The chequerboard behind it is the only thing that makes a
 * half-transparent colour read as half-transparent rather than as a slightly
 * different solid, so every chip in the app gets one.
 */

import { cx } from '@lumen/ui';
import type { CSSProperties } from 'react';
import type { Rgba } from '../paint/colour';
import { cssRgba } from './model';

/** Two greys from the theme, so the chequer reads in both light and dark. */
const CHEQUER =
  'repeating-conic-gradient(var(--color-surface-2) 0% 25%, var(--color-surface) 0% 50%)';

export interface SwatchProps {
  colour: Rgba;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Swatch({ colour, className, style, title }: SwatchProps) {
  return (
    <span
      aria-hidden
      title={title}
      className={cx('block rounded-xs hairline', className)}
      style={{ backgroundImage: CHEQUER, backgroundSize: '8px 8px', ...style }}
    >
      <span className="block h-full w-full rounded-xs" style={{ background: cssRgba(colour) }} />
    </span>
  );
}
