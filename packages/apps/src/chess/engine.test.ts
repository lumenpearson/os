import { describe, expect, it } from 'vitest';
import { initialPosition, squareFrom } from './board';
import {
  chooseMove,
  DEFAULT_LEVEL,
  deepen,
  evaluate,
  LEVELS,
  levelById,
  MATE_SCORE,
  orderMoves,
  PIECE_VALUES,
  type RootMove,
  type SearchResult,
  search,
  searchAsync,
} from './engine';
import { parseFen } from './fen';
import { applyMove, legalMoves, type Move, pseudoLegalMoves, toUci } from './moves';
import { positionKey } from './rules';

function at(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`${fen}: ${result.error}`);
  return result.position;
}

/** A stopped clock, so a test measures nodes rather than the machine it runs on. */
const stopped = { now: () => 0, timeMs: 1_000_000 };

describe('evaluation', () => {
  it('is level in the opening position, whichever way the tables are read', () => {
    expect(evaluate(initialPosition())).toBe(0);
  });

  it('counts material, and reads from the side to move', () => {
    const white = at('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    const black = at('4k3/8/8/8/8/8/8/3QK3 b - - 0 1');
    expect(evaluate(white)).toBeGreaterThan(PIECE_VALUES.q - 100);
    expect(evaluate(black)).toBe(-evaluate(white));
  });

  it('prefers a knight in the middle to a knight in the corner', () => {
    const middle = evaluate(at('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1'));
    const corner = evaluate(at('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'));
    expect(middle).toBeGreaterThan(corner);
  });

  it('brings the king out once the heavy pieces are gone', () => {
    const centre = evaluate(at('7k/8/8/3K4/8/8/8/8 w - - 0 1'));
    const edge = evaluate(at('7k/8/8/8/8/8/8/K7 w - - 0 1'));
    expect(centre).toBeGreaterThan(edge);
  });
});

describe('move ordering', () => {
  it('puts the biggest capture by the smallest piece first', () => {
    // The pawn and the queen can both take the queen on d5; the pawn is the
    // cheaper attacker, so it is tried first.
    const position = at('4k3/8/8/3q4/2P5/8/8/3QK3 w - - 0 1');
    const captures = legalMoves(position).filter((move) => move.capture);
    expect(captures).toHaveLength(2);
    expect(toUci(orderMoves(captures)[0] as Move)).toBe('c4d5');
  });

  it('puts captures before quiet moves and promotions before quiet moves', () => {
    const position = at('4k3/8/8/8/8/7p/6P1/4K2R w - - 0 1');
    const ordered = orderMoves(legalMoves(position)).map(toUci);
    expect(ordered[0]).toBe('g2h3');
    expect(ordered.indexOf('h1h3')).toBe(1);
    expect(ordered.indexOf('h1h2')).toBeGreaterThan(1);
  });

  it('puts the move it is told to prefer at the very front', () => {
    const position = initialPosition();
    const moves = legalMoves(position);
    const preferred = moves.find((move) => toUci(move) === 'g1f3') as Move;
    expect(toUci(orderMoves(moves, preferred)[0] as Move)).toBe('g1f3');
  });
});

describe('the search', () => {
  it('finds mate in one', () => {
    const result = search(at('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), {
      depth: 2,
      nodes: 50_000,
      ...stopped,
    });
    expect(result.move && toUci(result.move)).toBe('a1a8');
    expect(result.score).toBeGreaterThanOrEqual(MATE_SCORE - 2);
  });

  /** 1.Ra7 forces the king to g8, and 2.Rb8 mates. */
  it('finds mate in two, which needs a quiet first move', () => {
    const result = search(at('7k/8/8/8/8/8/8/RR2K3 w - - 0 1'), {
      depth: 4,
      nodes: 400_000,
      ...stopped,
    });
    expect(result.score).toBeGreaterThanOrEqual(MATE_SCORE - 10);
    expect(['a1a7', 'b1b7']).toContain(result.move && toUci(result.move));
  });

  it('sees a mate against it and avoids walking into one', () => {
    // Black is a rook up but must answer the threat of Rd8#.
    const result = search(at('3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1'), {
      depth: 3,
      nodes: 200_000,
      ...stopped,
    });
    expect(result.score).toBeGreaterThan(-MATE_SCORE + 100);
  });

  it('takes a hanging queen', () => {
    const result = search(at('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'), {
      depth: 3,
      nodes: 100_000,
      ...stopped,
    });
    expect(result.move && toUci(result.move)).toBe('d1d5');
  });

  it('does not grab a pawn that costs a queen, because it looks past the capture', () => {
    // Qxd5 wins a pawn and loses the queen to exd5; the quiescence search sees it.
    const result = search(at('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1'), {
      depth: 2,
      nodes: 200_000,
      ...stopped,
    });
    expect(result.move && toUci(result.move)).not.toBe('d1d5');
  });

  it('returns no move in a position that is already over', () => {
    const result = search(at('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1'), { depth: 3, ...stopped });
    expect(result.move).toBeNull();
    expect(result.moves).toEqual([]);
  });

  it('scores a stalemate as a draw rather than a loss', () => {
    // Black to move is stalemated; white's Qf7 keeps the score at zero, so a
    // winning search must not choose it.
    const result = search(at('7k/8/6K1/8/8/8/5Q2/8 w - - 0 1'), {
      depth: 2,
      nodes: 200_000,
      ...stopped,
    });
    expect(result.move && toUci(result.move)).not.toBe('f2f7');
  });
});

describe('the budget', () => {
  it('never spends more nodes than it is given, and still returns a move', () => {
    const result = search(initialPosition(), { depth: 6, nodes: 500, ...stopped });
    expect(result.nodes).toBeLessThanOrEqual(500);
    expect(result.move).not.toBeNull();
  });

  it('keeps the last finished iteration when the budget stops the next one', () => {
    const position = at('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3');
    const result = search(position, { depth: 6, nodes: 3_000, ...stopped });
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.depth).toBeLessThan(6);
    expect(result.move).not.toBeNull();
  });

  it('stops on the clock as well as on the count', () => {
    let tick = 0;
    const result = search(initialPosition(), {
      depth: 6,
      nodes: 1_000_000,
      timeMs: 5,
      now: () => (tick += 100),
    });
    expect(result.depth).toBe(0);
    expect(result.nodes).toBeLessThan(1_000);
  });

  it('reports the depth it reached', () => {
    const result = search(initialPosition(), { depth: 2, nodes: 500_000, ...stopped });
    expect(result.depth).toBe(2);
  });
});

