import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, toFen } from './fen';
import {
  canMove,
  current,
  engineToMove,
  gameFromFen,
  keys,
  moveRows,
  newGame,
  play,
  redo,
  resign,
  restart,
  shown,
  status,
  stepView,
  takeBack,
  toPgn,
  undo,
  view,
} from './game';
import { movesFrom } from './moves';

/** Play a move by its algebraic squares, failing loudly if it is not legal. */
function move(game: ReturnType<typeof newGame>, from: number, to: number) {
  const found = movesFrom(current(game), from).find((m) => m.to === to);
  if (!found) throw new Error('no legal move between those squares');
  return play(game, found);
}

const E2 = 52;
const E4 = 36;
const E7 = 12;
const E5 = 28;
const G1 = 62;
const F3 = 45;

describe('a new game', () => {
  it('starts from the initial position with nothing played', () => {
    const game = newGame();
    expect(toFen(current(game))).toBe(INITIAL_FEN);
    expect(game.played).toHaveLength(0);
    expect(status(game)).toEqual({ kind: 'playing', check: false });
  });

  it('lets White move and does not think it is the engine turn', () => {
    const game = newGame('w');
    expect(canMove(game)).toBe(true);
    expect(engineToMove(game)).toBe(false);
  });

  it('hands the first move to the engine when the person plays Black', () => {
    const game = newGame('b');
    expect(canMove(game)).toBe(false);
    expect(engineToMove(game)).toBe(true);
  });
});

