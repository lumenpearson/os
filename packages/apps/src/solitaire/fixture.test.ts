import { describe, expect, it } from 'vitest';
import { SUIT_SIGN, shortName } from './cards';
import { card, hand, pile, table } from './fixture';

describe('card', () => {
  it('reads rank and suit, with T for ten', () => {
    expect(shortName(card('AS'))).toBe(`A${SUIT_SIGN.spades}`);
    expect(shortName(card('TD'))).toBe(`10${SUIT_SIGN.diamonds}`);
    expect(card('KH').rank).toBe(13);
    expect(card('2c').suit).toBe('clubs');
  });

  it('gives back the one card object with that id', () => {
    expect(card('AS')).toBe(card('AS'));
  });

  it('throws on anything that is not a card', () => {
    expect(() => card('1S')).toThrow(/not a card/);
    expect(() => card('AX')).toThrow(/not a card/);
    expect(() => card('')).toThrow(/not a card/);
  });
});

describe('hand and table', () => {
  it('reads a list of cards bottom first', () => {
    expect(hand('KS QH JC').map(shortName)).toEqual([
      `K${SUIT_SIGN.spades}`,
      `Q${SUIT_SIGN.hearts}`,
      `J${SUIT_SIGN.clubs}`,
    ]);
    expect(hand('')).toEqual([]);
  });

  it('leaves every pile a test does not mention empty', () => {
    const built = table({ waste: 'AS', tableau: [pile('2H', 'KD')] });
    expect(built.waste.map(shortName)).toEqual([`A${SUIT_SIGN.spades}`]);
    expect(built.stock).toEqual([]);
    expect(built.foundations).toHaveLength(4);
    expect(built.tableau).toHaveLength(7);
    expect(built.tableau[0]?.down).toHaveLength(1);
    expect(built.tableau[1]).toEqual({ down: [], up: [] });
  });
});
