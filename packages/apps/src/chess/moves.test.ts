import { describe, expect, it } from 'vitest';
import { initialPosition, type PromotionPiece, squareFrom, squareName } from './board';
import { parseFen, toFen } from './fen';
import {
  applyMove,
  findMove,
  fromUci,
  isKingAttacked,
  isSquareAttacked,
  legalMoves,
  type Move,
  moveEquals,
  movesFrom,
  pseudoLegalMoves,
  toUci,
} from './moves';

function at(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`${fen}: ${result.error}`);
  return result.position;
}

/** Every legal move as UCI, sorted, so a test can compare whole sets. */
const uciSet = (fen: string, from?: string): string[] => {
  const position = at(fen);
  const moves = from ? movesFrom(position, squareFrom(from)) : legalMoves(position);
  return moves.map(toUci).sort();
};

/** Play a from/to pair and return the FEN it leads to. */
function play(fen: string, from: string, to: string, promotion: PromotionPiece | null = null) {
  const position = at(fen);
  const move = findMove(position, squareFrom(from), squareFrom(to), promotion);
  if (!move) throw new Error(`${from}${to} is not legal in ${fen}`);
  return toFen(applyMove(position, move));
}

describe('pawns', () => {
  // "one square, or two" is how the rule reads; not a numbered section.
  // deslop-ignore-next-line 30
  it('step one square, or two from home', () => {
    expect(uciSet('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2')).toEqual(['e2e3', 'e2e4']);
    expect(uciSet('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1', 'e4')).toEqual(['e4e5']);
  });

  it('cannot jump a piece on the square in front', () => {
    expect(uciSet('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1', 'e2')).toEqual([]);
    expect(uciSet('4k3/8/8/8/4n3/8/4P3/4K3 w - - 0 1', 'e2')).toEqual(['e2e3']);
  });

  it('capture diagonally and only diagonally', () => {
    expect(uciSet('4k3/8/8/8/3n1n2/4P3/8/4K3 w - - 0 1', 'e3')).toEqual(['e3d4', 'e3e4', 'e3f4']);
  });

  it('promote to all four pieces, and to all four when capturing', () => {
    expect(uciSet('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7')).toEqual([
      'e7d8b',
      'e7d8n',
      'e7d8q',
      'e7d8r',
      'e7e8b',
      'e7e8n',
      'e7e8q',
      'e7e8r',
    ]);
  });

  it('become the piece the promotion asks for', () => {
    expect(play('7k/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'e8', 'n')).toBe(
      '4N2k/8/8/8/8/8/8/4K3 b - - 0 1',
    );
    expect(play('7k/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'e8', 'r')).toBe(
      '4R2k/8/8/8/8/8/8/4K3 b - - 0 1',
    );
  });

  it('reset the halfmove clock, as captures do', () => {
    expect(play('4k3/8/8/8/8/8/4P3/4K3 w - - 40 30', 'e2', 'e4')).toContain(' 0 30');
    expect(play('4k3/8/6n1/8/8/8/8/4K1R1 w - - 40 30', 'g1', 'g3')).toContain(' 41 30');
    expect(play('4k3/8/6n1/8/8/8/8/4K1R1 w - - 40 30', 'g1', 'g6')).toContain(' 0 30');
  });
});

describe('en passant', () => {
  const afterDoubleStep = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';

  it('is offered only on the square the pawn crossed', () => {
    expect(uciSet(afterDoubleStep, 'e5')).toEqual(['e5e6', 'e5f6']);
  });

  it('takes the pawn that stands beside, not the one on the target square', () => {
    expect(play(afterDoubleStep, 'e5', 'f6')).toBe(
      'rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3',
    );
  });

  it('expires after one move', () => {
    const later = at('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
    const quiet = findMove(later, squareFrom('a2'), squareFrom('a3')) as Move;
    expect(applyMove(later, quiet).ep).toBeNull();
  });

  it('sets the target square only after a double step', () => {
    expect(play('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2', 'e4')).toContain(
      ' e3 ',
    );
    expect(play('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2', 'e3')).toContain(
      ' - ',
    );
  });

  /**
   * The classic bug. Taking en passant lifts two pawns off the fourth rank at
   * once, and here that opens the rook's line onto the black king, so cxd3 is
   * not a legal move even though the pawn is not pinned before it is played.
   */
  it('is illegal when it would open the rank onto its own king', () => {
    expect(uciSet('8/8/8/8/k1pP3R/8/8/4K3 b - d3 0 1', 'c4')).toEqual(['c4c3']);
  });

  it('is legal in the same position once the rook is gone', () => {
    expect(uciSet('8/8/8/8/k1pP4/8/8/4K3 b - d3 0 1', 'c4')).toEqual(['c4c3', 'c4d3']);
  });

  it('is legal when the king is not on the rank the capture empties', () => {
    expect(uciSet('8/8/8/8/2pP3R/8/8/k3K3 b - d3 0 1', 'c4')).toEqual(['c4c3', 'c4d3']);
  });
});

describe('castling', () => {
  const both = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

  it('offers both sides when the rights, the squares and the lines allow', () => {
    expect(uciSet(both, 'e1')).toEqual(['e1c1', 'e1d1', 'e1d2', 'e1e2', 'e1f1', 'e1f2', 'e1g1']);
  });

  it('moves the rook to the square the king crossed', () => {
    expect(play(both, 'e1', 'g1')).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    expect(play(both, 'e1', 'c1')).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1');
  });

  it('needs the right, which a king move spends for good', () => {
    expect(uciSet('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1', 'e1')).toContain('e1g1');
    expect(uciSet('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1', 'e1')).not.toContain('e1c1');
    expect(play(both, 'e1', 'e2')).toContain(' kq ');
  });

  it('loses one right when that rook moves, and when it is captured on its square', () => {
    expect(play(both, 'h1', 'h5')).toContain(' Qkq ');
    expect(play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'a1', 'a8')).toContain(' Kk ');
  });

  it('needs the squares between king and rook empty, the b-file included', () => {
    expect(uciSet('4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1', 'e1')).not.toContain('e1c1');
    expect(uciSet('4k3/8/8/8/8/8/8/R2QK2R w KQ - 0 1', 'e1')).not.toContain('e1c1');
    expect(uciSet('4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1', 'e1')).not.toContain('e1g1');
  });

  it('is refused out of check, through check and into check', () => {
    expect(uciSet('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).toEqual([
      'e1d1',
      'e1d2',
      'e1f1',
      'e1f2',
    ]);
    expect(uciSet('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).not.toContain('e1g1');
    expect(uciSet('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).not.toContain('e1g1');
    expect(uciSet('3r4/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).not.toContain('e1c1');
  });

  it('is allowed when only the rook, or the square beside it, is attacked', () => {
    expect(uciSet('1r6/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).toContain('e1c1');
    expect(uciSet('7r/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1')).toContain('e1g1');
  });

  it('is refused when the rook named by the right is not there', () => {
    expect(uciSet('4k3/8/8/8/8/8/8/4K2R w KQ - 0 1', 'e1')).not.toContain('e1c1');
  });

  it('is generated for black as well', () => {
    expect(uciSet('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8')).toContain('e8g8');
    expect(play('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8', 'c8')).toBe(
      '2kr3r/8/8/8/8/8/8/R3K2R w KQ - 1 2',
    );
  });
});

describe('legality', () => {
  it('keeps a pinned piece on its line', () => {
    expect(uciSet('4r2k/8/8/8/8/4N3/8/4K3 w - - 0 1', 'e3')).toEqual([]);
    expect(uciSet('4r2k/8/8/8/8/4R3/8/4K3 w - - 0 1', 'e3')).toEqual([
      'e3e2',
      'e3e4',
      'e3e5',
      'e3e6',
      'e3e7',
      'e3e8',
    ]);
  });

  it('answers a check by taking the checker or stepping off the line', () => {
    expect(uciSet('4k3/8/8/8/8/8/4r3/4K1R1 w - - 0 1')).toEqual(['e1d1', 'e1e2', 'e1f1']);
  });

  it('answers a check from a distance by blocking it', () => {
    expect(uciSet('4r2k/8/8/8/8/8/R7/4K3 w - - 0 1')).toEqual([
      'a2e2',
      'e1d1',
      'e1d2',
      'e1f1',
      'e1f2',
    ]);
  });

  it('never lets a king step next to the other king', () => {
    expect(uciSet('8/8/8/3k4/8/3K4/8/8 w - - 0 1')).toEqual([
      'd3c2',
      'd3c3',
      'd3d2',
      'd3e2',
      'd3e3',
    ]);
  });

  it('separates pseudo-legal from legal', () => {
    const position = at('4r2k/8/8/8/8/4N3/8/4K3 w - - 0 1');
    expect(pseudoLegalMoves(position).filter((move) => move.piece === 'n')).toHaveLength(8);
    expect(legalMoves(position).filter((move) => move.piece === 'n')).toHaveLength(0);
  });
});

describe('attack detection', () => {
  it('reads pawn attacks in the right direction', () => {
    const board = at('4k3/8/8/8/8/4P3/8/4K3 w - - 0 1').board;
    expect(isSquareAttacked(board, squareFrom('d4'), 'w')).toBe(true);
    expect(isSquareAttacked(board, squareFrom('f4'), 'w')).toBe(true);
    expect(isSquareAttacked(board, squareFrom('e4'), 'w')).toBe(false);
    expect(isSquareAttacked(board, squareFrom('d3'), 'w')).toBe(false);
  });

  it('stops a slider at the first piece on the ray', () => {
    const board = at('4k3/8/8/8/8/8/4N3/4K2R w - - 0 1').board;
    expect(isSquareAttacked(board, squareFrom('h8'), 'w')).toBe(true);
    expect(isSquareAttacked(board, squareFrom('f1'), 'w')).toBe(true);
    expect(isSquareAttacked(board, squareFrom('d1'), 'w')).toBe(true);
    expect(isSquareAttacked(board, squareFrom('a1'), 'w')).toBe(false);
  });

  it('sees a king in check and a king that is safe', () => {
    expect(isKingAttacked(at('4k3/8/8/8/8/8/8/4K2r w - - 0 1').board, 'w')).toBe(true);
    expect(isKingAttacked(at('4k3/8/8/8/8/8/8/4K2r w - - 0 1').board, 'b')).toBe(false);
  });
});

describe('coordinate notation', () => {
  it('writes from, to and the promotion letter', () => {
    const position = at('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
    const move = findMove(position, squareFrom('e7'), squareFrom('e8'), 'q') as Move;
    expect(toUci(move)).toBe('e7e8q');
  });

  it('reads a move back, and rejects text that is not one', () => {
    const position = initialPosition();
    const move = fromUci(position, 'e2e4');
    expect(move && squareName(move.to)).toBe('e4');
    expect(fromUci(position, 'e2e5')).toBeNull();
    expect(fromUci(position, 'e2')).toBeNull();
    expect(fromUci(position, 'x9y9')).toBeNull();
    expect(fromUci(position, 'e2e4k')).toBeNull();
  });

  it('picks the queen by default and the piece asked for otherwise', () => {
    const position = at('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(toUci(findMove(position, squareFrom('e7'), squareFrom('e8')) as Move)).toBe('e7e8q');
    expect(toUci(fromUci(position, 'e7e8n') as Move)).toBe('e7e8n');
  });

  it('compares moves by their squares and promotion', () => {
    const position = at('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
    const queen = fromUci(position, 'e7e8q') as Move;
    const knight = fromUci(position, 'e7e8n') as Move;
    expect(moveEquals(queen, queen)).toBe(true);
    expect(moveEquals(queen, knight)).toBe(false);
  });
});
