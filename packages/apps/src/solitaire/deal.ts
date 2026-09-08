/**
 * The table and how the cards are laid on it.
 *
 * Klondike: seven tableau piles of one to seven cards with only the last face
 * up, the remaining twenty-four in the stock, an empty waste, four empty
 * foundations.
 *
 * A tableau pile is kept as two lists rather than one list of flagged cards,
 * because the face-down cards are always underneath: nothing is ever placed
 * below a face-up card, and a card is only turned over when it is the last one
 * left covered. Splitting the pile in two makes that an invariant of the type
 * instead of something every function has to re-check.
 *
 * The top of every pile is the LAST element, so drawing, moving and stacking
 * are all pushes and pops.
 */

import { type Card, DECK_SIZE } from './cards';

export const TABLEAU_PILES = 7;
export const FOUNDATIONS = 4;
/** 1 + 2 + … + 7. The rest of the pack starts in the stock. */
export const DEALT_TO_TABLEAU = (TABLEAU_PILES * (TABLEAU_PILES + 1)) / 2;

export type SlotKind = 'stock' | 'waste' | 'foundation' | 'tableau';

/** Where a card is, or is going. */
export interface Slot {
  readonly kind: SlotKind;
  readonly index: number;
}

export const STOCK: Slot = Object.freeze({ kind: 'stock', index: 0 });
export const WASTE: Slot = Object.freeze({ kind: 'waste', index: 0 });

const TABLEAU_SLOTS: readonly Slot[] = Object.freeze(
  Array.from({ length: TABLEAU_PILES }, (_, index) => Object.freeze({ kind: 'tableau', index })),
) as readonly Slot[];

const FOUNDATION_SLOTS: readonly Slot[] = Object.freeze(
  Array.from({ length: FOUNDATIONS }, (_, index) => Object.freeze({ kind: 'foundation', index })),
) as readonly Slot[];

export function tableauSlot(index: number): Slot {
  return TABLEAU_SLOTS[index] ?? { kind: 'tableau', index };
}

export function foundationSlot(index: number): Slot {
  return FOUNDATION_SLOTS[index] ?? { kind: 'foundation', index };
}

/** Every slot on the table, left to right, top row first. */
export function allSlots(): Slot[] {
  return [STOCK, WASTE, ...FOUNDATION_SLOTS, ...TABLEAU_SLOTS];
}

export function sameSlot(a: Slot, b: Slot): boolean {
  return a.kind === b.kind && a.index === b.index;
}

/** A slot as one string, for a DOM attribute and back again. */
export function slotKey(slot: Slot): string {
  return slot.kind === 'stock' || slot.kind === 'waste' ? slot.kind : `${slot.kind}-${slot.index}`;
}

export function parseSlotKey(key: string): Slot | null {
  if (key === 'stock') return STOCK;
  if (key === 'waste') return WASTE;
  const parts = key.split('-');
  if (parts.length !== 2) return null;
  const [kind, rest] = parts;
  if (!rest || !/^\d+$/.test(rest)) return null;
  const index = Number(rest);
  if (kind === 'tableau') return index < TABLEAU_PILES ? tableauSlot(index) : null;
  if (kind === 'foundation') return index < FOUNDATIONS ? foundationSlot(index) : null;
  return null;
}

export interface TableauPile {
  /** Face down, bottom first. Always underneath everything face up. */
  readonly down: readonly Card[];
  /** Face up, bottom first; the last one is the top of the pile. */
  readonly up: readonly Card[];
}

export interface Table {
  /** Face down; the last one is the next to be turned. */
  readonly stock: readonly Card[];
  /** Face up; the last one is the one in play. */
  readonly waste: readonly Card[];
  /** Four piles, each ascending from an ace in one suit. */
  readonly foundations: readonly (readonly Card[])[];
  readonly tableau: readonly TableauPile[];
}

const EMPTY_PILE: TableauPile = Object.freeze({ down: [], up: [] });

/**
 * Lay out a shuffled pack. The cards are dealt the way they are dealt by
 * hand — one across each pile in turn, left to right — so the same shuffle
 * gives the same table as a physical deal would.
 */
export function layOut(cards: readonly Card[]): Table {
  if (cards.length !== DECK_SIZE) {
    throw new Error(`a deal needs ${DECK_SIZE} cards, got ${cards.length}`);
  }
  const down: Card[][] = Array.from({ length: TABLEAU_PILES }, () => []);
  const up: Card[][] = Array.from({ length: TABLEAU_PILES }, () => []);
  let next = 0;
  for (let round = 0; round < TABLEAU_PILES; round += 1) {
    for (let pile = round; pile < TABLEAU_PILES; pile += 1) {
      const card = cards[next] as Card;
      next += 1;
      // The last card each pile receives is the one it shows.
      if (pile === round) up[pile]?.push(card);
      else down[pile]?.push(card);
    }
  }
  return {
    stock: cards.slice(next),
    waste: [],
    foundations: Array.from({ length: FOUNDATIONS }, () => []),
    tableau: Array.from({ length: TABLEAU_PILES }, (_, i) => ({
      down: down[i] ?? [],
      up: up[i] ?? [],
    })),
  };
}

/** The cards in a slot, bottom first. Unknown slots read as empty. */
export function cardsAt(table: Table, slot: Slot): readonly Card[] {
  switch (slot.kind) {
    case 'stock':
      return table.stock;
    case 'waste':
      return table.waste;
    case 'foundation':
      return table.foundations[slot.index] ?? [];
    case 'tableau': {
      const pile = table.tableau[slot.index];
      if (!pile) return [];
      return pile.up;
    }
  }
}

export function tableauAt(table: Table, index: number): TableauPile {
  return table.tableau[index] ?? EMPTY_PILE;
}

/** The card in play on a pile, or null when there is none showing. */
export function topOf(table: Table, slot: Slot): Card | null {
  const cards = cardsAt(table, slot);
  return cards[cards.length - 1] ?? null;
}

/** How many cards are in a slot, face-down ones included. */
export function countAt(table: Table, slot: Slot): number {
  if (slot.kind === 'tableau') {
    const pile = tableauAt(table, slot.index);
    return pile.down.length + pile.up.length;
  }
  return cardsAt(table, slot).length;
}

export function isEmptyAt(table: Table, slot: Slot): boolean {
  return countAt(table, slot) === 0;
}

/** A table with one tableau pile replaced. */
export function withTableau(table: Table, index: number, pile: TableauPile): Table {
  return { ...table, tableau: table.tableau.map((p, i) => (i === index ? pile : p)) };
}

/** A table with one foundation replaced. */
export function withFoundation(table: Table, index: number, cards: readonly Card[]): Table {
  return { ...table, foundations: table.foundations.map((f, i) => (i === index ? cards : f)) };
}

/** Every card on the table, in no particular order — for checking a deal is whole. */
export function allCards(table: Table): Card[] {
  return [
    ...table.stock,
    ...table.waste,
    ...table.foundations.flat(),
    ...table.tableau.flatMap((pile) => [...pile.down, ...pile.up]),
  ];
}
