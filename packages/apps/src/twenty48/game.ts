/**
 * The game around the board: tiles with identities, the tile that appears
 * after every move, the score, the win at 2048, and one step of undo.
 *
 * Tiles carry ids so the screen can move them rather than redraw them. A move
 * follows every tile through its shift: the tile that was already at the
 * leading edge of a merge keeps its id and doubles, and the one that ran into
 * it is handed back in `spent`, parked on the destination so it can slide in
 * underneath before it is dropped.
 *
 * Everything here is pure, and randomness arrives as an argument, so a game is
 * reproducible and the tests do not guess.
 */

import {
  type Board,
  type Direction,
  emptyBoard,
  emptyCells,
  hasMoves,
  maxTile,
  slideBoard,
  valueAt,
} from './board';

/** A source of floats in [0, 1); `Math.random` in the app, a stub in tests. */
export type Random = () => number;

/** The tile that ends the game as a goal — and does not end it as a game. */
export const WIN_VALUE = 2048;

/** One move in ten puts down a 4 instead of a 2. */
export const FOUR_CHANCE = 0.1;

export interface Tile {
  readonly id: number;
  readonly value: number;
  /** Where it sits on the board, 0 to 15. */
  readonly index: number;
}

/** Everything undo has to put back. */
export interface Snapshot {
  readonly board: Board;
  readonly tiles: readonly Tile[];
  readonly score: number;
  /** True once a 2048 has been made; play carries on. */
  readonly won: boolean;
  readonly moves: number;
  readonly nextId: number;
}

export interface GameState extends Snapshot {
  /** Tiles absorbed by the last move, already at their destination. */
  readonly spent: readonly Tile[];
  /** Ids of the tiles the last move doubled. */
  readonly merged: readonly number[];
  /** Id of the tile the last move put down, if any. */
  readonly spawned: number | null;
  /** The position before the last move — one step of undo, no more. */
  readonly previous: Snapshot | null;
}

/** An integer in [0, bound), safe against a random source that misbehaves. */
function pick(random: Random, bound: number): number {
  if (bound <= 0) return 0;
  const draw = random();
  if (!Number.isFinite(draw)) return 0;
  return Math.min(bound - 1, Math.max(0, Math.floor(draw * bound)));
}

/** Tiles for a board that has none — loading a saved game, or starting one. */
export function tilesFor(board: Board, startId = 1): { tiles: Tile[]; nextId: number } {
  const tiles: Tile[] = [];
  let nextId = startId;
  board.forEach((value, index) => {
    if (value === 0) return;
    tiles.push({ id: nextId, value, index });
    nextId += 1;
  });
  return { tiles, nextId };
}

export function snapshotFor(board: Board, score = 0, won = false, moves = 0): Snapshot {
  const { tiles, nextId } = tilesFor(board);
  return {
    board: [...board],
    tiles,
    score,
    won: won || maxTile(board) >= WIN_VALUE,
    moves,
    nextId,
  };
}

/** A live game from a snapshot, with nothing animating and nothing to undo. */
export function gameFor(snapshot: Snapshot, previous: Snapshot | null = null): GameState {
  return { ...snapshot, spent: [], merged: [], spawned: null, previous };
}

function snapshotOf(state: GameState): Snapshot {
  const { board, tiles, score, won, moves, nextId } = state;
  return { board, tiles, score, won, moves, nextId };
}

/**
 * Put one tile on a free cell: the cell first, then the value, so a test can
 * read the two draws in that order. Returns the snapshot unchanged when the
 * board is full.
 */
export function spawn(
  snapshot: Snapshot,
  random: Random,
): { snapshot: Snapshot; tile: Tile | null } {
  const free = emptyCells(snapshot.board);
  if (free.length === 0) return { snapshot, tile: null };
  const index = free[pick(random, free.length)] ?? free[0] ?? 0;
  const value = random() < FOUR_CHANCE ? 4 : 2;
  const tile: Tile = { id: snapshot.nextId, value, index };
  const board = [...snapshot.board];
  board[index] = value;
  return {
    snapshot: {
      ...snapshot,
      board,
      tiles: [...snapshot.tiles, tile],
      nextId: snapshot.nextId + 1,
    },
    tile,
  };
}

/** A fresh game: an empty board with the two tiles it opens on. */
export function newGame(random: Random): GameState {
  const start: Snapshot = {
    board: emptyBoard(),
    tiles: [],
    score: 0,
    won: false,
    moves: 0,
    nextId: 1,
  };
  const first = spawn(start, random).snapshot;
  const second = spawn(first, random);
  return { ...gameFor(second.snapshot), spawned: second.tile?.id ?? null };
}

/**
 * Play a move. A move that changes nothing is not a move: the state comes
 * back untouched, no tile appears, and the undo step is left alone.
 */
export function move(state: GameState, direction: Direction, random: Random): GameState {
  const slide = slideBoard(state.board, direction);
  if (!slide.moved) return state;

  const before = snapshotOf(state);
  const held = new Map<number, Tile>();
  for (const tile of state.tiles) held.set(tile.index, tile);

  /** Shifts grouped by where they landed: one arrival, or two on a merge. */
  const arrivals = new Map<number, typeof slide.shifts>();
  for (const shift of slide.shifts) {
    const list = arrivals.get(shift.to);
    if (list) list.push(shift);
    else arrivals.set(shift.to, [shift]);
  }

  const tiles: Tile[] = [];
  const spent: Tile[] = [];
  const merged: number[] = [];
  let nextId = state.nextId;

  for (const [to, shifts] of arrivals) {
    const lead = shifts[0];
    if (!lead) continue;
    const keeper = held.get(lead.from);
    const value = valueAt(slide.board, to);
    const id = keeper?.id ?? nextId++;
    tiles.push({ id, value, index: to });
    if (shifts.length > 1) merged.push(id);
    for (const shift of shifts.slice(1)) {
      const absorbed = held.get(shift.from);
      if (absorbed) spent.push({ ...absorbed, index: to });
    }
  }

  const played: Snapshot = {
    board: slide.board,
    tiles,
    score: state.score + slide.gained,
    won: state.won || maxTile(slide.board) >= WIN_VALUE,
    moves: state.moves + 1,
    nextId,
  };
  const grown = spawn(played, random);

  return {
    ...grown.snapshot,
    spent,
    merged,
    spawned: grown.tile?.id ?? null,
    previous: before,
  };
}

export function canUndo(state: GameState): boolean {
  return state.previous !== null;
}

/** Step back one move. A second undo in a row does nothing. */
export function undo(state: GameState): GameState {
  if (!state.previous) return state;
  return gameFor(state.previous);
}

/** True when no direction changes the board. */
export function isOver(state: GameState): boolean {
  return !hasMoves(state.board);
}

/** The largest tile made so far, which is what a player is really chasing. */
export function highest(state: GameState): number {
  return maxTile(state.board);
}
