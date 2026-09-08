import { describe, expect, it } from 'vitest';
import {
  ACE,
  type Card,
  cardOf,
  colorOf,
  createRandom,
  DECK_SIZE,
  deck,
  isRed,
  KING,
  randomSeed,
  rankLabel,
  rankName,
  SUIT_SIGN,
  SUITS,
  shortName,
  shuffle,
  suitName,
} from './cards';

describe('the pack', () => {
  it('holds thirteen ranks in each of four suits, once each', () => {
    const cards = deck();
    expect(cards).toHaveLength(DECK_SIZE);
    expect(new Set(cards.map((c) => c.id)).size).toBe(DECK_SIZE);
    for (const suit of SUITS) {
      const ranks = cards.filter((c) => c.suit === suit).map((c) => c.rank);
      expect(ranks.slice().sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
      ]);
    }
  });

  it('hands back the same object for an id, so cards compare by identity', () => {
    expect(cardOf(0)).toBe(cardOf(0));
    expect(deck()[17]).toBe(cardOf(17));
  });

  it('refuses an id that is not a card', () => {
    expect(cardOf(-1)).toBeNull();
    expect(cardOf(DECK_SIZE)).toBeNull();
    expect(cardOf(1.5)).toBeNull();
    expect(cardOf('3')).toBeNull();
    expect(cardOf(undefined)).toBeNull();
    expect(cardOf(Number.NaN)).toBeNull();
  });

  it('reads the first and last card of the pack', () => {
    const first = cardOf(0) as Card;
    expect(first.suit).toBe('spades');
    expect(first.rank).toBe(ACE);
    const last = cardOf(DECK_SIZE - 1) as Card;
    expect(last.suit).toBe('clubs');
    expect(last.rank).toBe(KING);
  });
});

describe('colour', () => {
  it('makes hearts and diamonds red, spades and clubs black', () => {
    expect(colorOf({ id: 0, suit: 'hearts', rank: 5 })).toBe('red');
    expect(colorOf({ id: 0, suit: 'diamonds', rank: 5 })).toBe('red');
    expect(colorOf({ id: 0, suit: 'spades', rank: 5 })).toBe('black');
    expect(colorOf({ id: 0, suit: 'clubs', rank: 5 })).toBe('black');
    expect(isRed({ id: 0, suit: 'hearts', rank: 5 })).toBe(true);
    expect(isRed({ id: 0, suit: 'clubs', rank: 5 })).toBe(false);
  });
});

describe('names', () => {
  it('prints the court cards as letters and the rest as numbers', () => {
    expect(rankLabel(1)).toBe('A');
    expect(rankLabel(10)).toBe('10');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
  });

  it('speaks the court cards in full', () => {
    expect(rankName(1)).toBe('Ace');
    expect(rankName(7)).toBe('7');
    expect(rankName(11)).toBe('Jack');
    expect(rankName(13)).toBe('King');
    expect(suitName('spades')).toBe('Spades');
  });

  it('writes a card as its rank and its sign', () => {
    expect(shortName({ id: 0, suit: 'spades', rank: 1 })).toBe(`A${SUIT_SIGN.spades}`);
    expect(shortName({ id: 0, suit: 'hearts', rank: 10 })).toBe(`10${SUIT_SIGN.hearts}`);
  });
});

describe('shuffle', () => {
  it('keeps every card, so a deal is always a whole pack', () => {
    const shuffled = shuffle(deck(), createRandom(7));
    expect(shuffled).toHaveLength(DECK_SIZE);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(DECK_SIZE);
  });

  it('leaves the pack it was given alone', () => {
    const cards = deck();
    const before = cards.map((c) => c.id);
    shuffle(cards, createRandom(3));
    expect(cards.map((c) => c.id)).toEqual(before);
  });

  it('deals the same game twice from one seed, and a different one from another', () => {
    const a = shuffle(deck(), createRandom(12345)).map((c) => c.id);
    const b = shuffle(deck(), createRandom(12345)).map((c) => c.id);
    const c = shuffle(deck(), createRandom(12346)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('actually moves the cards', () => {
    const ordered = deck().map((c) => c.id);
    expect(shuffle(deck(), createRandom(99)).map((c) => c.id)).not.toEqual(ordered);
  });

  it('survives a random source that returns nonsense', () => {
    const shuffled = shuffle(deck(), () => Number.NaN);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(DECK_SIZE);
    const high = shuffle(deck(), () => 1);
    expect(new Set(high.map((c) => c.id)).size).toBe(DECK_SIZE);
  });
});

describe('createRandom', () => {
  it('stays inside [0, 1)', () => {
    const random = createRandom(2024);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives a seed that is a whole 32-bit number', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
