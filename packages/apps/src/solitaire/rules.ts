/**
 * What may move where.
 *
 * Onto a tableau pile: one rank down and the other colour, and only a king
 * onto an empty pile. Onto a foundation: one rank up in the same suit, an ace
 * onto an empty one. A move takes a number of cards off the top of a pile, so
 * picking a card up in the middle of a tableau pile brings the run below it
 * along — that is one rule, not two.
 *
 * Nothing here changes anything: every function answers a question about a
 * table, and game.ts does the moving.
 */

import { ACE, type Card, colorOf, KING, RANKS } from './cards';
import {
  cardsAt,
  FOUNDATIONS,
  isEmptyAt,
  type Slot,
  sameSlot,
  type Table,
  tableauAt,
  topOf,
} from './deal';

/** Cards turned from the stock at a time. */
export type DrawCount = 1 | 3;
export const DRAW_COUNTS: readonly DrawCount[] = [1, 3];

export function isDrawCount(value: unknown): value is DrawCount {
  return value === 1 || value === 3;
}

/**
 * How many times the waste may be turned back into the stock.
 *
 * Drawing one turns the whole pack over on every pass, so there is nothing to
 * be gained by stopping the player going round again. Drawing three only ever
 * exposes every third card, and which ones it exposes shifts as the waste is
 * played off, so passes are worth something: three of them, and no more.
 */
export const PASSES_DRAWING_THREE = 3;

export function recycleLimit(draw: DrawCount): number {
  return draw === 3 ? PASSES_DRAWING_THREE - 1 : Number.POSITIVE_INFINITY;
}

/** Whether the stock has anything left to turn. */
export function canDraw(table: Table): boolean {
  return table.stock.length > 0;
}

/** Whether the waste may be turned back over to make a new stock. */
export function canRecycle(table: Table, draw: DrawCount, recycles: number): boolean {
  if (table.stock.length > 0 || table.waste.length === 0) return false;
  return recycles < recycleLimit(draw);
}

/** Descending rank, alternating colour — or a king onto nothing. */
export function canStackOnTableau(card: Card, top: Card | null): boolean {
  if (!top) return card.rank === KING;
  return card.rank === top.rank - 1 && colorOf(card) !== colorOf(top);
}

/** Ascending from the ace, one suit to a pile. */
export function canStackOnFoundation(card: Card, top: Card | null): boolean {
  if (!top) return card.rank === ACE;
  return card.suit === top.suit && card.rank === top.rank + 1;
}

/** Whether these cards, bottom first, are a tableau run as they stand. */
export function isRun(cards: readonly Card[]): boolean {
  for (let i = 1; i < cards.length; i += 1) {
    const under = cards[i - 1] as Card;
    const over = cards[i] as Card;
    if (!canStackOnTableau(over, under)) return false;
  }
  return true;
}

/** A move: `count` cards off the top of `from`, onto `to`. */
export interface Move {
  readonly from: Slot;
  readonly to: Slot;
  readonly count: number;
}

/**
 * The cards a move would carry, bottom first, or null when they cannot be
 * lifted: nothing comes off the stock by hand, and only the top card comes off
 * the waste or a foundation.
 */
export function lift(table: Table, from: Slot, count: number): readonly Card[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  if (from.kind === 'stock') return null;
  if (from.kind !== 'tableau' && count !== 1) return null;
  const cards = cardsAt(table, from);
  if (count > cards.length) return null;
  const run = cards.slice(cards.length - count);
  if (from.kind === 'tableau' && !isRun(run)) return null;
  return run;
}

/** Whether a move is legal on this table. */
export function canMove(table: Table, move: Move): boolean {
  if (sameSlot(move.from, move.to)) return false;
  if (move.to.kind === 'stock' || move.to.kind === 'waste') return false;
  const run = lift(table, move.from, move.count);
  if (!run) return false;
  const bottom = run[0] as Card;
  if (move.to.kind === 'foundation') {
    if (move.to.index < 0 || move.to.index >= table.foundations.length) return false;
    if (run.length !== 1) return false;
    return canStackOnFoundation(bottom, topOf(table, move.to));
  }
  if (move.to.index < 0 || move.to.index >= table.tableau.length) return false;
  return canStackOnTableau(bottom, topOf(table, move.to));
}

/** Every slot that would take `count` cards off the top of `from`. */
export function targetsFor(table: Table, from: Slot, count: number): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < table.foundations.length; i += 1) {
    const to = { kind: 'foundation' as const, index: i };
    if (canMove(table, { from, to, count })) out.push(to);
  }
  for (let i = 0; i < table.tableau.length; i += 1) {
    const to = { kind: 'tableau' as const, index: i };
    if (canMove(table, { from, to, count })) out.push(to);
  }
  return out;
}

/**
 * The foundation a single card belongs on, if any. The first empty foundation
 * takes an ace, so the four piles fill left to right rather than at random.
 */
export function foundationFor(table: Table, card: Card): Slot | null {
  let empty: Slot | null = null;
  for (let i = 0; i < table.foundations.length; i += 1) {
    const slot = { kind: 'foundation' as const, index: i };
    const top = topOf(table, slot);
    if (!top) {
      if (!empty) empty = slot;
      continue;
    }
    if (canStackOnFoundation(card, top)) return slot;
  }
  return empty && canStackOnFoundation(card, null) ? empty : null;
}

/**
 * How many cards can be lifted from a tableau pile at once: the whole face-up
 * run. Klondike has no reserve to shuffle cards through, so this is simply the
 * number of face-up cards.
 */
export function liftableFrom(table: Table, index: number): number {
  return tableauAt(table, index).up.length;
}

/** Whether any legal move is left, so the status line can say so. */
export function hasMove(table: Table, draw: DrawCount, recycles: number): boolean {
  if (canDraw(table) || canRecycle(table, draw, recycles)) return true;
  if (table.waste.length > 0 && targetsFor(table, { kind: 'waste', index: 0 }, 1).length > 0) {
    return true;
  }
  for (let i = 0; i < table.tableau.length; i += 1) {
    const pile = tableauAt(table, i);
    const from = { kind: 'tableau' as const, index: i };
    // Only the bottom of the run and the single top card can start a move that
    // changes anything; a mid-run lift lands wherever the whole run lands.
    for (const count of new Set([1, pile.up.length])) {
      if (count < 1) continue;
      const targets = targetsFor(table, from, count).filter(
        // Moving a whole pile from one empty column to another achieves nothing.
        (to) => !(count === pile.up.length && pile.down.length === 0 && isEmptyAt(table, to)),
      );
      if (targets.length > 0) return true;
    }
  }
  return false;
}

/** Every card home: four suits of thirteen, which accounts for the whole pack. */
export function isWon(table: Table): boolean {
  return (
    table.foundations.length === FOUNDATIONS &&
    table.foundations.every((pile) => pile.length === RANKS)
  );
}