describe('playing moves', () => {
  it('records the notation and the position after each one', () => {
    const game = move(move(newGame(), E2, E4), E7, E5);
    expect(game.played.map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(current(game).turn).toBe('w');
  });

  it('refuses a move that is not legal in this position rather than corrupting the game', () => {
    const game = newGame();
    const illegal = {
      from: E2,
      to: E5,
      piece: 'p',
      color: 'w',
      capture: null,
      promotion: null,
      kind: 'normal',
    } as const;
    expect(play(game, illegal)).toBe(game);
  });

  it('keeps a key for every position, which is what a threefold counts', () => {
    const game = move(move(newGame(), G1, F3), E7, E5);
    expect(keys(game)).toHaveLength(3);
  });
});

describe('taking back', () => {
  it('returns the person their own turn rather than handing it to the engine', () => {
    // White is the person. After 1. e4 e5 it is White to move again; taking
    // back has to drop both plies, or Take Back would just let the engine move.
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const back = takeBack(game);
    expect(back.played).toHaveLength(0);
    expect(current(back).turn).toBe('w');
  });

  it('drops one ply when the engine has not replied yet', () => {
    const game = move(newGame('w'), E2, E4);
    expect(takeBack(game).played).toHaveLength(0);
  });

  it('does nothing on a game with no moves', () => {
    const game = newGame();
    expect(takeBack(game).played).toHaveLength(0);
  });
});

describe('undo and redo', () => {
  it('takes back one ply at a time and puts it back in the order it was played', () => {
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const once = undo(game);
    expect(once.played.map((p) => p.san)).toEqual(['e4']);
    expect(once.undone.map((p) => p.san)).toEqual(['e5']);

    const twice = undo(once);
    expect(twice.played).toHaveLength(0);
    expect(twice.undone.map((p) => p.san)).toEqual(['e4', 'e5']);

    expect(redo(twice).played.map((p) => p.san)).toEqual(['e4']);
    expect(redo(redo(twice)).played.map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(current(redo(redo(twice)))).toEqual(current(game));
  });

  it('holds the engine back while a move is waiting to be replayed', () => {
    // The person plays White. After 1. e4 e5 it is White to move; undoing the
    // reply makes it Black's — the engine's — turn, and if the engine moved on
    // that the undone move could never be redone.
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const back = undo(game);
    expect(current(back).turn).toBe('b');
    expect(engineToMove(back)).toBe(false);
    expect(engineToMove(redo(back))).toBe(false);
    expect(engineToMove(undo(redo(back)))).toBe(false);
  });

  it('lets the engine play again once the person has moved', () => {
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const replayed = move(undo(undo(game)), E2, E4);
    expect(replayed.undone).toHaveLength(0);
    expect(engineToMove(replayed)).toBe(true);
  });

  it('does nothing at either end of the game', () => {
    const game = newGame();
    expect(undo(game)).toBe(game);
    expect(redo(game)).toBe(game);
    const played = move(game, E2, E4);
    expect(redo(played)).toBe(played);
  });

  it('keeps the moves a take back dropped, so Redo can restore them', () => {
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const back = takeBack(game);
    expect(back.played).toHaveLength(0);
    expect(back.undone.map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(redo(redo(back)).played.map((p) => p.san)).toEqual(['e4', 'e5']);
  });

  it('un-resigns a game that is taken back into', () => {
    const game = resign(move(newGame('w'), E2, E4));
    expect(status(game).kind).toBe('resignation');
    expect(status(undo(game)).kind).toBe('playing');
  });
});

describe('restarting', () => {
  it('plays the same game again from its own starting position', () => {
    const setup = gameFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'b', 'club');
    if (typeof setup === 'string') throw new Error(setup);
    const played = undo(move(setup, 60, 61));
    const again = restart(played);
    expect(again.played).toHaveLength(0);
    expect(again.undone).toHaveLength(0);
    expect(again.start).toBe(setup.start);
    expect(again.side).toBe('b');
    expect(again.level).toBe('club');
    expect(status(again).kind).toBe('playing');
  });
});

describe('looking back through the game', () => {
  it('shows the older position without losing the current one', () => {
    const game = move(move(newGame(), E2, E4), E7, E5);
    const looking = view(game, 1);

    expect(toFen(shown(looking))).not.toBe(toFen(current(looking)));
    expect(toFen(current(looking))).toBe(toFen(current(game)));
    // And a person looking at the past may not move in it.
    expect(canMove(looking)).toBe(false);
  });

  it('treats the latest position as not looking back at all', () => {
    const game = move(newGame(), E2, E4);
    expect(view(game, 1).viewing).toBeNull();
  });

  it('clamps stepping past either end', () => {
    const game = move(move(newGame(), E2, E4), E7, E5);
    expect(shown(stepView(view(game, 0), -5))).toEqual(game.start);
    expect(stepView(view(game, 0), 99).viewing).toBeNull();
  });
});

describe('resigning', () => {
  it('gives the win to the other colour', () => {
    const game = resign(newGame('w'));
    expect(status(game)).toEqual({ kind: 'resignation', winner: 'b' });
  });

  it('cannot resign a game that is already over', () => {
    // Fool's mate: White is mated, so resigning must not overwrite the result.
    const mate = gameFromFen(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      'w',
      'casual',
    );
    if (typeof mate === 'string') throw new Error(mate);
    expect(status(mate).kind).toBe('checkmate');
    expect(resign(mate)).toBe(mate);
  });
});

describe('the move list', () => {
  it('pairs the moves by move number', () => {
    const game = move(move(move(newGame(), E2, E4), E7, E5), G1, F3);
    expect(moveRows(game)).toEqual([
      { number: 1, white: { san: 'e4', ply: 1 }, black: { san: 'e5', ply: 2 } },
      { number: 2, white: { san: 'Nf3', ply: 3 }, black: null },
    ]);
  });

  it('starts on the right side when the game began with Black to move', () => {
    const game = gameFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'b',
      'casual',
    );
    if (typeof game === 'string') throw new Error(game);
    const after = move(game, E7, E5);
    expect(moveRows(after)).toEqual([{ number: 1, white: null, black: { san: 'e5', ply: 1 } }]);
  });
});

describe('PGN', () => {
  it('writes the tags, the moves and the result', () => {
    const game = move(move(newGame('w'), E2, E4), E7, E5);
    const pgn = toPgn(game);
    expect(pgn).toContain('[White "Player"]');
    expect(pgn).toContain('[Black "Lumen"]');
    expect(pgn).toContain('1. e4 e5');
    expect(pgn.trimEnd().endsWith('*')).toBe(true);
  });

  it('records the starting position only when it is not the usual one', () => {
    expect(toPgn(newGame())).not.toContain('[FEN');
    const setup = gameFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'w', 'casual');
    if (typeof setup === 'string') throw new Error(setup);
    expect(toPgn(setup)).toContain('[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]');
  });
});

describe('a game that is over', () => {
  it('lets nobody move', () => {
    const mate = gameFromFen(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      'w',
      'casual',
    );
    if (typeof mate === 'string') throw new Error(mate);
    expect(canMove(mate)).toBe(false);
    expect(engineToMove(mate)).toBe(false);
  });
});
