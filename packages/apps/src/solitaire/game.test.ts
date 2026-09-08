import { describe, expect, it } from 'vitest';
import { shortName } from './cards';
import type { Table } from './deal';
import { allCards, foundationSlot, STOCK, tableauSlot, WASTE } from './deal';
import { hand, pile, table } from './fixture';
import { canUndo, flipExposed, type Game, MAX_UNDO, newGame, reduce, tableFor, won } from './game';
import type { DrawCount } from './rules';

const gameOn = (board: Table, draw: DrawCount = 1): Game => ({
  seed: 1,
  draw,
  table: board,
  recycles: 0,
  moves: 0,
  past: [],
});

const show = (cards: readonly Parameters<typeof shortName>[0][]) => cards.map(shortName);

describe('newGame', () => {
  it('deals a whole pack and nothing else', () => {
    const game = newGame(99, 1);
    expect(allCards(game.table)).toHaveLength(52);
    expect(game.moves).toBe(0);
    expect(game.past).toEqual([]);
    expect(game.recycles).toBe(0);
  });

  it('deals the same table from the same seed', () => {
    expect(allCards(tableFor(7)).map((c) => c.id)).toEqual(allCards(tableFor(7)).map((c) => c.id));
    expect(allCards(tableFor(7)).map((c) => c.id)).not.toEqual(
      allCards(tableFor(8)).map((c) => c.id),
    );
  });
});

describe('drawing', () => {
  it('turns one card face up onto the waste', () => {
    const game = gameOn(table({ stock: '2C 3C 4C' }), 1);
    const next = reduce(game, { type: 'draw' });
    expect(show(next.table.waste)).toEqual(['4♣']);
    expect(show(next.table.stock)).toEqual(['2♣', '3♣']);
    expect(next.moves).toBe(1);
    expect(canUndo(next)).toBe(true);
  });

  it('turns three at a time, the last one on top', () => {
    const game = gameOn(table({ stock: '2C 3C 4C 5C' }), 3);
    const next = reduce(game, { type: 'draw' });
    expect(show(next.table.waste)).toEqual(['5♣', '4♣', '3♣']);
    expect(show(next.table.stock)).toEqual(['2♣']);
  });

  it('turns whatever is left when the stock is shorter than the draw', () => {
    const game = gameOn(table({ stock: '2C 3C' }), 3);
    const next = reduce(game, { type: 'draw' });
    expect(show(next.table.waste)).toEqual(['3♣', '2♣']);
    expect(next.table.stock).toEqual([]);
  });

  it('turns the waste back over in the order it was drawn', () => {
    const start = gameOn(table({ stock: '2C 3C 4C' }), 1);
    let game = start;
    for (let i = 0; i < 3; i += 1) game = reduce(game, { type: 'draw' });
    expect(show(game.table.waste)).toEqual(['4♣', '3♣', '2♣']);
    const recycled = reduce(game, { type: 'draw' });
    expect(recycled.table.waste).toEqual([]);
    expect(recycled.recycles).toBe(1);
    // The next card off the stock is the one drawn first last time round.
    expect(show(reduce(recycled, { type: 'draw' }).table.waste)).toEqual(['4♣']);
  });

  it('stops recycling once the passes run out on a three-card draw', () => {
    const spent = { ...gameOn(table({ waste: '2C' }), 3), recycles: 2 };
    expect(reduce(spent, { type: 'draw' })).toBe(spent);
    const first = { ...spent, recycles: 1 };
    expect(reduce(first, { type: 'draw' })).not.toBe(first);
  });

  it('does nothing at all when there is nothing to turn', () => {
    const empty = gameOn(table({ tableau: [pile('', 'KS')] }));
    expect(reduce(empty, { type: 'draw' })).toBe(empty);
  });
});

