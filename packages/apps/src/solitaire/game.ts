/**
 * The game around the table: turning the stock over, moving cards, sending one
 * home on a double click, turning over whatever a move uncovered, and taking
 * it all back.
 *
 * Everything here is pure. A move that is not legal returns the game it was
 * given, unchanged and identical, so a stray click cannot corrupt a deal and
 * `previous === next` is a usable test for "nothing happened".
 *
 * Undo keeps whole tables rather than inverse moves. A table is fifty-two
 * references; an inverse move would have to remember which card was turned
 * over and whether the pass through the stock counted, which is exactly the
 * kind of bookkeeping that goes wrong.
 */

import { type Card, createRandom, deck, shuffle } from './cards';
import {
  cardsAt,
  layOut,
  type Slot,
  type Table,
  type TableauPile,
  tableauAt,
  topOf,
  withFoundation,
  withTableau,
} from './deal';
import {
  canDraw,
  canMove,
  canRecycle,
  type DrawCount,
  foundationFor,
  isWon,
  lift,
  type Move,
} from './rules';

/** What undo puts back. The draw setting is not part of it: it is a setting. */
export interface Snapshot {
  readonly table: Table;
  readonly recycles: number;
}

export interface Game {
  /** The shuffle this deal came from, so it can be dealt again exactly. */
  readonly seed: number;
  readonly draw: DrawCount;
  readonly table: Table;
  /** How many times the waste has been turned back into the stock. */
  readonly recycles: number;
  readonly moves: number;
  /** Oldest first; the last one is where undo goes next. */
  readonly past: readonly Snapshot[];
}

/** Undo goes back this far. Beyond it a deal is a different deal. */
export const MAX_UNDO = 500;

export type Action =
  | { readonly type: 'draw' }
  | { readonly type: 'move'; readonly move: Move }
  /** Send the top card of a pile to its foundation — the double click. */
  | { readonly type: 'auto'; readonly from: Slot }
  | { readonly type: 'undo' }
  | { readonly type: 'deal'; readonly seed: number }
  | { readonly type: 'restart' }
  | { readonly type: 'setDraw'; readonly draw: DrawCount };

/** The table a seed deals, every time. */
export function tableFor(seed: number): Table {
  return layOut(shuffle(deck(), createRandom(seed)));
}

export function newGame(seed: number, draw: DrawCount): Game {
  return { seed, draw, table: tableFor(seed), recycles: 0, moves: 0, past: [] };
}

export function canUndo(game: Game): boolean {
  return game.past.length > 0;
}

export function won(game: Game): boolean {
  return isWon(game.table);
}

/**
 * Turn over the card a move uncovered. A tableau pile with cards underneath
 * and nothing showing has exactly one card to turn: the one on top of the
 * face-down part.
 */
export function flipExposed(table: Table): Table {
  let next = table;
  table.tableau.forEach((pile, index) => {
    if (pile.up.length > 0 || pile.down.length === 0) return;
    const turned = pile.down[pile.down.length - 1] as Card;
    next = withTableau(next, index, { down: pile.down.slice(0, -1), up: [turned] });
  });
  return next;
}

/** Take `count` cards off the top of a slot. The caller has checked the move. */
function without(table: Table, slot: Slot, count: number): Table {
  switch (slot.kind) {
    case 'stock':
      return { ...table, stock: table.stock.slice(0, -count) };
    case 'waste':
      return { ...table, waste: table.waste.slice(0, -count) };
    case 'foundation':
      return withFoundation(table, slot.index, cardsAt(table, slot).slice(0, -count));
    case 'tableau': {
      const pile = tableauAt(table, slot.index);
      return withTableau(table, slot.index, { down: pile.down, up: pile.up.slice(0, -count) });
    }
  }
}

/** Put cards, bottom first, on top of a slot. */
function onto(table: Table, slot: Slot, cards: readonly Card[]): Table {
  switch (slot.kind) {
    case 'stock':
      return { ...table, stock: [...table.stock, ...cards] };
    case 'waste':
      return { ...table, waste: [...table.waste, ...cards] };
    case 'foundation':
      return withFoundation(table, slot.index, [...cardsAt(table, slot), ...cards]);
    case 'tableau': {
      const pile: TableauPile = tableauAt(table, slot.index);
      return withTableau(table, slot.index, { down: pile.down, up: [...pile.up, ...cards] });
    }
  }
}

function remember(game: Game, table: Table, recycles: number): Game {
  const past = [...game.past, { table: game.table, recycles: game.recycles }];
  return {
    ...game,
    table,
    recycles,
    moves: game.moves + 1,
    past: past.length > MAX_UNDO ? past.slice(past.length - MAX_UNDO) : past,
  };
}

/**
 * Turn cards from the stock, or turn the waste back over when the stock has
 * run out. Both are one command, because that is the one place on the table a
 * player touches to keep going.
 */
function draw(game: Game): Game {
  const { table } = game;
  if (canDraw(table)) {
    const count = Math.min(game.draw, table.stock.length);
    const turned = table.stock.slice(table.stock.length - count).reverse();
    return remember(
      game,
      { ...table, stock: table.stock.slice(0, -count), waste: [...table.waste, ...turned] },
      game.recycles,
    );
  }
  if (!canRecycle(table, game.draw, game.recycles)) return game;
  // The waste goes back face down in the order it came off, so the next pass
  // sees the same cards in the same order a physical pack would.
  return remember(
    game,
    { ...table, stock: [...table.waste].reverse(), waste: [] },
    game.recycles + 1,
  );
}

function apply(game: Game, move: Move): Game {
  if (!canMove(game.table, move)) return game;
  const carried = lift(game.table, move.from, move.count);
  if (!carried) return game;
  const moved = onto(without(game.table, move.from, move.count), move.to, carried);
  return remember(game, flipExposed(moved), game.recycles);
}

function auto(game: Game, from: Slot): Game {
  const card = topOf(game.table, from);
  if (!card || from.kind === 'stock' || from.kind === 'foundation') return game;
  const to = foundationFor(game.table, card);
  return to ? apply(game, { from, to, count: 1 }) : game;
}

function undo(game: Game): Game {
  const last = game.past[game.past.length - 1];
  if (!last) return game;
  return {
    ...game,
    table: last.table,
    recycles: last.recycles,
    moves: Math.max(0, game.moves - 1),
    past: game.past.slice(0, -1),
  };
}

export function reduce(game: Game, action: Action): Game {
  switch (action.type) {
    case 'draw':
      return draw(game);
    case 'move':
      return apply(game, action.move);
    case 'auto':
      return auto(game, action.from);
    case 'undo':
      return undo(game);
    case 'deal':
      return newGame(action.seed, game.draw);
    case 'restart':
      return newGame(game.seed, game.draw);
    case 'setDraw':
      // The setting applies from the next turn of the stock. The cards stay
      // where they are: changing how many are turned is not a new deal.
      return action.draw === game.draw ? game : { ...game, draw: action.draw };
  }
}
