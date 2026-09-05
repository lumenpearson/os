import { describe, expect, it } from 'vitest';
import { type Board, emptyBoard } from './board';
import {
  canUndo,
  FOUR_CHANCE,
  type GameState,
  gameFor,
  highest,
  isOver,
  move,
  newGame,
  type Random,
  snapshotFor,
  spawn,
  tilesFor,
  undo,
  WIN_VALUE,
} from './game';

const grid = (...rows: number[][]): number[] => rows.flat();

/** A random source that reads a written-down list of draws, in order. */
const source = (draws: number[]): Random => {
  let at = 0;
  return () => draws[at++] ?? 0;
};

/** A source that fails the test if it is asked for anything. */
const never: Random = () => {
  throw new Error('the game drew a random number when it should not have');
};

const gameOf = (board: Board, score = 0): GameState => gameFor(snapshotFor(board, score, false, 0));

describe('tilesFor', () => {
  it('gives every occupied cell an identity, in reading order', () => {
    const { tiles, nextId } = tilesFor(
      grid([0, 2, 0, 0], [0, 0, 4, 0], [0, 0, 0, 0], [0, 0, 0, 8]),
    );
    expect(tiles).toEqual([
      { id: 1, value: 2, index: 1 },
      { id: 2, value: 4, index: 6 },
      { id: 3, value: 8, index: 15 },
    ]);
    expect(nextId).toBe(4);
  });

  it('leaves an empty board with no tiles', () => {
    expect(tilesFor(emptyBoard()).tiles).toEqual([]);
  });
});

describe('spawn', () => {
  it('puts a 2 down nine times in ten', () => {
    const start = snapshotFor(emptyBoard(), 0, false, 0);
    expect(spawn(start, source([0, FOUR_CHANCE])).tile?.value).toBe(2);
    expect(spawn(start, source([0, 0.5])).tile?.value).toBe(2);
    expect(spawn(start, source([0, 0.999])).tile?.value).toBe(2);
  });

  it('puts a 4 down the tenth time', () => {
    const start = snapshotFor(emptyBoard(), 0, false, 0);
    expect(spawn(start, source([0, 0])).tile?.value).toBe(4);
    expect(spawn(start, source([0, 0.099])).tile?.value).toBe(4);
  });

  it('draws the cell first, from the free ones only', () => {
    const start = snapshotFor(
      grid([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]),
      0,
      false,
      0,
    );
    // Twelve cells are free: 4 to 15. The first draw indexes that list.
    expect(spawn(start, source([0, 0.5])).tile?.index).toBe(4);
    expect(spawn(start, source([0.999, 0.5])).tile?.index).toBe(15);
    expect(spawn(start, source([0.5, 0.5])).tile?.index).toBe(10);
  });

  it('writes the tile onto the board and keeps the ids running', () => {
    const start = snapshotFor(emptyBoard(), 0, false, 0);
    const { snapshot, tile } = spawn(start, source([0, 0.5]));
    expect(tile).toEqual({ id: 1, value: 2, index: 0 });
    expect(snapshot.board[0]).toBe(2);
    expect(snapshot.tiles).toEqual([tile]);
    expect(snapshot.nextId).toBe(2);
  });

  it('does nothing on a full board', () => {
    const full = snapshotFor(
      grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]),
      0,
      false,
      0,
    );
    const { snapshot, tile } = spawn(full, never);
    expect(tile).toBeNull();
    expect(snapshot).toBe(full);
  });

  it('survives a random source that returns nonsense', () => {
    const start = snapshotFor(emptyBoard(), 0, false, 0);
    const tile = spawn(start, source([Number.NaN, Number.NaN])).tile;
    expect(tile?.index).toBe(0);
    expect(tile?.value).toBe(2);
  });
});

describe('newGame', () => {
  it('opens with two tiles and no score', () => {
    const game = newGame(source([0, 0.5, 0, 0.5]));
    expect(game.tiles).toHaveLength(2);
    expect(game.board.filter((value) => value !== 0)).toHaveLength(2);
    expect(game.score).toBe(0);
    expect(game.moves).toBe(0);
    expect(game.won).toBe(false);
  });

  it('puts the second tile somewhere the first is not', () => {
    const game = newGame(source([0, 0.5, 0, 0.5]));
    expect(game.tiles.map((tile) => tile.index)).toEqual([0, 1]);
  });

  it('has nothing to undo', () => {
    expect(canUndo(newGame(source([0, 0.5, 0, 0.5])))).toBe(false);
  });
});

