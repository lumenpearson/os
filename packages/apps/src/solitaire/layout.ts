/**
 * How big the cards are and how far apart they are fanned, from the size of
 * the window and nothing else.
 *
 * Seven columns have to fit across, so the card width follows the width of the
 * window down to a floor below which a rank in the corner stops being
 * readable; under that the table scrolls instead of shrinking further. Down
 * the column the fan tightens as a pile grows, the way a hand of cards is
 * squared up to fit the table, and stops tightening at a step that still shows
 * the corner of every card.
 */

import type { Card } from './cards';
import type { TableauPile } from './deal';
import type { DrawCount } from './rules';

export interface Area {
  width: number;
  height: number;
}

/** Below this the rank and the sign in the corner are no longer legible. */
export const MIN_CARD_WIDTH = 46;
/** Above this seven columns look like furniture rather than cards. */
export const MAX_CARD_WIDTH = 112;
export const DEFAULT_CARD_WIDTH = 72;
/** A playing card is 63 × 88 mm. */
export const CARD_RATIO = 88 / 63;
/** Columns, and the gaps between them, as fractions of a card width. */
const GAP_RATIO = 0.16;
const COLUMNS = 7;

export interface Metrics {
  cardWidth: number;
  cardHeight: number;
  /** Between columns, and between the top row and the tableau. */
  gap: number;
  /** Where the tableau starts, measured from the top of the table. */
  tableauTop: number;
  /** Step between fanned face-down cards. */
  downStep: number;
  /** Step between fanned face-up cards when there is room for it. */
  upStep: number;
  /** The tightest fan that still shows a corner. */
  minStep: number;
  /** Sideways step for the three cards turned onto the waste. */
  wasteStep: number;
  /** The whole table, left edge of the stock to right edge of the last column. */
  width: number;
}

/** The largest whole-pixel card that fits seven columns across `area`. */
export function fitTable(area: Area): Metrics {
  const usable = Number.isFinite(area.width) && area.width > 0 ? area.width : 0;
  const raw = usable > 0 ? usable / (COLUMNS + (COLUMNS - 1) * GAP_RATIO) : DEFAULT_CARD_WIDTH;
  const cardWidth = Math.round(Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, raw)));
  const cardHeight = Math.round(cardWidth * CARD_RATIO);
  const gap = Math.max(4, Math.round(cardWidth * GAP_RATIO));
  return {
    cardWidth,
    cardHeight,
    gap,
    tableauTop: cardHeight + gap * 2,
    downStep: Math.max(4, Math.round(cardHeight * 0.1)),
    upStep: Math.max(10, Math.round(cardHeight * 0.26)),
    minStep: Math.max(7, Math.round(cardHeight * 0.11)),
    wasteStep: Math.max(10, Math.round(cardWidth * 0.28)),
    width: cardWidth * COLUMNS + gap * (COLUMNS - 1),
  };
}

/** The left edge of column `index`, counting from the left of the table. */
export function columnLeft(index: number, m: Metrics): number {
  return index * (m.cardWidth + m.gap);
}

/** How tall a pile stands at a given face-up step. */
export function pileHeight(down: number, up: number, step: number, m: Metrics): number {
  const cards = down + up;
  if (cards === 0) return m.cardHeight;
  const fanned = down * m.downStep + Math.max(0, up - 1) * step;
  return fanned + m.cardHeight;
}

/**
 * The face-up step for one pile. It opens to `upStep` when the column has the
 * room and squares up towards `minStep` when it does not; past that the table
 * scrolls, because a pile that shows nothing of the cards underneath is not a
 * pile you can play.
 */
export function fanStep(down: number, up: number, available: number, m: Metrics): number {
  if (up <= 1) return m.upStep;
  if (!Number.isFinite(available) || available <= 0) return m.upStep;
  const room = available - m.cardHeight - down * m.downStep;
  const step = Math.floor(room / (up - 1));
  return Math.max(m.minStep, Math.min(m.upStep, step));
}

/** A card as it is drawn in a pile: where it sits, and what it would carry. */
export interface Spot {
  card: Card;
  faceUp: boolean;
  /** From the top-left corner of the pile. */
  x: number;
  y: number;
  /** How many cards leave with it, or 0 when it cannot be picked up. */
  count: number;
}

/**
 * A tableau column: the face-down cards tight at the top, the face-up ones
 * fanned below at `step`. Picking up a face-up card takes everything on top of
 * it, which is what the count says.
 */
export function tableauSpots(pile: TableauPile, step: number, m: Metrics): Spot[] {
  const spots: Spot[] = pile.down.map((card, i) => ({
    card,
    faceUp: false,
    x: 0,
    y: i * m.downStep,
    count: 0,
  }));
  const base = pile.down.length * m.downStep;
  pile.up.forEach((card, i) => {
    spots.push({ card, faceUp: true, x: 0, y: base + i * step, count: pile.up.length - i });
  });
  return spots;
}

/**
 * The waste. Only the top card is in play, and only the cards turned by the
 * last draw are worth showing — three of them at most, fanned to the right so
 * the player can see what came off the stock.
 */
export function wasteSpots(waste: readonly Card[], draw: DrawCount, m: Metrics): Spot[] {
  const shown = Math.min(waste.length, draw === 3 ? 3 : 1);
  return waste.slice(waste.length - shown).map((card, i) => ({
    card,
    faceUp: true,
    x: i * m.wasteStep,
    y: 0,
    count: i === shown - 1 ? 1 : 0,
  }));
}

/** How wide a pile of spots stands, for its drop area. */
export function spotsWidth(spots: readonly Spot[], m: Metrics): number {
  return spots.reduce((width, spot) => Math.max(width, spot.x + m.cardWidth), m.cardWidth);
}