describe('running without freezing the window', () => {
  it('hands control back between iterations', async () => {
    let yields = 0;
    const depths: number[] = [];
    const options = { depth: 3, nodes: 200_000, ...stopped };
    const result = await searchAsync(initialPosition(), options, {
      yieldTo: async () => {
        yields += 1;
      },
      onDepth: (step: SearchResult) => depths.push(step.depth),
    });
    expect(yields).toBeGreaterThanOrEqual(3);
    expect(depths).toEqual([1, 2, 3]);
    expect(result.move && toUci(result.move)).toBe(
      toUci(search(initialPosition(), options).move as Move),
    );
  });

  it('reports each finished iteration through the generator', () => {
    const steps = [...deepen(initialPosition(), { depth: 3, nodes: 200_000, ...stopped })];
    expect(steps.map((step) => step.depth)).toEqual([1, 2, 3]);
  });
});

describe('repetition', () => {
  it('scores a line that returns to a position already played as a draw', () => {
    // White is a queen down, so anything but the repetition loses.
    const position = at('7k/8/8/8/8/6q1/8/K6R w - - 8 40');
    const history = [positionKey(position)];
    const result = search(position, { depth: 3, nodes: 200_000, history, ...stopped });
    expect(result.score).toBeLessThanOrEqual(0);
  });
});

describe('levels', () => {
  it('offers four, with the default among them', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(['gentle', 'casual', 'club', 'strong']);
    expect(LEVELS.some((level) => level.id === DEFAULT_LEVEL)).toBe(true);
  });

  it('gets deeper and slower as it gets stronger', () => {
    for (let index = 1; index < LEVELS.length; index += 1) {
      const previous = LEVELS[index - 1] as (typeof LEVELS)[number];
      const level = LEVELS[index] as (typeof LEVELS)[number];
      expect(level.depth).toBeGreaterThan(previous.depth);
      expect(level.nodes).toBeGreaterThan(previous.nodes);
      expect(level.slack).toBeLessThanOrEqual(previous.slack);
    }
  });

  it('falls back to the default rather than throwing on an unknown id', () => {
    expect(levelById('club').id).toBe('club');
    expect(levelById('nonsense').id).toBe(DEFAULT_LEVEL);
  });
});

describe('choosing among the root moves', () => {
  const position = initialPosition();
  const moves = legalMoves(position);
  const scored: RootMove[] = [
    { move: moves[0] as Move, score: 50 },
    { move: moves[1] as Move, score: 20 },
    { move: moves[2] as Move, score: -400 },
  ];

  it('takes the best when the level has no slack', () => {
    expect(chooseMove(scored, 0, () => 0.99)).toBe(scored[0]?.move);
  });

  it('takes one of the near-best when it does', () => {
    expect(chooseMove(scored, 40, () => 0.99)).toBe(scored[1]?.move);
    expect(chooseMove(scored, 40, () => 0)).toBe(scored[0]?.move);
  });

  it('never reaches for a move far below the best', () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      expect(chooseMove(scored, 40, () => roll)).not.toBe(scored[2]?.move);
    }
  });

  it('has nothing to choose in a finished position', () => {
    expect(chooseMove([], 30)).toBeNull();
  });
});

describe('the engine only plays legal moves', () => {
  it('plays a whole game against itself without producing an illegal one', () => {
    let position = initialPosition();
    for (let ply = 0; ply < 24 && legalMoves(position).length > 0; ply += 1) {
      const result = search(position, { depth: 2, nodes: 20_000, ...stopped });
      const move = result.move as Move;
      expect(legalMoves(position).some((other) => toUci(other) === toUci(move))).toBe(true);
      expect(pseudoLegalMoves(position).length).toBeGreaterThan(0);
      position = applyMove(position, move);
    }
    expect(position.fullmove).toBeGreaterThan(1);
    expect(squareFrom('e4')).toBeGreaterThan(0);
  });
});