describe('move', () => {
  it('refuses a move that changes nothing, without drawing a tile', () => {
    const game = gameOf(grid([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(move(game, 'left', never)).toBe(game);
  });

  it('scores the sum of what it merged', () => {
    const game = gameOf(grid([2, 2, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 100);
    const next = move(game, 'left', source([0, 0.5]));
    expect(next.score).toBe(100 + 4 + 8);
  });

  it('will not merge a tile it just made', () => {
    const game = gameOf(grid([2, 2, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    // The new tile is sent to the far corner so it cannot be mistaken for one.
    const next = move(game, 'left', source([0.999, 0.5]));
    expect(next.board.slice(0, 4)).toEqual([4, 8, 0, 0]);
  });

  it('adds exactly one tile', () => {
    const game = gameOf(grid([0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const next = move(game, 'left', source([0, 0.5]));
    expect(next.board.filter((value) => value !== 0)).toHaveLength(2);
    expect(next.tiles).toHaveLength(2);
    expect(next.spawned).not.toBeNull();
  });

  it('keeps the surviving tile identities', () => {
    const game = gameOf(grid([0, 0, 0, 2], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0]));
    const [first, second] = game.tiles;
    const next = move(game, 'left', source([0.999, 0.5]));
    const moved = next.tiles.filter((tile) => tile.id !== next.spawned);
    expect(moved).toEqual([
      { id: first?.id, value: 2, index: 0 },
      { id: second?.id, value: 4, index: 4 },
    ]);
  });

  it('gives the merged tile the leading identity and hands back the other', () => {
    const game = gameOf(grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const [lead, absorbed] = game.tiles;
    const next = move(game, 'left', source([0.999, 0.5]));
    expect(next.tiles).toContainEqual({ id: lead?.id, value: 4, index: 0 });
    expect(next.merged).toEqual([lead?.id]);
    // The absorbed tile is parked on the destination so it can slide in there.
    expect(next.spent).toEqual([{ id: absorbed?.id, value: 2, index: 0 }]);
  });

  it('leaves the tiles agreeing with the board after every move', () => {
    let game = newGame(source([0, 0.5, 0.5, 0.5]));
    const random = source(Array.from({ length: 400 }, (_, i) => ((i * 37) % 100) / 100));
    for (const direction of ['left', 'up', 'right', 'down', 'left', 'up'] as const) {
      game = move(game, direction, random);
      const drawn = emptyBoard();
      for (const tile of game.tiles) drawn[tile.index] = tile.value;
      expect(drawn).toEqual([...game.board]);
      expect(new Set(game.tiles.map((tile) => tile.id)).size).toBe(game.tiles.length);
    }
  });

  it('counts the moves it made', () => {
    const game = gameOf(grid([0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const one = move(game, 'left', source([0.999, 0.5]));
    const two = move(one, 'down', source([0.999, 0.5]));
    expect(one.moves).toBe(1);
    expect(two.moves).toBe(2);
  });
});

describe('the win', () => {
  it('notices the 2048 and lets the game go on', () => {
    const game = gameOf(grid([1024, 1024, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const next = move(game, 'left', source([0.999, 0.5]));
    expect(next.board[0]).toBe(WIN_VALUE);
    expect(next.won).toBe(true);
    expect(isOver(next)).toBe(false);
    expect(highest(next)).toBe(WIN_VALUE);
  });

  it('stays won for the rest of the game', () => {
    const won = gameOf(grid([2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(won.won).toBe(true);
    expect(move(won, 'right', source([0, 0.5])).won).toBe(true);
  });

  it('is not declared before 2048', () => {
    const game = gameOf(grid([512, 512, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(move(game, 'left', source([0.999, 0.5])).won).toBe(false);
  });
});

describe('the end', () => {
  it('is reached when nothing moves', () => {
    const dead = gameOf(grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]));
    expect(isOver(dead)).toBe(true);
  });

  it('is not reached while a pair still touches', () => {
    const tight = gameOf(grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [32, 32, 64, 128]));
    expect(isOver(tight)).toBe(false);
  });
});

describe('undo', () => {
  it('puts the board and the score back', () => {
    const game = gameOf(grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 40);
    const next = move(game, 'left', source([0.999, 0.5]));
    expect(canUndo(next)).toBe(true);
    const back = undo(next);
    expect([...back.board]).toEqual([...game.board]);
    expect(back.score).toBe(40);
    expect(back.moves).toBe(0);
  });

  it('goes back one move and no further', () => {
    const random = source([0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5]);
    let game = gameOf(grid([0, 0, 0, 2], [0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0]));
    game = move(game, 'left', random);
    const middle = [...game.board];
    game = move(game, 'up', random);
    const back = undo(game);
    expect([...back.board]).toEqual(middle);
    expect(canUndo(back)).toBe(false);
    expect(undo(back)).toBe(back);
  });

  it('drops the animation state, so nothing replays', () => {
    const game = gameOf(grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const back = undo(move(game, 'left', source([0.999, 0.5])));
    expect(back.spent).toEqual([]);
    expect(back.merged).toEqual([]);
    expect(back.spawned).toBeNull();
  });

  it('does nothing on a game that has not moved', () => {
    const game = newGame(source([0, 0.5, 0.5, 0.5]));
    expect(undo(game)).toBe(game);
  });
});
