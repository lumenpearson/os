import { describe, expect, it } from 'vitest';
import type { Table } from './deal';
import { foundationSlot, STOCK, tableauSlot, WASTE } from './deal';
import { card, pile, table } from './fixture';
import type { Game } from './game';
import { newGame } from './game';
import {
  cardLabel,
  cardName,
  emptyLabel,
  faceDownCount,
  formatClock,
  formatMoves,
  pileSummary,
  slotName,
  statusLine,
  stockLabel,
} from './labels';
import type { DrawCount } from './rules';

const gameOn = (board: Table, draw: DrawCount = 1, recycles = 0): Game => ({
  ...newGame(1, draw),
  table: board,
  recycles,
});

describe('names', () => {
  it('speaks a card in full', () => {
    expect(cardName(card('AS'))).toBe('Ace of spades');
    expect(cardName(card('TD'))).toBe('10 of diamonds');
  });

  it('names every kind of pile', () => {
    expect(slotName(STOCK)).toBe('Stock');
    expect(slotName(WASTE)).toBe('Waste');
    expect(slotName(foundationSlot(0))).toBe('Foundation 1');
    expect(slotName(tableauSlot(3))).toBe('Column 4');
  });

  it('says where a card is, and says nothing about one face down', () => {
    expect(cardLabel(card('AS'), true, tableauSlot(0))).toBe('Ace of spades, Column 1');
    expect(cardLabel(card('AS'), false, tableauSlot(0))).toBe('Face down card, Column 1');
  });

  it('says what an empty pile is waiting for', () => {
    expect(emptyLabel(tableauSlot(2))).toMatch(/king/);
    expect(emptyLabel(foundationSlot(1))).toMatch(/ace/);
    expect(emptyLabel(WASTE)).toBe('Waste, empty');
  });
});

describe('stockLabel', () => {
  it('says how many are left and how many will turn', () => {
    expect(stockLabel(gameOn(table({ stock: '2C 3C' }), 1))).toBe('Stock, 2 left — turn one');
    expect(stockLabel(gameOn(table({ stock: '2C' }), 3))).toBe('Stock, 1 left — turn three');
  });

  it('offers the waste back when the stock has run out', () => {
    expect(stockLabel(gameOn(table({ waste: '2C' }), 1))).toMatch(/turn the waste over/);
  });

  it('says so when there are no passes left', () => {
    expect(stockLabel(gameOn(table({ waste: '2C' }), 3, 2))).toMatch(/no passes left/);
    expect(stockLabel(gameOn(table(), 1))).toMatch(/no passes left/);
  });
});

describe('the clock and the counter', () => {
  it('writes minutes and seconds, and hours once there are any', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('takes nonsense without printing it', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatMoves(Number.NaN)).toBe('0 moves');
  });

  it('counts one move as a move', () => {
    expect(formatMoves(1)).toBe('1 move');
    expect(formatMoves(0)).toBe('0 moves');
    expect(formatMoves(12)).toBe('12 moves');
  });
});

describe('statusLine', () => {
  it('counts what is home, what is hidden and what is left to turn', () => {
    const board = table({
      stock: '2C 3C',
      foundations: ['AS'],
      tableau: [pile('7D 5H', '3S')],
    });
    expect(faceDownCount(board)).toBe(2);
    expect(statusLine(gameOn(board))).toBe('1 home · 2 face down · 2 in the stock');
  });

  it('says how the game was won', () => {
    const codes = 'A 2 3 4 5 6 7 8 9 T J Q K'.split(' ');
    const full = table({
      foundations: ['S', 'H', 'D', 'C'].map((s) => codes.map((r) => `${r}${s}`).join(' ')),
    });
    expect(statusLine({ ...gameOn(full), moves: 137 })).toBe('Solved in 137 moves.');
  });
});

describe('pileSummary', () => {
  it('says what a column holds and what it shows', () => {
    const board = table({ tableau: [pile('7D 5H', '3S')] });
    expect(pileSummary(board, tableauSlot(0))).toBe('Column 1, 3 cards, 2 face down, showing 3♠');
  });

  it('falls back to what the pile is waiting for when it is empty', () => {
    expect(pileSummary(table(), tableauSlot(1))).toMatch(/king/);
    expect(pileSummary(table({ waste: '2C 3C' }), WASTE)).toBe('Waste, 2 cards');
  });
});
