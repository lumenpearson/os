import { describe, expect, it } from 'vitest';
import { foundationSlot, STOCK, tableauSlot, WASTE } from './deal';
import { card, hand, pile, table } from './fixture';
import {
  canDraw,
  canMove,
  canRecycle,
  canStackOnFoundation,
  canStackOnTableau,
  DRAW_COUNTS,
  foundationFor,
  hasMove,
  isDrawCount,
  isRun,
  isWon,
  lift,
  liftableFrom,
  PASSES_DRAWING_THREE,
  recycleLimit,
  targetsFor,
} from './rules';

describe('stacking on a tableau pile', () => {
  it('takes one rank down in the other colour', () => {
    expect(canStackOnTableau(card('9H'), card('TS'))).toBe(true);
    expect(canStackOnTableau(card('9D'), card('TC'))).toBe(true);
  });

  it('refuses the same colour', () => {
    expect(canStackOnTableau(card('9H'), card('TD'))).toBe(false);
    expect(canStackOnTableau(card('9S'), card('TC'))).toBe(false);
  });

  it('refuses anything but one rank down', () => {
    expect(canStackOnTableau(card('8H'), card('TS'))).toBe(false);
    expect(canStackOnTableau(card('JH'), card('TS'))).toBe(false);
    expect(canStackOnTableau(card('TH'), card('TS'))).toBe(false);
  });

  it('lets only a king onto an empty pile', () => {
    expect(canStackOnTableau(card('KS'), null)).toBe(true);
    expect(canStackOnTableau(card('KH'), null)).toBe(true);
    expect(canStackOnTableau(card('QS'), null)).toBe(false);
    expect(canStackOnTableau(card('AS'), null)).toBe(false);
  });
});

describe('stacking on a foundation', () => {
  it('starts at the ace and goes up in one suit', () => {
    expect(canStackOnFoundation(card('AS'), null)).toBe(true);
    expect(canStackOnFoundation(card('2S'), card('AS'))).toBe(true);
    expect(canStackOnFoundation(card('KS'), card('QS'))).toBe(true);
  });

  it('refuses another suit, a skipped rank, and a second ace', () => {
    expect(canStackOnFoundation(card('2H'), card('AS'))).toBe(false);
    expect(canStackOnFoundation(card('3S'), card('AS'))).toBe(false);
    expect(canStackOnFoundation(card('AH'), card('AS'))).toBe(false);
    expect(canStackOnFoundation(card('2S'), null)).toBe(false);
  });
});

describe('isRun', () => {
  it('holds for a descending, alternating sequence', () => {
    expect(isRun(hand('KS QH JC TD'))).toBe(true);
    expect(isRun(hand('7D'))).toBe(true);
    expect(isRun([])).toBe(true);
  });

  it('fails on a repeated colour or a broken rank', () => {
    expect(isRun(hand('KS QC'))).toBe(false);
    expect(isRun(hand('KS JH'))).toBe(false);
    expect(isRun(hand('QH KS'))).toBe(false);
  });
});

