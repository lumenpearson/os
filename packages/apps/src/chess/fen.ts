/**
 * Forsyth–Edwards notation: the text form of a position, in and out.
 *
 * Parsing returns a result rather than throwing, because a FEN mostly
 * arrives by paste and the error belongs on screen next to the field.
 */

import {
  type CastlingRights,
  type Color,
  emptyBoard,
  fileOf,
  NO_CASTLING,
  opposite,
  type Piece,
  type PieceType,
  type Position,
  piece,
  rankOf,
  SQUARE_COUNT,
  squareAt,
  squareFrom,
  squareName,
} from './board';
import { isKingAttacked } from './moves';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type FenResult = { ok: true; position: Position } | { ok: false; error: string };

const LETTERS: Record<string, PieceType> = {
  p: 'p',
  n: 'n',
  b: 'b',
  r: 'r',
  q: 'q',
  k: 'k',
};

const letterFor = (found: Piece): string =>
  found.color === 'w' ? found.type.toUpperCase() : found.type;

function parsePlacement(field: string): { board: (Piece | null)[] } | { error: string } {
  const rows = field.split('/');
  if (rows.length !== 8) return { error: 'The placement needs eight ranks separated by "/".' };
  const board = emptyBoard();
  for (let row = 0; row < 8; row += 1) {
    let file = 0;
    for (const char of rows[row] as string) {
      if (char >= '0' && char <= '9') {
        const skip = Number.parseInt(char, 10);
        if (skip < 1 || skip > 8) return { error: `Rank ${8 - row} skips ${char} squares.` };
        file += skip;
        continue;
      }
      const type = LETTERS[char.toLowerCase()];
      if (!type) return { error: `"${char}" is not a piece.` };
      if (file > 7) return { error: `Rank ${8 - row} has too many squares.` };
      board[row * 8 + file] = piece(char === char.toUpperCase() ? 'w' : 'b', type);
      file += 1;
    }
    if (file !== 8) return { error: `Rank ${8 - row} covers ${file} squares, not 8.` };
  }
  return { board };
}

function parseCastling(field: string): CastlingRights | null {
  if (field === '-') return NO_CASTLING;
  if (!/^K?Q?k?q?$/.test(field) || field.length === 0) return null;
  return {
    wk: field.includes('K'),
    wq: field.includes('Q'),
    bk: field.includes('k'),
    bq: field.includes('q'),
  };
}

/** Read a FEN. Missing move counters default to 0 and 1, as most tools write. */
export function parseFen(fen: string): FenResult {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) return { ok: false, error: 'A FEN has at least four fields.' };
  const [placement, turnField, castlingField, epField, halfmoveField, fullmoveField] = fields;

  const placed = parsePlacement(placement as string);
  if ('error' in placed) return { ok: false, error: placed.error };

  if (turnField !== 'w' && turnField !== 'b')
    return { ok: false, error: 'The side to move is "w" or "b".' };

  const castling = parseCastling(castlingField as string);
  if (!castling) return { ok: false, error: 'The castling field is "-" or some of "KQkq".' };

  let ep: number | null = null;
  if (epField !== '-') {
    const square = squareFrom(epField as string);
    if (square < 0) return { ok: false, error: 'The en passant field is "-" or a square.' };
    const rank = rankOf(square);
    if (rank !== 2 && rank !== 5)
      return { ok: false, error: 'An en passant square is on the third or sixth rank.' };
    ep = square;
  }

  const halfmove = halfmoveField === undefined ? 0 : Number.parseInt(halfmoveField, 10);
  const fullmove = fullmoveField === undefined ? 1 : Number.parseInt(fullmoveField, 10);
  if (!Number.isInteger(halfmove) || halfmove < 0)
    return { ok: false, error: 'The halfmove clock is a whole number.' };
  if (!Number.isInteger(fullmove) || fullmove < 1)
    return { ok: false, error: 'The move number starts at 1.' };

  return {
    ok: true,
    position: {
      board: placed.board,
      turn: turnField,
      castling,
      ep,
      halfmove,
      fullmove,
    },
  };
}

export function castlingField(rights: CastlingRights): string {
  const text = `${rights.wk ? 'K' : ''}${rights.wq ? 'Q' : ''}${rights.bk ? 'k' : ''}${rights.bq ? 'q' : ''}`;
  return text === '' ? '-' : text;
}

/** The placement, side to move, castling and en passant fields — the position itself. */
export function positionFields(position: Position): string {
  let placement = '';
  for (let row = 0; row < 8; row += 1) {
    let run = 0;
    for (let file = 0; file < 8; file += 1) {
      const found = position.board[row * 8 + file];
      if (!found) {
        run += 1;
        continue;
      }
      if (run > 0) {
        placement += String(run);
        run = 0;
      }
      placement += letterFor(found);
    }
    if (run > 0) placement += String(run);
    if (row < 7) placement += '/';
  }
  const ep = position.ep === null ? '-' : squareName(position.ep);
  return `${placement} ${position.turn} ${castlingField(position.castling)} ${ep}`;
}

export function toFen(position: Position): string {
  return `${positionFields(position)} ${position.halfmove} ${position.fullmove}`;
}

/** A FEN whose position is playable: one king each, no pawn on the back ranks. */
export function validatePosition(position: Position): string | null {
  const kings: Record<Color, number> = { w: 0, b: 0 };
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    if (!found) continue;
    if (found.type === 'k') kings[found.color] += 1;
    if (found.type === 'p' && (rankOf(square) === 0 || rankOf(square) === 7))
      return `A pawn cannot stand on ${squareName(square)}.`;
  }
  if (kings.w !== 1 || kings.b !== 1) return 'Each side needs exactly one king.';
  if (position.ep !== null) {
    const behind = squareAt(fileOf(position.ep), position.turn === 'w' ? 4 : 3);
    const pawn = behind < 0 ? null : position.board[behind];
    if (pawn?.type !== 'p' || pawn.color === position.turn)
      return 'The en passant square has no pawn to capture.';
  }
  // A position where the side that just moved left its own king attacked
  // cannot be reached, and would let the next move capture a king.
  if (isKingAttacked(position.board, opposite(position.turn)))
    return 'The side that has just moved is in check.';
  return null;
}
