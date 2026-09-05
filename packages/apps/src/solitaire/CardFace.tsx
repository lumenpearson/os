/**
 * A card, its back, and the outline of a pile with nothing on it.
 *
 * The face carries the index in the corner — rank over sign, in the mono face
 * the design rules put on values — and one larger sign opposite it. Red suits
 * are drawn in the danger colour and black suits in ink, and that is all the
 * colour on the table: the accent belongs to what the player has picked up.
 *
 * Everything scales from the card width, so one component serves a 46-pixel
 * card in a narrow window and a 112-pixel card on a large display.
 */

import { cx } from '@lumen/ui';
import { type Card, isRed, rankLabel, SUIT_SIGN } from './cards';

export interface CardFaceProps {
  card: Card;
  width: number;
  height: number;
  /** Drawn as if it were still in the pile it is being dragged out of. */
  ghost?: boolean;
  className?: string;
}

export function CardFace({ card, width, height, ghost, className }: CardFaceProps) {
  const index = Math.max(9, Math.round(width * 0.3));
  const sign = Math.max(12, Math.round(width * 0.42));
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-sm border border-rule-strong bg-surface',
        ghost && 'opacity-30',
        className,
      )}
      style={{ width, height }}
    >
      <div
        className={cx(
          'mono absolute left-[6%] top-[3%] flex flex-col items-center leading-none tabular-nums',
          isRed(card) ? 'text-danger' : 'text-ink',
        )}
        style={{ fontSize: index }}
      >
        <span className="font-medium">{rankLabel(card.rank)}</span>
        <span style={{ fontSize: Math.round(index * 0.8) }}>{SUIT_SIGN[card.suit]}</span>
      </div>
      <span
        aria-hidden
        className={cx(
          'absolute bottom-[3%] right-[6%] leading-none',
          isRed(card) ? 'text-danger' : 'text-ink',
        )}
        style={{ fontSize: sign }}
      >
        {SUIT_SIGN[card.suit]}
      </span>
    </div>
  );
}

export interface CardBackProps {
  width: number;
  height: number;
  className?: string;
}

/** The back: two hairlines and nothing else. The pattern is the inset. */
export function CardBack({ width, height, className }: CardBackProps) {
  return (
    <div
      className={cx('relative rounded-sm border border-rule-strong bg-surface-2', className)}
      style={{ width, height }}
    >
      <span aria-hidden className="absolute inset-[3px] rounded-xs border border-rule" />
    </div>
  );
}

export interface CardSlotProps {
  width: number;
  height: number;
  className?: string;
}

/** Where a card would sit: an outline the width of a card. */
export function CardSlot({ width, height, className }: CardSlotProps) {
  return (
    <div
      className={cx('rounded-sm border border-rule-strong bg-canvas', className)}
      style={{ width, height }}
    />
  );
}