describe('moving', () => {
  it('carries a run onto a card one down in the other colour', () => {
    const game = gameOn(table({ tableau: [pile('', 'KS QH JC'), pile('', 'KC')] }));
    const next = reduce(game, {
      type: 'move',
      move: { from: tableauSlot(0), to: tableauSlot(1), count: 2 },
    });
    expect(show(next.table.tableau[0]?.up ?? [])).toEqual(['K♠']);
    expect(show(next.table.tableau[1]?.up ?? [])).toEqual(['K♣', 'Q♥', 'J♣']);
    expect(next.moves).toBe(1);
  });

  it('turns over the card a move uncovered', () => {
    const game = gameOn(table({ tableau: [pile('7D 5H', '3S'), pile('', '4H')] }));
    const next = reduce(game, {
      type: 'move',
      move: { from: tableauSlot(0), to: tableauSlot(1), count: 1 },
    });
    expect(show(next.table.tableau[0]?.up ?? [])).toEqual(['5♥']);
    expect(show(next.table.tableau[0]?.down ?? [])).toEqual(['7♦']);
  });

  it('sends a card home and takes it off the waste', () => {
    const game = gameOn(table({ waste: '9H AS' }));
    const next = reduce(game, {
      type: 'move',
      move: { from: WASTE, to: foundationSlot(0), count: 1 },
    });
    expect(show(next.table.foundations[0] ?? [])).toEqual(['A♠']);
    expect(show(next.table.waste)).toEqual(['9♥']);
  });

  it('hands back the same game when the move is not legal', () => {
    const game = gameOn(table({ waste: '9H', tableau: [pile('', '9S')] }));
    const same = reduce(game, {
      type: 'move',
      move: { from: WASTE, to: tableauSlot(0), count: 1 },
    });
    expect(same).toBe(game);
    expect(
      reduce(game, { type: 'move', move: { from: STOCK, to: tableauSlot(0), count: 1 } }),
    ).toBe(game);
  });

  it('leaves the pack whole however many moves are played', () => {
    const game = gameOn(table({ tableau: [pile('7D', 'KS QH'), pile('', '')] }));
    const next = reduce(game, {
      type: 'move',
      move: { from: tableauSlot(0), to: tableauSlot(1), count: 2 },
    });
    expect(
      allCards(next.table)
        .map((c) => c.id)
        .sort(),
    ).toEqual(
      allCards(game.table)
        .map((c) => c.id)
        .sort(),
    );
  });
});

describe('sending a card home on a double click', () => {
  it('takes the top card of the waste to its foundation', () => {
    const game = gameOn(table({ waste: '2S', foundations: ['AS'] }));
    const next = reduce(game, { type: 'auto', from: WASTE });
    expect(show(next.table.foundations[0] ?? [])).toEqual(['A♠', '2♠']);
    expect(next.table.waste).toEqual([]);
  });

  it('takes the top card of a column and turns over what was under it', () => {
    const game = gameOn(table({ tableau: [pile('7D', 'AH')] }));
    const next = reduce(game, { type: 'auto', from: tableauSlot(0) });
    expect(show(next.table.foundations[0] ?? [])).toEqual(['A♥']);
    expect(show(next.table.tableau[0]?.up ?? [])).toEqual(['7♦']);
  });

  it('does nothing when the card has nowhere to go', () => {
    const game = gameOn(table({ waste: '5S' }));
    expect(reduce(game, { type: 'auto', from: WASTE })).toBe(game);
  });

  it('does nothing on an empty pile, the stock, or a foundation', () => {
    const game = gameOn(table({ stock: 'AS', foundations: ['AH'] }));
    expect(reduce(game, { type: 'auto', from: STOCK })).toBe(game);
    expect(reduce(game, { type: 'auto', from: foundationSlot(0) })).toBe(game);
    expect(reduce(game, { type: 'auto', from: tableauSlot(2) })).toBe(game);
  });
});

