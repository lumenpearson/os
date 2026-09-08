import { describe, expect, it } from 'vitest';
import { deck } from './cards';
import { allCards, layOut } from './deal';
import { table } from './fixture';
import { newGame } from './game';
import {
  DEFAULT_DATA,
  fromStored,
  isWholePack,
  normalizeData,
  readTable,
  type StoredGame,
  toStored,
} from './storage';

const stored = (): StoredGame => toStored(newGame(77, 1), 42);

describe('toStored and fromStored', () => {
  it('writes the piles as card ids and reads them back the same', () => {
    const game = newGame(77, 3);
    const back = fromStored(toStored(game, 12), 3);
    expect(back).not.toBeNull();
    expect(allCards(back?.game.table ?? table()).map((c) => c.id)).toEqual(
      allCards(game.table).map((c) => c.id),
    );
    expect(back?.seconds).toBe(12);
    expect(back?.game.draw).toBe(3);
  });

  it('keeps the seed, the move count and the passes made', () => {
    const game = { ...newGame(5, 1), moves: 9, recycles: 2 };
    const back = fromStored(toStored(game, 0), 1);
    expect(back?.game.seed).toBe(5);
    expect(back?.game.moves).toBe(9);
    expect(back?.game.recycles).toBe(2);
  });

  it('comes back with nothing to undo — history belongs to a sitting', () => {
    expect(fromStored(stored(), 1)?.game.past).toEqual([]);
  });

  it('rounds the clock down to whole seconds and never below zero', () => {
    expect(toStored(newGame(1, 1), 9.8).seconds).toBe(9);
    expect(toStored(newGame(1, 1), -4).seconds).toBe(0);
  });

  it('has nothing to restore when there is nothing saved', () => {
    expect(fromStored(null, 1)).toBeNull();
  });
});

describe('readTable', () => {
  it('refuses a table that is missing a card', () => {
    const short = { ...stored(), stock: stored().stock.slice(1) };
    expect(readTable(short)).toBeNull();
    expect(fromStored(short, 1)).toBeNull();
  });

  it('refuses a table with a card on it twice', () => {
    const base = stored();
    const doubled = { ...base, waste: [base.stock[0] as number] };
    expect(readTable(doubled)).toBeNull();
  });

  it('refuses ids that are not cards', () => {
    expect(readTable({ ...stored(), waste: [99] })).toBeNull();
    expect(readTable({ ...stored(), waste: ['AS'] })).toBeNull();
  });

  it('refuses the wrong number of piles', () => {
    expect(readTable({ ...stored(), foundations: [[], [], []] })).toBeNull();
    expect(readTable({ ...stored(), tableau: stored().tableau.slice(1) })).toBeNull();
  });

  it('refuses a tableau pile that is not two lists', () => {
    const base = stored();
    expect(readTable({ ...base, tableau: [...base.tableau.slice(1), { down: [] }] })).toBeNull();
    expect(readTable({ ...base, tableau: [...base.tableau.slice(1), 3] })).toBeNull();
  });

  it('refuses anything that is not a table at all', () => {
    expect(readTable(null)).toBeNull();
    expect(readTable('a game')).toBeNull();
    expect(readTable({})).toBeNull();
  });
});

describe('isWholePack', () => {
  it('holds for a fresh deal and fails when a card is missing', () => {
    const dealt = layOut(deck());
    expect(isWholePack(dealt)).toBe(true);
    expect(isWholePack({ ...dealt, stock: dealt.stock.slice(1) })).toBe(false);
  });
});

describe('normalizeData', () => {
  it('falls back to the defaults for a file that is not this file', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('nonsense')).toEqual(DEFAULT_DATA);
    expect(normalizeData({})).toEqual(DEFAULT_DATA);
  });

  it('keeps a draw setting that exists and drops one that does not', () => {
    expect(normalizeData({ draw: 3 }).draw).toBe(3);
    expect(normalizeData({ draw: 2 }).draw).toBe(1);
    expect(normalizeData({ draw: 'three' }).draw).toBe(1);
  });

  it('leaves the timer on unless the file turns it off', () => {
    expect(normalizeData({}).timer).toBe(true);
    expect(normalizeData({ timer: false }).timer).toBe(false);
    expect(normalizeData({ timer: 'no' }).timer).toBe(true);
  });

  it('keeps a saved game and drops a broken one', () => {
    const good = normalizeData({ game: stored() });
    expect(good.game).not.toBeNull();
    expect(normalizeData({ game: { ...stored(), stock: [1, 1] } }).game).toBeNull();
    expect(normalizeData({ game: 5 }).game).toBeNull();
  });

  it('repairs counts that are not counts', () => {
    const odd = normalizeData({ game: { ...stored(), moves: -3, seconds: Number.NaN } });
    expect(odd.game?.moves).toBe(0);
    expect(odd.game?.seconds).toBe(0);
  });
});
