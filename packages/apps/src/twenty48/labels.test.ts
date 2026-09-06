import { describe, expect, it } from 'vitest';
import { gameFor, snapshotFor } from './game';
import { boardSummary, cellName, formatMoves, formatScore, statusMessage } from './labels';

const grid = (...rows: number[][]): number[] => rows.flat();

const gameOf = (board: number[], score = 0, moves = 1) =>
  gameFor(snapshotFor(board, score, false, moves));

const playing = grid([2, 4, 0, 0], [0, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 16]);
const dead = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]);
const won = grid([2048, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);

describe('formatScore', () => {
  it('prints a plain count', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(320)).toBe('320');
  });

  it('groups a long one', () => {
    expect(formatScore(120_400)).toBe((120_400).toLocaleString());
  });

  it('refuses to print something that is not a score', () => {
    expect(formatScore(Number.NaN)).toBe('0');
    expect(formatScore(-40)).toBe('0');
  });
});

describe('formatMoves', () => {
  it('counts one move in the singular', () => {
    expect(formatMoves(1)).toBe('1 move');
  });

  it('counts everything else in the plural', () => {
    expect(formatMoves(0)).toBe('0 moves');
    expect(formatMoves(2)).toBe('2 moves');
    expect(formatMoves(1_500)).toBe(`${(1_500).toLocaleString()} moves`);
  });

  it('refuses a count that is not one', () => {
    expect(formatMoves(Number.NaN)).toBe('0 moves');
    expect(formatMoves(-3)).toBe('0 moves');
  });
});

describe('statusMessage', () => {
  it('says how to play before the first move', () => {
    expect(statusMessage(gameOf(playing, 0, 0))).toMatch(/WASD/);
  });

  it('reports the highest tile once play is under way', () => {
    expect(statusMessage(gameOf(playing, 40, 3))).toBe('Highest tile 16.');
  });

  it('says the game is won and that it goes on', () => {
    expect(statusMessage(gameOf(won, 20_000, 400))).toBe('2048 reached. Keep going.');
  });

  it('says the game is over', () => {
    expect(statusMessage(gameOf(dead, 5_000, 500))).toMatch(/No moves left/);
  });

  it('lets the ending outrank the win', () => {
    const finished = dead.slice();
    finished[0] = 2048;
    expect(statusMessage(gameOf(finished, 1, 1))).toMatch(/No moves left/);
  });
});

describe('cellName', () => {
  it('names an empty cell by where it is', () => {
    expect(cellName(gameOf(playing), 2)).toBe('row 1, column 3, empty');
  });

  it('names an occupied cell by its value', () => {
    expect(cellName(gameOf(playing), 0)).toBe('row 1, column 1, 2');
    expect(cellName(gameOf(playing), 15)).toBe('row 4, column 4, 16');
  });
});

describe('boardSummary', () => {
  it('reads the score and the highest tile', () => {
    expect(boardSummary(gameOf(playing, 320))).toBe('Score 320, highest tile 16.');
  });

  it('adds the ending', () => {
    expect(boardSummary(gameOf(dead, 100))).toMatch(/No moves left\.$/);
  });

  it('adds the win', () => {
    expect(boardSummary(gameOf(won, 100))).toMatch(/2048 reached\.$/);
  });
});
