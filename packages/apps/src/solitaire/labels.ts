/**
 * The words and the numbers: what a card is called when it is read out, what
 * the status line says, and the clock.
 */

import { type Card, rankName, shortName, suitName } from './cards';
import { countAt, type Slot, type Table, tableauAt } from './deal';
import type { Game } from './game';
import { canRecycle, isWon } from './rules';

/** A card spoken in full, for a screen reader. */
export function cardName(card: Card): string {
  return `${rankName(card.rank)} of ${suitName(card.suit).toLowerCase()}`;
}

export function slotName(slot: Slot): string {
  switch (slot.kind) {
    case 'stock':
      return 'Stock';
    case 'waste':
      return 'Waste';
    case 'foundation':
      return `Foundation ${slot.index + 1}`;
    case 'tableau':
      return `Column ${slot.index + 1}`;
  }
}

/** What one card on the table is, in a line. */
export function cardLabel(card: Card, faceUp: boolean, slot: Slot): string {
  if (!faceUp) return `Face down card, ${slotName(slot)}`;
  return `${cardName(card)}, ${slotName(slot)}`;
}

/** What an empty pile is, so tabbing onto it says something. */
export function emptyLabel(slot: Slot): string {
  if (slot.kind === 'foundation') return `${slotName(slot)}, empty — an ace starts it`;
  if (slot.kind === 'tableau') return `${slotName(slot)}, empty — a king starts it`;
  return `${slotName(slot)}, empty`;
}

/** What clicking the stock will do. */
export function stockLabel(game: Game): string {
  if (game.table.stock.length > 0) {
    return `Stock, ${game.table.stock.length} left — turn ${game.draw === 1 ? 'one' : 'three'}`;
  }
  if (canRecycle(game.table, game.draw, game.recycles)) return 'Stock empty — turn the waste over';
  return 'Stock empty — no passes left';
}

/** Minutes and seconds, hours only once there are any. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatMoves(count: number): string {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${whole} ${whole === 1 ? 'move' : 'moves'}`;
}

/** How many cards are still face down in the tableau. */
export function faceDownCount(table: Table): number {
  return table.tableau.reduce((n, pile) => n + pile.down.length, 0);
}

/** One line under the table: where the deal stands. */
export function statusLine(game: Game): string {
  if (isWon(game.table)) return `Solved in ${formatMoves(game.moves)}.`;
  const home = game.table.foundations.reduce((n, pile) => n + pile.length, 0);
  const hidden = faceDownCount(game.table);
  const stock = game.table.stock.length;
  return `${home} home · ${hidden} face down · ${stock} in the stock`;
}

/** What a pile holds, for the reader arriving on it. */
export function pileSummary(table: Table, slot: Slot): string {
  const total = countAt(table, slot);
  if (total === 0) return emptyLabel(slot);
  if (slot.kind === 'tableau') {
    const pile = tableauAt(table, slot.index);
    const top = pile.up[pile.up.length - 1];
    const showing = top ? shortName(top) : 'nothing';
    return `${slotName(slot)}, ${total} cards, ${pile.down.length} face down, showing ${showing}`;
  }
  return `${slotName(slot)}, ${total} cards`;
}
