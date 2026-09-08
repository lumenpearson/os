import { describe, expect, it } from 'vitest';
import {
  ALL_CASTLING,
  FILE_NAMES,
  fileOf,
  hasRight,
  initialPosition,
  isLightSquare,
  isSquare,
  kingSquare,
  opposite,
  piece,
  rankOf,
  SQUARE_COUNT,
  squareAt,
  squareFrom,
  squareName,
  squaresOf,
  withoutRights,
} from './board';

describe('square numbering', () => {
  it('starts at a8 and ends at h1, the order FEN reads', () => {
    expect(squareName(0)).toBe('a8');
    expect(squareName(7)).toBe('h8');
    expect(squareName(56)).toBe('a1');
    expect(squareName(63)).toBe('h1');
  });

  it('round-trips every square through its name', () => {
    for (let square = 0; square < SQUARE_COUNT; square += 1) {
      expect(squareFrom(squareName(square))).toBe(square);
    }
  });

  it('agrees with its own file and rank accessors', () => {
    for (let square = 0; square < SQUARE_COUNT; square += 1) {
      expect(squareAt(fileOf(square), rankOf(square))).toBe(square);
    }
  });

  it('mirrors a square onto the other side with square ^ 56', () => {
    expect(squareName(squareFrom('e2') ^ 56)).toBe('e7');
    expect(squareName(squareFrom('a1') ^ 56)).toBe('a8');
    expect(squareName(squareFrom('h4') ^ 56)).toBe('h5');
  });

  it('refuses coordinates off the board', () => {
    expect(squareAt(-1, 0)).toBe(-1);
    expect(squareAt(0, 8)).toBe(-1);
    expect(squareAt(8, 8)).toBe(-1);
    expect(isSquare(-1)).toBe(false);
    expect(isSquare(64)).toBe(false);
  });

  it('refuses text that is not a square', () => {
    for (const text of ['', 'e', 'e9', 'i4', 'ee', '44', 'e4 ']) expect(squareFrom(text)).toBe(-1);
  });

  it('knows a1 is dark and h1 is light', () => {
    expect(isLightSquare(squareFrom('a1'))).toBe(false);
    expect(isLightSquare(squareFrom('h1'))).toBe(true);
    expect(isLightSquare(squareFrom('a8'))).toBe(true);
    expect(isLightSquare(squareFrom('c1'))).toBe(false);
  });

  it('names all eight files in order', () => {
    expect(FILE_NAMES).toBe('abcdefgh');
  });
});

describe('the opening position', () => {
  const position = initialPosition();

  it('puts the white pieces on the first two ranks', () => {
    expect(position.board[squareFrom('e1')]).toBe(piece('w', 'k'));
    expect(position.board[squareFrom('d1')]).toBe(piece('w', 'q'));
    expect(position.board[squareFrom('a1')]).toBe(piece('w', 'r'));
    expect(position.board[squareFrom('b1')]).toBe(piece('w', 'n'));
    expect(position.board[squareFrom('c1')]).toBe(piece('w', 'b'));
    expect(position.board[squareFrom('e2')]).toBe(piece('w', 'p'));
  });

  it('puts the black pieces facing them', () => {
    expect(position.board[squareFrom('e8')]).toBe(piece('b', 'k'));
    expect(position.board[squareFrom('d8')]).toBe(piece('b', 'q'));
    expect(position.board[squareFrom('h8')]).toBe(piece('b', 'r'));
    expect(position.board[squareFrom('e7')]).toBe(piece('b', 'p'));
  });

  it('leaves the middle four ranks empty', () => {
    for (let square = 16; square < 48; square += 1) expect(position.board[square]).toBeNull();
  });

  it('starts with white to move, all rights, no en passant', () => {
    expect(position.turn).toBe('w');
    expect(position.castling).toEqual(ALL_CASTLING);
    expect(position.ep).toBeNull();
    expect(position.halfmove).toBe(0);
    expect(position.fullmove).toBe(1);
  });

  it('finds both kings and counts sixteen pieces a side', () => {
    expect(squareName(kingSquare(position.board, 'w'))).toBe('e1');
    expect(squareName(kingSquare(position.board, 'b'))).toBe('e8');
    expect(squaresOf(position.board, 'w')).toHaveLength(16);
    expect(squaresOf(position.board, 'b')).toHaveLength(16);
  });
});

describe('pieces', () => {
  it('are shared objects, so equality is identity', () => {
    expect(piece('w', 'q')).toBe(piece('w', 'q'));
    expect(piece('w', 'q')).not.toBe(piece('b', 'q'));
  });

  it('flip colour', () => {
    expect(opposite('w')).toBe('b');
    expect(opposite('b')).toBe('w');
  });
});

describe('castling rights', () => {
  it('read per colour and side', () => {
    const rights = { wk: true, wq: false, bk: false, bq: true };
    expect(hasRight(rights, 'w', 'k')).toBe(true);
    expect(hasRight(rights, 'w', 'q')).toBe(false);
    expect(hasRight(rights, 'b', 'k')).toBe(false);
    expect(hasRight(rights, 'b', 'q')).toBe(true);
  });

  it('drop without disturbing the rest, and keep identity when nothing changes', () => {
    expect(withoutRights(ALL_CASTLING, 'wk')).toEqual({ wk: false, wq: true, bk: true, bq: true });
    expect(withoutRights(ALL_CASTLING, 'wk', 'wq')).toEqual({
      wk: false,
      wq: false,
      bk: true,
      bq: true,
    });
    const none = { wk: false, wq: false, bk: false, bq: false };
    expect(withoutRights(none, 'wk')).toBe(none);
  });
});
