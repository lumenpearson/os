import { describe, expect, it } from 'vitest';
import { emptyBoard } from './board';
import { gameFor, move, type Random, snapshotFor } from './game';
import {
  DEFAULT_DATA,
  fromStored,
  normalizeData,
  recordBest,
  type StoredGame,
  type Twenty48Data,
  toStored,
} from './storage';

const grid = (...rows: number[][]): number[] => rows.flat();

const source = (draws: number[]): Random => {
  let at = 0;
  return () => draws[at++] ?? 0;
};

const board = grid([2, 4, 0, 0], [0, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 16]);

describe('normalizeData', () => {
  it('falls back to the defaults for anything unreadable', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('nonsense')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
    expect(normalizeData({})).toEqual(DEFAULT_DATA);
  });

  it('keeps a valid file exactly', () => {
    const stored: Twenty48Data = {
      best: 12_040,
      game: { board, score: 320, won: false, moves: 21, previous: null },
      showBest: false,
      animations: false,
    };
    expect(normalizeData(stored)).toEqual(stored);
  });

  it('keeps the undo step', () => {
    const previous = { board: emptyBoard(), score: 0, won: false, moves: 20 };
    const parsed = normalizeData({
      game: { board, score: 320, won: true, moves: 21, previous },
    });
    expect(parsed.game?.previous).toEqual(previous);
  });

  it('drops a board that is the wrong size', () => {
    expect(normalizeData({ game: { board: [2, 4], score: 0 } }).game).toBeNull();
    expect(normalizeData({ game: { board: [...board, 2], score: 0 } }).game).toBeNull();
  });

  it('drops a board holding a value no game could make', () => {
    const odd = [...board];
    odd[0] = 6;
    expect(normalizeData({ game: { board: odd, score: 0 } }).game).toBeNull();
    const negative = [...board];
    negative[0] = -2;
    expect(normalizeData({ game: { board: negative, score: 0 } }).game).toBeNull();
    const huge = [...board];
    huge[0] = 2 ** 40;
    expect(normalizeData({ game: { board: huge, score: 0 } }).game).toBeNull();
  });

  it('drops a board that is not an array of numbers', () => {
    expect(normalizeData({ game: { board: 'x'.repeat(16) } }).game).toBeNull();
    const strings = new Array(16).fill('2');
    expect(normalizeData({ game: { board: strings } }).game).toBeNull();
  });

  it('keeps a good board and forgets an unreadable undo step', () => {
    const parsed = normalizeData({
      game: { board, score: 320, moves: 4, previous: { board: [1, 2, 3] } },
    });
    expect(parsed.game?.board).toEqual(board);
    expect(parsed.game?.previous).toBeNull();
  });

  it('pulls a hand-edited score back to a whole count', () => {
    expect(normalizeData({ best: -50 }).best).toBe(0);
    expect(normalizeData({ best: 12.7 }).best).toBe(12);
    expect(normalizeData({ best: 'lots' }).best).toBe(0);
    expect(normalizeData({ best: Number.POSITIVE_INFINITY }).best).toBe(0);
  });

  it('leaves both switches on unless the file turns them off', () => {
    expect(normalizeData({}).showBest).toBe(true);
    expect(normalizeData({ showBest: 'no' }).showBest).toBe(true);
    expect(normalizeData({ showBest: false }).showBest).toBe(false);
    expect(normalizeData({ animations: false }).animations).toBe(false);
  });
});

describe('a game through the file', () => {
  it('comes back the way it went in', () => {
    const game = gameFor(snapshotFor(board, 320, false, 21));
    const back = fromStored(toStored(game));
    expect([...(back?.board ?? [])]).toEqual(board);
    expect(back?.score).toBe(320);
    expect(back?.moves).toBe(21);
  });

  it('brings the undo step with it', () => {
    const start = gameFor(
      snapshotFor(grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])),
    );
    const played = move(start, 'left', source([0.999, 0.5]));
    const back = fromStored(toStored(played));
    expect(back?.previous?.board).toEqual([...start.board]);
    expect(back?.previous?.score).toBe(0);
  });

  it('gives the restored tiles identities that match the board', () => {
    const back = fromStored(toStored(gameFor(snapshotFor(board, 0, false, 0))));
    const drawn = emptyBoard();
    for (const tile of back?.tiles ?? []) drawn[tile.index] = tile.value;
    expect(drawn).toEqual(board);
    expect(back?.spent).toEqual([]);
    expect(back?.spawned).toBeNull();
  });

  it('remembers a game already won', () => {
    const won = grid([2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 2, 0]);
    const stored: StoredGame = { board: won, score: 20_000, won: true, moves: 900, previous: null };
    expect(fromStored(stored)?.won).toBe(true);
  });

  it('has nothing to restore when no game was saved', () => {
    expect(fromStored(null)).toBeNull();
  });
});

describe('recordBest', () => {
  it('takes the higher score', () => {
    const data = { ...DEFAULT_DATA, best: 100 };
    expect(recordBest(data, 250).best).toBe(250);
    expect(recordBest(data, 100)).toBe(data);
    expect(recordBest(data, 40)).toBe(data);
  });

  it('refuses a score that is not one', () => {
    const data = { ...DEFAULT_DATA, best: 100 };
    expect(recordBest(data, Number.NaN)).toBe(data);
    expect(recordBest(data, Number.POSITIVE_INFINITY)).toBe(data);
  });
});