describe('undo', () => {
  it('puts the table back exactly and takes the move off the count', () => {
    const game = gameOn(table({ stock: '2C 3C' }), 1);
    const drawn = reduce(game, { type: 'draw' });
    const back = reduce(drawn, { type: 'undo' });
    expect(back.table).toBe(game.table);
    expect(back.moves).toBe(0);
    expect(back.past).toEqual([]);
  });

  it('puts a pass through the stock back too', () => {
    const game = gameOn(table({ waste: '2C 3C' }), 1);
    const recycled = reduce(game, { type: 'draw' });
    expect(recycled.recycles).toBe(1);
    expect(reduce(recycled, { type: 'undo' }).recycles).toBe(0);
  });

  it('unwinds several moves in turn', () => {
    let game = gameOn(table({ stock: '2C 3C 4C' }), 1);
    const start = game.table;
    game = reduce(game, { type: 'draw' });
    game = reduce(game, { type: 'draw' });
    game = reduce(reduce(game, { type: 'undo' }), { type: 'undo' });
    expect(game.table).toBe(start);
    expect(canUndo(game)).toBe(false);
  });

  it('does nothing when there is nothing to take back', () => {
    const game = gameOn(table({ stock: '2C' }));
    expect(reduce(game, { type: 'undo' })).toBe(game);
  });

  it('keeps the history bounded', () => {
    let game = gameOn(table({ stock: '2C 3C' }), 1);
    for (let i = 0; i < MAX_UNDO + 20; i += 1) game = reduce(game, { type: 'draw' });
    expect(game.past.length).toBeLessThanOrEqual(MAX_UNDO);
  });
});

describe('dealing again', () => {
  it('puts the same deal back, cards and all', () => {
    const game = reduce(newGame(31, 1), { type: 'draw' });
    const again = reduce(game, { type: 'restart' });
    expect(again.seed).toBe(game.seed);
    expect(again.moves).toBe(0);
    expect(allCards(again.table).map((c) => c.id)).toEqual(allCards(tableFor(31)).map((c) => c.id));
  });

  it('takes a new seed for a new deal, keeping the draw setting', () => {
    const game = newGame(31, 3);
    const dealt = reduce(game, { type: 'deal', seed: 32 });
    expect(dealt.seed).toBe(32);
    expect(dealt.draw).toBe(3);
    expect(allCards(dealt.table).map((c) => c.id)).not.toEqual(
      allCards(game.table).map((c) => c.id),
    );
  });

  it('changes the draw setting without disturbing the cards', () => {
    const game = newGame(31, 1);
    const three = reduce(game, { type: 'setDraw', draw: 3 });
    expect(three.draw).toBe(3);
    expect(three.table).toBe(game.table);
    expect(three.past).toEqual([]);
    expect(reduce(three, { type: 'setDraw', draw: 3 })).toBe(three);
  });
});

describe('flipExposed', () => {
  it('turns over the top card of a pile with nothing showing', () => {
    const flipped = flipExposed(table({ tableau: [pile('7D 5H', '')] }));
    expect(show(flipped.tableau[0]?.up ?? [])).toEqual(['5♥']);
    expect(show(flipped.tableau[0]?.down ?? [])).toEqual(['7♦']);
  });

  it('leaves a pile that already shows a card alone', () => {
    const board = table({ tableau: [pile('7D', '3S')] });
    expect(flipExposed(board).tableau[0]).toBe(board.tableau[0]);
  });

  it('leaves an empty column empty', () => {
    const board = table({ tableau: [pile('', '')] });
    expect(flipExposed(board).tableau[0]?.up).toEqual([]);
  });
});

describe('won', () => {
  it('is true only once every foundation is filled', () => {
    const codes = 'A 2 3 4 5 6 7 8 9 T J Q K'.split(' ');
    const full = table({
      foundations: ['S', 'H', 'D', 'C'].map((s) => codes.map((r) => `${r}${s}`).join(' ')),
    });
    expect(won(gameOn(full))).toBe(true);
    expect(won(gameOn(table()))).toBe(false);
  });
});

describe('the cards keep their names through a move', () => {
  it('writes cards the way the tests read them', () => {
    expect(show(hand('AS TD'))).toEqual(['A♠', '10♦']);
  });
});
