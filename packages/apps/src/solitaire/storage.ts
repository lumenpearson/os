/**
 * What the game keeps in ~/.config/solitaire.json: the deal in progress, the
 * draw setting and whether the clock is on screen.
 *
 * Piles go to disk as lists of card ids, which is what a card is. The file is
 * text a user can edit, so nothing read back is trusted: a saved table is
 * played again only if it holds all fifty-two cards, once each, in the shape a
 * table has. Anything else is dropped and the app deals a fresh game rather
 * than showing a hand that cannot exist. The undo history is not saved — it
 * belongs to a sitting, not to a deal.
 */

import { type Card, cardOf, DECK_SIZE } from './cards';
import { FOUNDATIONS, TABLEAU_PILES, type Table } from './deal';
import type { Game } from './game';
import { type DrawCount, isDrawCount } from './rules';

export interface StoredPile {
  down: number[];
  up: number[];
}

export interface StoredGame {
  seed: number;
  moves: number;
  recycles: number;
  /** Seconds on the clock when the game was last written. */
  seconds: number;
  stock: number[];
  waste: number[];
  foundations: number[][];
  tableau: StoredPile[];
}

export interface SolitaireData {
  game: StoredGame | null;
  draw: DrawCount;
  /** View → Timer: whether the clock is on screen. */
  timer: boolean;
}

export const DEFAULT_DATA: SolitaireData = { game: null, draw: 1, timer: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** A list of card ids, or null if any of it is not one. */
function readPile(value: unknown): Card[] | null {
  if (!Array.isArray(value)) return null;
  const cards: Card[] = [];
  for (const entry of value) {
    const card = cardOf(entry);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

function readPiles(value: unknown, expected: number): Card[][] | null {
  if (!Array.isArray(value) || value.length !== expected) return null;
  const piles: Card[][] = [];
  for (const entry of value) {
    const pile = readPile(entry);
    if (!pile) return null;
    piles.push(pile);
  }
  return piles;
}

/** The table as it comes back, or null when the file does not describe one. */
export function readTable(raw: unknown): Table | null {
  if (!isRecord(raw)) return null;
  const stock = readPile(raw.stock);
  const waste = readPile(raw.waste);
  const foundations = readPiles(raw.foundations, FOUNDATIONS);
  if (!stock || !waste || !foundations) return null;
  if (!Array.isArray(raw.tableau) || raw.tableau.length !== TABLEAU_PILES) return null;
  const tableau: Array<{ down: Card[]; up: Card[] }> = [];
  for (const entry of raw.tableau) {
    if (!isRecord(entry)) return null;
    const down = readPile(entry.down);
    const up = readPile(entry.up);
    if (!down || !up) return null;
    tableau.push({ down, up });
  }
  const table: Table = { stock, waste, foundations, tableau };
  return isWholePack(table) ? table : null;
}

/** Every card in the pack, on the table, exactly once. */
export function isWholePack(table: Table): boolean {
  const seen = new Set<number>();
  const count = (cards: readonly Card[]) => {
    for (const card of cards) seen.add(card.id);
  };
  count(table.stock);
  count(table.waste);
  table.foundations.forEach(count);
  table.tableau.forEach((pile) => {
    count(pile.down);
    count(pile.up);
  });
  const total =
    table.stock.length +
    table.waste.length +
    table.foundations.reduce((n, pile) => n + pile.length, 0) +
    table.tableau.reduce((n, pile) => n + pile.down.length + pile.up.length, 0);
  return seen.size === DECK_SIZE && total === DECK_SIZE;
}

export function normalizeData(raw: unknown): SolitaireData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  return {
    game: readGame(raw.game),
    draw: isDrawCount(raw.draw) ? raw.draw : DEFAULT_DATA.draw,
    timer: raw.timer !== false,
  };
}

function readGame(raw: unknown): StoredGame | null {
  if (!isRecord(raw)) return null;
  const table = readTable(raw);
  if (!table) return null;
  return {
    seed: readCount(raw.seed),
    moves: readCount(raw.moves),
    recycles: readCount(raw.recycles),
    seconds: readCount(raw.seconds),
    ...toPiles(table),
  };
}

function ids(cards: readonly Card[]): number[] {
  return cards.map((card) => card.id);
}

function toPiles(table: Table): Pick<StoredGame, 'stock' | 'waste' | 'foundations' | 'tableau'> {
  return {
    stock: ids(table.stock),
    waste: ids(table.waste),
    foundations: table.foundations.map(ids),
    tableau: table.tableau.map((pile) => ({ down: ids(pile.down), up: ids(pile.up) })),
  };
}

/** The game as it goes to disk. */
export function toStored(game: Game, seconds: number): StoredGame {
  return {
    seed: game.seed,
    moves: game.moves,
    recycles: game.recycles,
    seconds: Math.max(0, Math.floor(seconds)),
    ...toPiles(game.table),
  };
}

export interface RestoredGame {
  game: Game;
  seconds: number;
}

/** The game as it comes back, with an empty undo history. */
export function fromStored(stored: StoredGame | null, draw: DrawCount): RestoredGame | null {
  if (!stored) return null;
  const table = readTable(stored);
  if (!table) return null;
  return {
    game: {
      seed: stored.seed,
      draw,
      table,
      recycles: stored.recycles,
      moves: stored.moves,
      past: [],
    },
    seconds: stored.seconds,
  };
}