describe('lifting cards off a pile', () => {
  const board = table({
    stock: '4C 5C',
    waste: 'AS 9H',
    foundations: ['AD'],
    tableau: [pile('2H 3H', 'KS QH JC')],
  });

  it('never lifts from the stock', () => {
    expect(lift(board, STOCK, 1)).toBeNull();
  });

  it('lifts only the top card of the waste and of a foundation', () => {
    expect(lift(board, WASTE, 1)?.map((c) => c.id)).toEqual([card('9H').id]);
    expect(lift(board, WASTE, 2)).toBeNull();
    expect(lift(board, foundationSlot(0), 1)?.map((c) => c.id)).toEqual([card('AD').id]);
    expect(lift(board, foundationSlot(1), 1)).toBeNull();
  });

  it('lifts a run off a tableau pile, bottom first', () => {
    expect(lift(board, tableauSlot(0), 2)?.map((c) => c.id)).toEqual([
      card('QH').id,
      card('JC').id,
    ]);
    expect(lift(board, tableauSlot(0), 3)).toHaveLength(3);
  });

  it('will not reach past the face-up cards or take a nonsense count', () => {
    expect(lift(board, tableauSlot(0), 4)).toBeNull();
    expect(lift(board, tableauSlot(0), 0)).toBeNull();
    expect(lift(board, tableauSlot(0), -1)).toBeNull();
    expect(lift(board, tableauSlot(0), 1.5)).toBeNull();
  });

  it('refuses a face-up section that is not a run', () => {
    const broken = table({ tableau: [pile('', 'KS 5D')] });
    expect(lift(broken, tableauSlot(0), 2)).toBeNull();
    expect(lift(broken, tableauSlot(0), 1)).not.toBeNull();
  });

  it('counts what a pile can lift', () => {
    expect(liftableFrom(board, 0)).toBe(3);
    expect(liftableFrom(board, 1)).toBe(0);
  });
});

describe('canMove', () => {
  const board = table({
    waste: '9H',
    foundations: ['AS 2S'],
    tableau: [pile('', 'TS'), pile('', ''), pile('2C', '3S'), pile('', 'KD QS')],
  });

  it('moves a run onto a card one down in the other colour', () => {
    expect(canMove(board, { from: tableauSlot(3), to: tableauSlot(0), count: 1 })).toBe(false);
    expect(canMove(board, { from: WASTE, to: tableauSlot(0), count: 1 })).toBe(true);
  });

  it('lets only a king onto the empty column', () => {
    expect(canMove(board, { from: WASTE, to: tableauSlot(1), count: 1 })).toBe(false);
    expect(canMove(board, { from: tableauSlot(3), to: tableauSlot(1), count: 2 })).toBe(true);
  });

  it('takes one card at a time onto a foundation, in suit and in order', () => {
    const withThree = table({ waste: '3S', foundations: ['AS 2S'] });
    expect(canMove(withThree, { from: WASTE, to: foundationSlot(0), count: 1 })).toBe(true);
    expect(canMove(board, { from: WASTE, to: foundationSlot(0), count: 1 })).toBe(false);
    expect(canMove(board, { from: tableauSlot(3), to: foundationSlot(1), count: 2 })).toBe(false);
  });

  it('refuses the stock and the waste as a destination, and a move onto itself', () => {
    expect(canMove(board, { from: WASTE, to: STOCK, count: 1 })).toBe(false);
    expect(canMove(board, { from: tableauSlot(0), to: WASTE, count: 1 })).toBe(false);
    expect(canMove(board, { from: WASTE, to: WASTE, count: 1 })).toBe(false);
  });

  it('refuses a pile that is not on the table', () => {
    expect(canMove(board, { from: WASTE, to: tableauSlot(9), count: 1 })).toBe(false);
    expect(canMove(board, { from: WASTE, to: foundationSlot(9), count: 1 })).toBe(false);
  });

  it('takes a card back off a foundation', () => {
    const back = table({ foundations: ['AS 2S'], tableau: [pile('', '3H')] });
    expect(canMove(back, { from: foundationSlot(0), to: tableauSlot(0), count: 1 })).toBe(true);
  });
});

describe('targetsFor', () => {
  it('lists every pile that would take the cards, foundations first', () => {
    const board = table({
      waste: '2S',
      foundations: ['AS'],
      tableau: [pile('', '3H'), pile('', '3D'), pile('', '')],
    });
    const targets = targetsFor(board, WASTE, 1).map((slot) => `${slot.kind}-${slot.index}`);
    expect(targets).toEqual(['foundation-0', 'tableau-0', 'tableau-1']);
  });

  it('is empty when nothing takes the card', () => {
    const board = table({ waste: '7S', tableau: [pile('', '7H')] });
    expect(targetsFor(board, WASTE, 1)).toEqual([]);
  });
});

