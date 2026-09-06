import { cx } from '@lumen/ui';
import { type ReactNode, useMemo } from 'react';
import {
  ARTWORK_HEIGHT,
  ARTWORK_WIDTH,
  artworkFigures,
  describeArtwork,
  type Figure,
} from './artwork';
import type { Artwork } from './remote';

/** A figure's identity inside one drawing: its kind and where it sits. */
function figureKey(figure: Figure): string {
  switch (figure.kind) {
    case 'ring':
      return `ring-${figure.cx}-${figure.cy}-${figure.r}`;
    case 'cell':
      return `cell-${figure.x}-${figure.y}`;
    case 'bar':
      return `bar-${figure.x}`;
    case 'glyph':
      return `glyph-${figure.x}-${figure.y}`;
  }
}

/**
 * One figure of the recipe. The switch lives in a component of its own
 * rather than inside the `map` that draws them, because a discriminated
 * union is exhaustive to the compiler but not to the rule that watches
 * iterable callbacks — and a `default` arm that cannot be reached is dead
 * code standing in for a proof.
 */
function FigureShape({ figure }: { figure: Figure }) {
  switch (figure.kind) {
    case 'ring':
      return (
        <circle
          cx={figure.cx}
          cy={figure.cy}
          r={figure.r}
          fill="none"
          stroke="currentColor"
          strokeWidth={figure.width}
          opacity={figure.opacity}
        />
      );
    case 'cell':
      return (
        <rect
          x={figure.x}
          y={figure.y}
          width={figure.size}
          height={figure.size}
          fill="currentColor"
          opacity={figure.opacity}
        />
      );
    case 'bar':
      return (
        <rect
          x={figure.x}
          y={figure.y}
          width={figure.width}
          height={figure.height}
          fill="currentColor"
          opacity={figure.opacity}
        />
      );
    case 'glyph':
      return (
        <text
          x={figure.x}
          y={figure.y}
          fontSize={figure.size}
          fill="currentColor"
          opacity={figure.opacity}
          // Letterforms as texture: the face the OS prints values in.
          // deslop-ignore-next-line 34
          style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
        >
          {figure.text}
        </text>
      );
  }
}

/**
 * The recipe drawn: geometry from `artwork.ts`, colour from the system's own
 * tokens. One tone switches the whole drawing between the accent and the
 * neutral ramp; nothing else is coloured, and every figure is flat — no
 * gradient, no shadow, no glow. The box is sliced rather than stretched, so
 * the same recipe reads at a banner's proportions and a screenshot's.
 */
export function ArtworkFill({ artwork, className }: { artwork: Artwork; className?: string }) {
  const figures = useMemo(() => artworkFigures(artwork), [artwork]);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ARTWORK_WIDTH} ${ARTWORK_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx('block h-full w-full', className)}
      style={{ color: artwork.tone === 'accent' ? 'var(--color-accent)' : 'var(--color-ink-3)' }}
    >
      <title>{describeArtwork(artwork)}</title>
      {figures.map((figure) => (
        <FigureShape key={figureKey(figure)} figure={figure} />
      ))}
    </svg>
  );
}

export interface ArtworkPanelProps {
  artwork: Artwork;
  /** Sits over the drawing: a title, a caption. */
  children?: ReactNode;
  className?: string;
}

/** A bordered panel with the drawing behind whatever is put on it. */
export function ArtworkPanel({ artwork, children, className }: ArtworkPanelProps) {
  return (
    <div
      className={cx('relative overflow-hidden rounded-md border border-rule bg-surface', className)}
    >
      <div className="absolute inset-0">
        <ArtworkFill artwork={artwork} />
      </div>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
