import { describe, expect, it } from 'vitest';
import { type Card, createRandom, DECK_SIZE, deck, shuffle } from './cards';
import {
  allCards,
  allSlots,
  cardsAt,
  countAt,
  DEALT_TO_TABLEAU,
  FOUNDATIONS,
  foundationSlot,
  isEmptyAt,
  layOut,
  parseSlotKey,
  STOCK,
  sameSlot,
  slotKey,
  TABLEAU_PILES,
  tableauAt,
  tableauSlot,
  topOf,
  WASTE,
  withFoundation,
  withTableau,
} from './deal';

const dealt = () => layOut(shuffle(deck(), createRandom(4242)));

describe('layOut', () => {
  it('makes seven piles of one to seven cards', () => {
    const table = dealt();
    expect(table.tableau).toHaveLength(TABLEAU_PILES);
    table.tableau.forEach((pile, i) => {
      expect(pile.down.length + pile.up.length).toBe(i + 1);
    });
  });

  it('shows the last card of every pile and hides the rest', () => {
    const table = dealt();
    table.tableau.forEach((pile, i) => {
      expect(pile.up).toHaveLength(1);
      expect(pile.down).toHaveLength(i);
    });
  });

  it('leaves the rest of the pack in the stock, with nothing on the waste', () => {
    const table = dealt();
    expect(table.stock).toHaveLength(DECK_SIZE - DEALT_TO_TABLEAU);
    expect(table.stock).toHaveLength(24);
    expect(table.waste).toHaveLength(0);
  });

  it('starts with four empty foundations', () => {
    const table = dealt();
    expect(table.foundations).toHaveLength(FOUNDATIONS);
    expect(table.foundations.every((pile) => pile.length === 0)).toBe(true);
  });

  it('puts every card on the table exactly once', () => {
    const ids = allCards(dealt()).map((card) => card.id);
    expect(ids).toHaveLength(DECK_SIZE);
    expect(new Set(ids).size).toBe(DECK_SIZE);
  });

  it('deals across the piles, so the first card is the top of the first column', () => {
    const cards = deck();
    const table = layOut(cards);
    expect(table.tableau[0]?.up[0]).toBe(cards[0]);
    // The second card dealt goes face down under the second pile.
    expect(table.tableau[1]?.down[0]).toBe(cards[1]);
    expect(table.tableau[6]?.down[0]).toBe(cards[6]);
  });

  it('refuses anything that is not a whole pack', () => {
    expect(() => layOut(deck().slice(1))).toThrow(/52 cards/);
    expect(() => layOut([])).toThrow();
  });
});

describe('slots', () => {
  it('names every place on the table once', () => {
    const slots = allSlots();
    expect(slots).toHaveLength(2 + FOUNDATIONS + TABLEAU_PILES);
    expect(new Set(slots.map(slotKey)).size).toBe(slots.length);
  });

  it('writes a slot as a string and reads it back', () => {
    for (const slot of allSlots()) {
      const back = parseSlotKey(slotKey(slot));
      expect(back).not.toBeNull();
      expect(back && sameSlot(back, slot)).toBe(true);
    }
  });

  it('refuses a key that is not a slot on this table', () => {
    expect(parseSlotKey('tableau-7')).toBeNull();
    expect(parseSlotKey('foundation-4')).toBeNull();
    expect(parseSlotKey('tableau--1')).toBeNull();
    expect(parseSlotKey('pocket-1')).toBeNull();
    expect(parseSlotKey('tableau-x')).toBeNull();
  });

  it('compares slots by what they are, not by identity', () => {
    expect(sameSlot(tableauSlot(2), { kind: 'tableau', index: 2 })).toBe(true);
    expect(sameSlot(tableauSlot(2), foundationSlot(2))).toBe(false);
    expect(sameSlot(STOCK, WASTE)).toBe(false);
  });
});

describe('reading the table', () => {
  const table = dealt();

  it('gives the cards in play at a slot', () => {
    expect(cardsAt(table, STOCK)).toBe(table.stock);
    expect(cardsAt(table, WASTE)).toBe(table.waste);
    expect(cardsAt(table, tableauSlot(3))).toBe(table.tableau[3]?.up);
    expect(cardsAt(table, foundationSlot(0))).toHaveLength(0);
  });

  it('reads the top card as the last one', () => {
    const pile = tableauAt(table, 4);
    expect(topOf(table, tableauSlot(4))).toBe(pile.up[pile.up.length - 1]);
    expect(topOf(table, foundationSlot(0))).toBeNull();
  });

  it('counts the face-down cards too', () => {
    expect(countAt(table, tableauSlot(6))).toBe(7);
    expect(cardsAt(table, tableauSlot(6))).toHaveLength(1);
    expect(isEmptyAt(table, foundationSlot(2))).toBe(true);
    expect(isEmptyAt(table, tableauSlot(0))).toBe(false);
  });

  it('reads a slot that is off the table as empty', () => {
    expect(cardsAt(table, tableauSlot(99))).toHaveLength(0);
    expect(countAt(table, foundationSlot(99))).toBe(0);
  });
});

describe('replacing a pile', () => {
  it('changes the one pile and leaves the others alone', () => {
    const table = dealt();
    const next = withTableau(table, 2, { down: [], up: [] });
    expect(next.tableau[2]?.up).toHaveLength(0);
    expect(next.tableau[3]).toBe(table.tableau[3]);
    expect(table.tableau[2]?.up).toHaveLength(1);
  });

  it('changes the one foundation and leaves the others alone', () => {
    const table = dealt();
    const ace = table.stock[0] as Card;
    const next = withFoundation(table, 1, [ace]);
    expect(next.foundations[1]).toEqual([ace]);
    expect(next.foundations[0]).toBe(table.foundations[0]);
  });
});
