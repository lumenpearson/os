/**
 * What the game keeps in ~/.config/2048.json: the best score, the game in
 * progress with its one undo step, and the two View switches.
 *
 * The file is text a user can edit, so nothing read back is trusted. A board
 * has to be sixteen cells of 0 or a power of two before it is played; anything
 * else is dropped and the app deals a new game rather than showing a grid that
 * cannot happen.
 */

import { CELLS } from './board';
import { type GameState, gameFor, type Snapshot, snapshotFor } from './game';

export interface StoredSnapshot {
  board: number[];
  score: number;
  won: boolean;
  moves: number;
}

export interface StoredGame extends StoredSnapshot {
  /** The position before the last move, so Undo survives a restart. */
  previous: StoredSnapshot | null;
}

export interface Twenty48Data {
  best: number;
  game: StoredGame | null;
  /** View → Best Score: whether the best score is on screen. */
  showBest: boolean;
  /** View → Animations: whether tiles slide. */
  animations: boolean;
}

export const DEFAULT_DATA: Twenty48Data = {
  best: 0,
  game: null,
  showBest: true,
  animations: true,
};

/** Above this a value is not a tile any game could have made. */
const MAX_VALUE = 2 ** 17;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isTileValue(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value === 0) return true;
  if (value < 2 || value > MAX_VALUE) return false;
  return Number.isInteger(Math.log2(value));
}

function readBoard(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== CELLS) return null;
  if (!value.every(isTileValue)) return null;
  return value.map((cell) => cell as number);
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function readSnapshot(value: unknown): StoredSnapshot | null {
  if (!isRecord(value)) return null;
  const board = readBoard(value.board);
  if (!board) return null;
  return {
    board,
    score: readCount(value.score),
    won: value.won === true,
    moves: readCount(value.moves),
  };
}

function readGame(value: unknown): StoredGame | null {
  const snapshot = readSnapshot(value);
  if (!snapshot) return null;
  const previous = isRecord(value) ? readSnapshot(value.previous) : null;
  return { ...snapshot, previous };
}

export function normalizeData(raw: unknown): Twenty48Data {
  if (!isRecord(raw)) return DEFAULT_DATA;
  return {
    best: readCount(raw.best),
    game: readGame(raw.game),
    showBest: raw.showBest !== false,
    animations: raw.animations !== false,
  };
}

function storeSnapshot(snapshot: Snapshot): StoredSnapshot {
  return {
    board: [...snapshot.board],
    score: snapshot.score,
    won: snapshot.won,
    moves: snapshot.moves,
  };
}

/** The game as it goes to disk. Tile ids are not kept; they mean nothing later. */
export function toStored(state: GameState): StoredGame {
  return {
    ...storeSnapshot(state),
    previous: state.previous ? storeSnapshot(state.previous) : null,
  };
}

function restoreSnapshot(stored: StoredSnapshot): Snapshot {
  return snapshotFor(stored.board, stored.score, stored.won, stored.moves);
}

/** The game as it comes back, with fresh tile ids. Null when there was none. */
export function fromStored(stored: StoredGame | null): GameState | null {
  if (!stored) return null;
  return gameFor(
    restoreSnapshot(stored),
    stored.previous ? restoreSnapshot(stored.previous) : null,
  );
}

/** Keep the higher of the two. The best score only ever goes up. */
export function recordBest(data: Twenty48Data, score: number): Twenty48Data {
  if (!Number.isFinite(score) || score <= data.best) return data;
  return { ...data, best: Math.floor(score) };
}
