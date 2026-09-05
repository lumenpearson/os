/**
 * The six pieces, as SVG paths on a 0–100 square.
 *
 * Drawn here rather than taken from a font or an icon set: the Unicode chess
 * characters depend on a font the machine may not have, and a missing glyph
 * on a chessboard is not a cosmetic problem — it is a piece you cannot
 * identify. These are silhouettes, so a white piece is the same shape as a
 * black one with a different fill and the outline carries the contrast.
 *
 * The two fills are named per colour scheme rather than taken straight from
 * the ramp: `--color-ink` is near-black in the light theme and near-white in
 * the dark one, so using it for the black pieces would turn both sides white
 * as soon as the lights went out. `light-dark` pins each piece to the end of
 * the ramp it belongs to, in both themes.
 */

import { cx } from '@lumen/ui';
import type { Color, PieceType } from './board';

const PATHS: Record<PieceType, string> = {
  // A pawn: head, collar, flared base.
  p: 'M50 22a11 11 0 0 1 6.6 19.8c5.2 3.3 8.4 8.6 8.4 14.7 0 6-3 11-7 15h5l6 12H31l6-12h5c-4-4-7-9-7-15 0-6.1 3.2-11.4 8.4-14.7A11 11 0 0 1 50 22Z',
  // A knight: the horse's head, facing left.
  n: 'M36 20c2 4 5 7 9 9l-3 6 12-2c9 0 18 7 20 17l4 22c1 5-2 9-7 9H30c-4 0-6-3-5-7l4-14-8 6c-3 2-6 0-6-3 0-9 4-17 11-23l6-5-3-8c-1-4 1-8 4-9 2-1 3 0 3 2Zm5 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  // A bishop: mitre with its slit, collar, base.
  b: 'M50 16c3 0 6 3 6 6 0 2-1 4-2 5 7 5 12 13 12 21 0 6-3 11-8 15l4 5H38l4-5c-5-4-8-9-8-15 0-8 5-16 12-21-1-1-2-3-2-5 0-3 3-6 6-6Zm0 16-8 12h16l-8-12ZM32 69h36l6 12H26l6-12Z',
  // A rook: crenellations, body, base.
  r: 'M26 22h11v7h8v-7h10v7h8v-7h11v18l-6 6v20l6 6v12H26V73l6-6V46l-6-6V22Z',
  // A queen: coronet of five points over a bell.
  q: 'M20 30a5 5 0 1 1 5 5l4 10 8-12a5 5 0 1 1 6 0l7 13 7-13a5 5 0 1 1 6 0l8 12 4-10a5 5 0 1 1 5-5c0 2-1 4-3 5l-6 26c-1 4-4 6-8 6H37c-4 0-7-2-8-6l-6-26c-2-1-3-3-3-5Zm10 47h40l6 12H24l6-12Z',
  // A king: cross, crown, body.
  k: 'M46 14h8v8h8v8h-8v8h-8v-8h-8v-8h8v-8Zm4 26c11 0 20 8 20 18 0 6-3 11-8 15l4 6H34l4-6c-5-4-8-9-8-15 0-10 9-18 20-18Zm-20 50h40l6 12H24l6-12Z',
};

const PIECE_LIGHT = 'light-dark(var(--color-ink-inverse), var(--color-ink))';
const PIECE_DARK = 'light-dark(var(--color-ink), var(--color-ink-inverse))';

/** What the pieces fall back to where `light-dark` is not read: the ramp itself. */
const FALLBACK: Record<Color, string> = {
  w: 'fill-white stroke-ink',
  b: 'fill-ink stroke-white/70',
};

export interface PieceGlyphProps {
  color: Color;
  type: PieceType;
  className?: string;
}

export function PieceGlyph({ color, type, className }: PieceGlyphProps) {
  const white = color === 'w';
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      className={cx('pointer-events-none size-full', className)}
    >
      <title>{pieceName(color, type)}</title>
      <path
        d={PATHS[type]}
        className={FALLBACK[color]}
        style={{
          fill: white ? PIECE_LIGHT : PIECE_DARK,
          stroke: white ? PIECE_DARK : PIECE_LIGHT,
        }}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** "White knight" — the accessible name of a square's occupant. */
export function pieceName(color: Color, type: PieceType): string {
  return `${color === 'w' ? 'White' : 'Black'} ${NAMES[type]}`;
}
