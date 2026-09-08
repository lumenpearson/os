import { describe, expect, it } from 'vitest';
import { initialPosition } from './board';
import { parseFen } from './fen';
import { applyMove } from './moves';
import {
  countKey,
  inCheck,
  insufficientMaterial,
  isCheckmate,
  isStalemate,
  outcome,
  positionKey,
  resultToken,
} from './rules';
import { parseSan } from './san';

function at(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`${fen}: ${result.error}`);
  return result.position;
}

describe('check', () => {
  it('sees a king attacked and a king that is not', () => {
    expect(inCheck(at('4k3/8/8/8/8/8/8/R3K3 b - - 0 1'))).toBe(false);
    expect(inCheck(at('4k3/8/8/8/8/8/8/4K1R1 b - - 0 1'))).toBe(false);
    expect(inCheck(at('4k3/8/8/8/8/8/8/4KR2 b - - 0 1'))).toBe(false);
    expect(inCheck(at('4k3/8/8/8/8/8/8/K3R3 b - - 0 1'))).toBe(true);
  });

  it('is not mate while a move answers it', () => {
    const position = at('4k3/8/8/8/8/8/8/K3R3 b - - 0 1');
    expect(isCheckmate(position)).toBe(false);
    expect(outcome(position)).toEqual({ kind: 'playing', check: true });
  });
});

describe('checkmate', () => {
  it('calls the back-rank mate', () => {
    const position = at('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
    expect(isCheckmate(position)).toBe(true);
    expect(outcome(position)).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('calls the two-move mate', () => {
    let position = initialPosition();
    for (const text of ['f3', 'e5', 'g4', 'Qh4']) {
      const move = parseSan(position, text);
      if (!move) throw new Error(`cannot play ${text}`);
      position = applyMove(position, move);
    }
    expect(isCheckmate(position)).toBe(true);
    expect(outcome(position)).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('calls a smothered mate, where the king is blocked by its own pieces', () => {
    expect(isCheckmate(at('6rk/5Npp/8/8/8/8/8/4K3 b - - 0 1'))).toBe(true);
  });
});

describe('stalemate', () => {
  it('is no move and no check', () => {
    const position = at('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(isStalemate(position)).toBe(true);
    expect(isCheckmate(position)).toBe(false);
    expect(outcome(position)).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  it('is not stalemate while one pawn can still step', () => {
    expect(isStalemate(at('7k/5Q2/6K1/8/8/8/7p/8 b - - 0 1'))).toBe(false);
  });
});

describe('insufficient material', () => {
  it('draws the four endings that cannot be won', () => {
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/4KB2 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/4KN2 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(at('2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1'))).toBe(true);
  });

  it('does not draw when the bishops are on different colours', () => {
    // Bishops on c8 (light) and f1 (light) draw; c8 and c1 (dark) do not.
    expect(insufficientMaterial(at('2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe(false);
  });

  it('does not draw with a pawn, a rook, a queen, or two minors on one side', () => {
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/4KR2 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/4KQ2 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/2N1KN2 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(at('4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1'))).toBe(false);
  });

  it('leaves the opening position alone', () => {
    expect(insufficientMaterial(initialPosition())).toBe(false);
  });
});

describe('the fifty-move rule', () => {
  it('draws at a hundred plies and not at ninety-nine', () => {
    expect(outcome(at('4k3/8/8/8/8/8/4P3/4K3 w - - 99 90'))).toEqual({
      kind: 'playing',
      check: false,
    });
    expect(outcome(at('4k3/8/8/8/8/8/4P3/4K3 w - - 100 90'))).toEqual({
      kind: 'draw',
      reason: 'fifty-move',
    });
  });

  it('comes second to mate, which ends the game whatever the clock says', () => {
    expect(outcome(at('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 140 90'))).toEqual({
      kind: 'checkmate',
      winner: 'w',
    });
  });
});

describe('position keys', () => {
  it('separate positions that differ only in whose move it is', () => {
    expect(positionKey(at('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).not.toBe(
      positionKey(at('4k3/8/8/8/8/8/8/4K3 b - - 0 1')),
    );
  });

  it('separate positions that differ only in castling rights', () => {
    expect(positionKey(at('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))).not.toBe(
      positionKey(at('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1')),
    );
  });

  it('count an en passant square only when a pawn can take it', () => {
    const capturable = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const same = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    expect(positionKey(at(capturable))).not.toBe(positionKey(at(same)));

    const idle = '4k3/8/8/3p4/8/8/8/4K3 w - d6 0 2';
    const idleSame = '4k3/8/8/3p4/8/8/8/4K3 w - - 0 2';
    expect(positionKey(at(idle))).toBe(positionKey(at(idleSame)));
  });

  it('ignore the clocks, which do not change the position', () => {
    expect(positionKey(at('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(
      positionKey(at('4k3/8/8/8/8/8/8/4K3 w - - 44 90')),
    );
  });

  it('count occurrences in a list', () => {
    expect(countKey(['a', 'b', 'a', 'a'], 'a')).toBe(3);
    expect(countKey([], 'a')).toBe(0);
  });
});

describe('threefold repetition', () => {
  it('draws when the position on the board has appeared three times', () => {
    const position = at('4k3/8/8/8/8/8/8/R3K2R w KQkq - 4 20');
    const key = positionKey(position);
    expect(outcome(position, [key, 'x', key, 'y'])).toEqual({ kind: 'playing', check: false });
    expect(outcome(position, [key, 'x', key, 'y', key])).toEqual({
      kind: 'draw',
      reason: 'threefold-repetition',
    });
  });

  it('counts this position, not whichever key happens to be last', () => {
    const position = at('4k3/8/8/8/8/8/8/R3K2R w KQkq - 4 20');
    expect(outcome(position, ['x', 'x', 'x'])).toEqual({ kind: 'playing', check: false });
  });
});

describe('the outcome', () => {
  it('reports a resignation as a win for the other side', () => {
    expect(outcome(initialPosition(), [], 'w')).toEqual({ kind: 'resignation', winner: 'b' });
    expect(outcome(initialPosition(), [], 'b')).toEqual({ kind: 'resignation', winner: 'w' });
  });

  it('turns into the PGN result token', () => {
    expect(resultToken({ kind: 'checkmate', winner: 'w' })).toBe('1-0');
    expect(resultToken({ kind: 'resignation', winner: 'b' })).toBe('0-1');
    expect(resultToken({ kind: 'draw', reason: 'stalemate' })).toBe('1/2-1/2');
    expect(resultToken({ kind: 'playing', check: false })).toBe('*');
  });
});