describe('foundationFor', () => {
  it('finds the pile that continues the suit', () => {
    const board = table({ foundations: ['AS', 'AH'] });
    expect(foundationFor(board, card('2H'))?.index).toBe(1);
    expect(foundationFor(board, card('2S'))?.index).toBe(0);
    expect(foundationFor(board, card('3S'))).toBeNull();
  });

  it('sends an ace to the first empty foundation, so they fill left to right', () => {
    const board = table({ foundations: ['AS'] });
    expect(foundationFor(board, card('AD'))?.index).toBe(1);
    expect(foundationFor(table(), card('AC'))?.index).toBe(0);
  });

  it('has nowhere to send a card when every foundation is busy', () => {
    const full = table({ foundations: ['AS', 'AH', 'AD', 'AC'] });
    expect(foundationFor(full, card('KS'))).toBeNull();
  });
});

describe('the stock', () => {
  it('can be drawn from while it has cards', () => {
    expect(canDraw(table({ stock: '4C' }))).toBe(true);
    expect(canDraw(table())).toBe(false);
  });

  it('turns the waste back over when the stock is empty', () => {
    const spent = table({ waste: '4C 5D' });
    expect(canRecycle(spent, 1, 0)).toBe(true);
    expect(canRecycle(table({ stock: '4C', waste: '5D' }), 1, 0)).toBe(false);
    expect(canRecycle(table(), 1, 0)).toBe(false);
  });

  it('does not bound the passes when one card is turned at a time', () => {
    const spent = table({ waste: '4C' });
    expect(recycleLimit(1)).toBe(Number.POSITIVE_INFINITY);
    expect(canRecycle(spent, 1, 99)).toBe(true);
  });

  it('bounds the passes when three are turned', () => {
    const spent = table({ waste: '4C' });
    expect(recycleLimit(3)).toBe(PASSES_DRAWING_THREE - 1);
    expect(canRecycle(spent, 3, 0)).toBe(true);
    expect(canRecycle(spent, 3, 1)).toBe(true);
    expect(canRecycle(spent, 3, 2)).toBe(false);
  });

  it('knows which draw settings exist', () => {
    expect(DRAW_COUNTS).toEqual([1, 3]);
    expect(isDrawCount(1)).toBe(true);
    expect(isDrawCount(3)).toBe(true);
    expect(isDrawCount(2)).toBe(false);
    expect(isDrawCount('3')).toBe(false);
  });
});

describe('hasMove', () => {
  it('is true while there is anything left to turn', () => {
    expect(hasMove(table({ stock: '4C' }), 1, 0)).toBe(true);
    expect(hasMove(table({ waste: '4C' }), 1, 0)).toBe(true);
  });

  it('is true when a card on the table can be played', () => {
    const board = table({ tableau: [pile('', '9H'), pile('', 'TS')] });
    expect(hasMove(board, 3, 2)).toBe(true);
  });

  it('is false when nothing can be turned or played', () => {
    const stuck = table({
      tableau: [pile('', '9H'), pile('', '7S'), pile('', '5D'), pile('', '3C')],
    });
    expect(hasMove(stuck, 3, 2)).toBe(false);
  });

  it('does not count shuffling a bare king between empty columns as a move', () => {
    const idle = table({ tableau: [pile('', 'KS QH'), pile('', '')] });
    expect(hasMove(idle, 3, 2)).toBe(false);
  });
});

describe('isWon', () => {
  it('needs all four foundations filled to the king', () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
    const codes = 'A 2 3 4 5 6 7 8 9 T J Q K'.split(' ');
    const full = table({
      foundations: suits.map((suit) => codes.map((r) => `${r}${suit[0]?.toUpperCase()}`).join(' ')),
    });
    expect(isWon(full)).toBe(true);
    expect(isWon(table())).toBe(false);
    expect(isWon(table({ foundations: ['AS'] }))).toBe(false);
  });
});
