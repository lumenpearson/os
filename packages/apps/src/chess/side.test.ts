import { describe, expect, it } from 'vitest';
import {
  choiceForSide,
  colorName,
  parseSideChoice,
  SIDE_CHOICES,
  sideChoiceLabel,
  sideFor,
  sideFromAnswer,
} from './side';

describe('the side choice at New Game', () => {
  it('offers White, Black and a draw for it', () => {
    expect(SIDE_CHOICES).toEqual(['white', 'black', 'random']);
    expect(SIDE_CHOICES.map(sideChoiceLabel)).toEqual(['White', 'Black', 'Random']);
  });

  it('reads back only its own answers', () => {
    expect(parseSideChoice('black')).toBe('black');
    expect(parseSideChoice('white')).toBe('white');
    expect(parseSideChoice(null)).toBeNull();
    expect(parseSideChoice('cancel')).toBeNull();
    expect(parseSideChoice('')).toBeNull();
  });

  it('gives the colour that was asked for', () => {
    expect(sideFor('white')).toBe('w');
    expect(sideFor('black')).toBe('b');
  });

  it('draws for White on Random, both ways', () => {
    expect(sideFor('random', () => 0.49)).toBe('w');
    expect(sideFor('random', () => 0.5)).toBe('b');
    expect(sideFor('random', () => 0.99)).toBe('b');
  });

  it('starts no game when the question was dismissed', () => {
    expect(sideFromAnswer(null)).toBeNull();
    expect(sideFromAnswer('nonsense')).toBeNull();
    expect(sideFromAnswer('black')).toBe('b');
    expect(sideFromAnswer('random', () => 0)).toBe('w');
  });

  it('marks the choice the current side came from', () => {
    expect(choiceForSide('w')).toBe('white');
    expect(choiceForSide('b')).toBe('black');
    expect(colorName('w')).toBe('White');
    expect(colorName('b')).toBe('Black');
  });
});
