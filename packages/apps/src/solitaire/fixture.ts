/**
 * Tables written out by hand, for the tests.
 *
 * A deal is 52 cards in eleven piles; writing one as an object literal buries
 * the two cards a test is actually about. `hand('AS 2H TD')` reads like the
 * cards on the table, and `table({...})` fills in every pile the test does not
 * mention with nothing, so what is written down is exactly what matters.
 *
 * This is test scaffolding rather than part of the game, and it is kept out of
 * the app: nothing under this folder imports it except the tests.
 */

import { type Card, cardOf, RANKS, SUITS, type Suit } from './cards';
import type { Table, TableauPile } from './deal';

const RANK_CODES = 'A23456789TJQK';
const SUIT_CODES: Record<string, Suit> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

/** One card written as rank then suit: `AS`, `TD`, `7H`. Ten is `T`. */
export function card(code: string): Card {
  const rank = RANK_CODES.indexOf(code[0]?.toUpperCase() ?? '') + 1;
  const suit = SUIT_CODES[code[1]?.toUpperCase() ?? ''];
  if (rank < 1 || !suit) throw new Error(`not a card: ${code}`);
  const found = cardOf(SUITS.indexOf(suit) * RANKS + rank - 1);
  if (!found) throw new Error(`not a card: ${code}`);
  return found;
}

/** A list of cards, bottom first: `hand('KS QH JC')`. */
export function hand(codes: string): Card[] {
  const parts = codes.split(/\s+/).filter(Boolean);
  return parts.map(card);
}

/** A tableau pile written as face-down cards and face-up cards. */
export function pile(down: string, up: string): TableauPile {
  return { down: hand(down), up: hand(up) };
}

export interface TableParts {
  stock?: string;
  waste?: string;
  foundations?: string[];
  tableau?: TableauPile[];
}

/** A table with only the piles a test cares about; the rest are empty. */
export function table(parts: TableParts = {}): Table {
  return {
    stock: hand(parts.stock ?? ''),
    waste: hand(parts.waste ?? ''),
    foundations: Array.from({ length: 4 }, (_, i) => hand(parts.foundations?.[i] ?? '')),
    tableau: Array.from({ length: 7 }, (_, i) => parts.tableau?.[i] ?? { down: [], up: [] }),
  };
}
