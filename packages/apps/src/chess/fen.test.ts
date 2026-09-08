import { describe, expect, it } from 'vitest';
import { initialPosition, piece, squareFrom, squareName } from './board';
import {
  castlingField,
  INITIAL_FEN,
  parseFen,
  positionFields,
  toFen,
  validatePosition,
} from './fen';

/** The FEN's position, or a failure the test can point at. */
function parsed(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`${fen}: ${result.error}`);
  return result.position;
}

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

describe('parsing', () => {
  it('reads the opening position back into the one board.ts builds', () => {
    expect(parsed(INITIAL_FEN)).toEqual(initialPosition());
  });

  it('reads the side to move, rights, en passant and both clocks', () => {
    const position = parsed('8/8/8/8/4pP2/8/8/K6k b Kq f3 7 42');
    expect(position.turn).toBe('b');
    expect(position.castling).toEqual({ wk: true, wq: false, bk: false, bq: true });
    expect(squareName(position.ep as number)).toBe('f3');
    expect(position.halfmove).toBe(7);
    expect(position.fullmove).toBe(42);
  });

  it('places pieces from the eighth rank down', () => {
    const position = parsed(KIWIPETE);
    expect(position.board[squareFrom('a8')]).toBe(piece('b', 'r'));
    expect(position.board[squareFrom('e5')]).toBe(piece('w', 'n'));
    expect(position.board[squareFrom('h3')]).toBe(piece('b', 'p'));
    expect(position.board[squareFrom('b8')]).toBeNull();
  });

  it('defaults the clocks when a FEN gives only four fields', () => {
    const position = parsed('8/8/8/8/8/8/8/K6k w - -');
    expect(position.halfmove).toBe(0);
    expect(position.fullmove).toBe(1);
  });

  it('says what is wrong instead of throwing', () => {
    const cases: Array<[string, RegExp]> = [
      ['', /at least four fields/],
      ['8/8/8/8/8/8/8 w - - 0 1', /eight ranks/],
      ['8/8/8/8/8/8/8/9 w - - 0 1', /skips 9 squares/],
      ['8/8/8/8/8/8/8/KKKK w - - 0 1', /covers 4 squares/],
      ['8/8/8/8/8/8/8/xxxxxxxx w - - 0 1', /not a piece/],
      ['8/8/8/8/8/8/8/8 x - - 0 1', /side to move/],
      ['8/8/8/8/8/8/8/8 w XQ - 0 1', /castling field/],
      ['8/8/8/8/8/8/8/8 w - j9 0 1', /en passant field/],
      ['8/8/8/8/8/8/8/8 w - e4 0 1', /third or sixth rank/],
      ['8/8/8/8/8/8/8/8 w - - x 1', /halfmove clock/],
      ['8/8/8/8/8/8/8/8 w - - 0 0', /move number/],
    ];
    for (const [fen, message] of cases) {
      const result = parseFen(fen);
      expect(result.ok, fen).toBe(false);
      if (!result.ok) expect(result.error).toMatch(message);
    }
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(toFen(parsed(`  ${INITIAL_FEN.replace(/ /g, '   ')}  `))).toBe(INITIAL_FEN);
  });
});

describe('serialising', () => {
  it('round-trips the positions the tests lean on', () => {
    const fens = [
      INITIAL_FEN,
      KIWIPETE,
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      '4k3/8/8/8/8/8/8/4K3 b - - 99 175',
      '8/8/8/8/k1pP3R/8/8/4K3 b - d3 0 1',
    ];
    for (const fen of fens) expect(toFen(parsed(fen))).toBe(fen);
  });

  it('writes the castling field the way FEN orders it', () => {
    expect(castlingField({ wk: true, wq: true, bk: true, bq: true })).toBe('KQkq');
    expect(castlingField({ wk: false, wq: true, bk: false, bq: false })).toBe('Q');
    expect(castlingField({ wk: false, wq: false, bk: false, bq: false })).toBe('-');
  });

  it('drops the clocks from the position fields, which is what repetition compares', () => {
    const withClocks = parsed('4k3/8/8/8/8/8/8/4K3 w - - 12 30');
    const without = parsed('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(positionFields(withClocks)).toBe(positionFields(without));
    expect(toFen(withClocks)).not.toBe(toFen(without));
  });
});

describe('validation', () => {
  it('accepts a real position', () => {
    expect(validatePosition(parsed(INITIAL_FEN))).toBeNull();
    expect(validatePosition(parsed(KIWIPETE))).toBeNull();
  });

  it('rejects a board without exactly one king a side', () => {
    expect(validatePosition(parsed('8/8/8/8/8/8/8/K7 w - - 0 1'))).toMatch(/one king/);
    expect(validatePosition(parsed('4k3/8/8/8/8/8/8/K5K1 w - - 0 1'))).toMatch(/one king/);
  });

  it('rejects a pawn on a back rank', () => {
    expect(validatePosition(parsed('4k2P/8/8/8/8/8/8/4K3 w - - 0 1'))).toMatch(
      /cannot stand on h8/,
    );
  });

  it('rejects a position where the side that just moved is still in check', () => {
    expect(validatePosition(parsed('4k3/8/8/8/8/8/8/K3R3 w - - 0 1'))).toMatch(/just moved/);
    expect(validatePosition(parsed('4k3/8/8/8/8/8/8/K3R3 b - - 0 1'))).toBeNull();
  });

  it('rejects an en passant square with no pawn behind it', () => {
    expect(validatePosition(parsed('4k3/8/8/8/8/8/8/4K3 w - e6 0 1'))).toMatch(/no pawn/);
    expect(validatePosition(parsed('4k3/8/8/4p3/8/8/8/4K3 w - e6 0 1'))).toBeNull();
  });
});
