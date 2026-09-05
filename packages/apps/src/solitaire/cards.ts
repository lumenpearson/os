/**
 * The deck.
 *
 * A card is its place in an unshuffled pack — 0 to 51 — carried around as a
 * frozen object so the table can be read without decoding anything. Two cards
 * are the same card exactly when their ids match, which is what lets a pile be
 * a list of small integers on disk and a list of references in memory.
 */

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

/** Red and black, because alternating colour is half of the rules. */
export type CardColor = 'black' | 'red';

export const ACE = 1;
export const KING = 13;
/** Ranks per suit: ace through king. */
export const RANKS = 13;
export const DECK_SIZE = SUITS.length * RANKS;

export interface Card {
  /** 0–51: where it sits in an unshuffled pack, and its identity on the table. */
  readonly id: number;
  readonly suit: Suit;
  /** 1 for the ace, 11–13 for jack, queen and king. */
  readonly rank: number;
}

const COLORS: Record<Suit, CardColor> = {
  spades: 'black',
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
};

/** The suit signs as a printed card carries them. */
export const SUIT_SIGN: Record<Suit, string> = {
  // deslop-ignore 15 — pip signs, not emoji: they are the card's own notation.
  spades: '♠',
  // deslop-ignore 15
  hearts: '♥',
  // deslop-ignore 15
  diamonds: '♦',
  // deslop-ignore 15
  clubs: '♣',
};

const NAMES: Record<Suit, string> = {
  spades: 'Spades',
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
};

/** The 52 cards, made once. Identity is stable, so `===` compares cards. */
const PACK: readonly Card[] = Object.freeze(
  Array.from({ length: DECK_SIZE }, (_, id) =>
    Object.freeze({
      id,
      suit: SUITS[Math.floor(id / RANKS)] as Suit,
      rank: (id % RANKS) + ACE,
    }),
  ),
);

/** The card with this id, or null when the number is not one — a saved file. */
export function cardOf(id: unknown): Card | null {
  if (typeof id !== 'number' || !Number.isInteger(id)) return null;
  return PACK[id] ?? null;
}

/** A fresh array of all 52 cards, in pack order. */
export function deck(): Card[] {
  return PACK.slice();
}

export function colorOf(card: Card): CardColor {
  return COLORS[card.suit];
}

export function isRed(card: Card): boolean {
  return COLORS[card.suit] === 'red';
}

/** The rank as it is printed in the corner. */
export function rankLabel(rank: number): string {
  switch (rank) {
    case ACE:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case KING:
      return 'K';
    default:
      return String(rank);
  }
}

/** The rank spoken aloud, for a screen reader. */
export function rankName(rank: number): string {
  switch (rank) {
    case ACE:
      return 'Ace';
    case 11:
      return 'Jack';
    case 12:
      return 'Queen';
    case KING:
      return 'King';
    default:
      return String(rank);
  }
}

export function suitName(suit: Suit): string {
  return NAMES[suit];
}

/** How a card is written down in one glance: `A♠`, `10♥`. */
export function shortName(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SIGN[card.suit]}`;
}

/** A source of floats in [0, 1): `Math.random`, or a seeded one below. */
export type Random = () => number;

/**
 * mulberry32: 32 bits of state, one multiply and a few shifts per draw. Not
 * cryptographic and it does not need to be — it shuffles 52 cards. What it
 * gives is that a seed deals the same game twice, so Restart This Deal can put
 * the cards back exactly and the tests need not guess.
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh deal. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/**
 * Fisher–Yates on a copy. The result is always a permutation of the input,
 * which is what makes a deal exact: 52 cards go in and 52 come out.
 */
export function shuffle(cards: readonly Card[], random: Random): Card[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const draw = random();
    const j = Number.isFinite(draw) ? Math.min(i, Math.max(0, Math.floor(draw * (i + 1)))) : 0;
    // Both indices are inside the array, so neither read is undefined.
    const held = out[i] as Card;
    out[i] = out[j] as Card;
    out[j] = held;
  }
  return out;
}
