/**
 * The position and the geometry it sits on.
 *
 * Squares are numbered 0–63 in the order FEN writes them: 0 is a8, 7 is h8,
 * 56 is a1, 63 is h1. That makes a board array render top-left to
 * bottom-right without translation, and mirroring a square for the black
 * side of a piece-square table is `square ^ 56`.
 *
 * A position is immutable. Every move returns a new one (see moves.ts), so a
 * game is a list of positions the move list can step through without
 * unmaking anything.
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  readonly color: Color;
  readonly type: PieceType;
}

export const PIECE_TYPES: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
export const PROMOTION_PIECES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

/** One object per piece kind: pieces compare by identity and never allocate. */
const PIECES: Record<string, Piece> = {};
for (const color of ['w', 'b'] as const) {
  for (const type of PIECE_TYPES) PIECES[color + type] = { color, type };
}

export function piece(color: Color, type: PieceType): Piece {
  const found = PIECES[color + type];
  if (!found) throw new Error(`no such piece: ${color}${type}`);
  return found;
}

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export const FILE_NAMES = 'abcdefgh';
export const BOARD_SIZE = 8;
export const SQUARE_COUNT = 64;

/** 0 = a-file. */
export const fileOf = (square: number): number => square & 7;
/** 0 = rank 1, 7 = rank 8 — the way a player counts, not the way the array runs. */
export const rankOf = (square: number): number => 7 - (square >> 3);

/** The square at a file/rank pair, or −1 when the pair is off the board. */
export function squareAt(file: number, rank: number): number {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return (7 - rank) * 8 + file;
}

export const isSquare = (square: number): boolean =>
  Number.isInteger(square) && square >= 0 && square < SQUARE_COUNT;

export function squareName(square: number): string {
  if (!isSquare(square)) return '-';
  return `${FILE_NAMES[fileOf(square)]}${rankOf(square) + 1}`;
}

/** Parse "e4". Returns −1 for anything that is not a square. */
export function squareFrom(name: string): number {
  if (name.length !== 2) return -1;
  const file = FILE_NAMES.indexOf(name[0] as string);
  const rank = Number.parseInt(name[1] as string, 10) - 1;
  if (file < 0 || !Number.isInteger(rank)) return -1;
  return squareAt(file, rank);
}

/** a1 is dark, so a square is light when file and rank have different parity. */
export const isLightSquare = (square: number): boolean =>
  (fileOf(square) + rankOf(square)) % 2 === 1;

export interface CastlingRights {
  readonly wk: boolean;
  readonly wq: boolean;
  readonly bk: boolean;
  readonly bq: boolean;
}

export const NO_CASTLING: CastlingRights = { wk: false, wq: false, bk: false, bq: false };
export const ALL_CASTLING: CastlingRights = { wk: true, wq: true, bk: true, bq: true };

export type Board = readonly (Piece | null)[];

export interface Position {
  readonly board: Board;
  readonly turn: Color;
  readonly castling: CastlingRights;
  /** The square a pawn may capture onto, not the square the pawn passed. */
  readonly ep: number | null;
  /** Plies since the last capture or pawn move. */
  readonly halfmove: number;
  readonly fullmove: number;
}

export function emptyBoard(): (Piece | null)[] {
  return new Array<Piece | null>(SQUARE_COUNT).fill(null);
}

const BACK_RANK: readonly PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export function initialBoard(): (Piece | null)[] {
  const board = emptyBoard();
  for (let file = 0; file < 8; file += 1) {
    board[squareAt(file, 7)] = piece('b', BACK_RANK[file] as PieceType);
    board[squareAt(file, 6)] = piece('b', 'p');
    board[squareAt(file, 1)] = piece('w', 'p');
    board[squareAt(file, 0)] = piece('w', BACK_RANK[file] as PieceType);
  }
  return board;
}

export function initialPosition(): Position {
  return {
    board: initialBoard(),
    turn: 'w',
    castling: ALL_CASTLING,
    ep: null,
    halfmove: 0,
    fullmove: 1,
  };
}

export const pieceAt = (position: Position, square: number): Piece | null =>
  isSquare(square) ? (position.board[square] ?? null) : null;

/** The king's square, or −1 in a position that has none (test positions do). */
export function kingSquare(board: Board, color: Color): number {
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = board[square];
    if (found && found.type === 'k' && found.color === color) return square;
  }
  return -1;
}

/** Every square holding a piece of `color`. */
export function squaresOf(board: Board, color: Color): number[] {
  const found: number[] = [];
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const held = board[square];
    if (held && held.color === color) found.push(square);
  }
  return found;
}

/** Castling right for one side of one colour. */
export function hasRight(rights: CastlingRights, color: Color, side: 'k' | 'q'): boolean {
  if (color === 'w') return side === 'k' ? rights.wk : rights.wq;
  return side === 'k' ? rights.bk : rights.bq;
}

export function withoutRights(
  rights: CastlingRights,
  ...keys: Array<keyof CastlingRights>
): CastlingRights {
  let next = rights;
  for (const key of keys) {
    if (!next[key]) continue;
    next = { ...next, [key]: false };
  }
  return next;
}
