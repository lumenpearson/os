/**
 * Move generation.
 *
 * Two stages, in the order every correct generator uses them: pseudo-legal
 * moves for each piece, then a legality filter that plays the move and asks
 * whether the mover's own king is attacked afterwards. Playing the move is
 * what makes the awkward cases fall out for free — the pinned piece, the king
 * walking along a checking ray, and above all the en passant capture that
 * removes two pawns from one rank and opens a line onto the king.
 *
 * Castling is the one rule the filter cannot see on its own: the king may not
 * start in, pass through, or land on an attacked square, and only the last of
 * those is a property of the position the move leads to. The generator checks
 * all three.
 */

import {
  type Board,
  type CastlingRights,
  type Color,
  fileOf,
  hasRight,
  isSquare,
  kingSquare,
  opposite,
  type Piece,
  type PieceType,
  type Position,
  PROMOTION_PIECES,
  type PromotionPiece,
  piece,
  rankOf,
  SQUARE_COUNT,
  squareAt,
  squareFrom,
  squareName,
  withoutRights,
} from './board';

export type MoveKind = 'normal' | 'double-pawn' | 'en-passant' | 'castle-king' | 'castle-queen';

export interface Move {
  readonly from: number;
  readonly to: number;
  readonly piece: PieceType;
  readonly color: Color;
  /** The type captured, including the pawn taken en passant. */
  readonly capture: PieceType | null;
  readonly promotion: PromotionPiece | null;
  readonly kind: MoveKind;
}

const KNIGHT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

const ORTHOGONALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const KING_STEPS = [...DIAGONALS, ...ORTHOGONALS];

/** Where a pawn of `color` comes from when it attacks a square. */
const pawnBack = (color: Color): number => (color === 'w' ? -1 : 1);

/** Is `square` attacked by any piece of `byColor`? Squares off the board are not. */
export function isSquareAttacked(board: Board, square: number, byColor: Color): boolean {
  if (!isSquare(square)) return false;
  const file = fileOf(square);
  const rank = rankOf(square);

  for (const step of [-1, 1]) {
    const from = squareAt(file + step, rank + pawnBack(byColor));
    const held = from < 0 ? null : board[from];
    if (held && held.color === byColor && held.type === 'p') return true;
  }

  for (const [df, dr] of KNIGHT_STEPS) {
    const from = squareAt(file + df, rank + dr);
    const held = from < 0 ? null : board[from];
    if (held && held.color === byColor && held.type === 'n') return true;
  }

  for (const [df, dr] of KING_STEPS) {
    const from = squareAt(file + df, rank + dr);
    const held = from < 0 ? null : board[from];
    if (held && held.color === byColor && held.type === 'k') return true;
  }

  for (const [df, dr] of DIAGONALS) {
    if (slidesTo(board, file, rank, df, dr, byColor, 'b')) return true;
  }
  for (const [df, dr] of ORTHOGONALS) {
    if (slidesTo(board, file, rank, df, dr, byColor, 'r')) return true;
  }
  return false;
}

/** Walk one ray outwards; the first piece decides, and a queen counts on every ray. */
function slidesTo(
  board: Board,
  file: number,
  rank: number,
  df: number,
  dr: number,
  byColor: Color,
  type: 'b' | 'r',
): boolean {
  for (let step = 1; step < 8; step += 1) {
    const at = squareAt(file + df * step, rank + dr * step);
    if (at < 0) return false;
    const held = board[at];
    if (!held) continue;
    return held.color === byColor && (held.type === type || held.type === 'q');
  }
  return false;
}

/** Is the side to move — or the side named — in check? */
export function isKingAttacked(board: Board, color: Color): boolean {
  const king = kingSquare(board, color);
  return king >= 0 && isSquareAttacked(board, king, opposite(color));
}

function push(
  moves: Move[],
  from: number,
  to: number,
  moving: Piece,
  capture: PieceType | null,
  kind: MoveKind = 'normal',
): void {
  moves.push({ from, to, piece: moving.type, color: moving.color, capture, promotion: null, kind });
}

function pushPawn(
  moves: Move[],
  from: number,
  to: number,
  moving: Piece,
  capture: PieceType | null,
  kind: MoveKind,
): void {
  const last = moving.color === 'w' ? 7 : 0;
  if (rankOf(to) === last) {
    for (const promotion of PROMOTION_PIECES) {
      moves.push({ from, to, piece: 'p', color: moving.color, capture, promotion, kind: 'normal' });
    }
    return;
  }
  moves.push({ from, to, piece: 'p', color: moving.color, capture, promotion: null, kind });
}

export interface GenerateOptions {
  /** Captures, en passant and promotions only — what quiescence search looks at. */
  capturesOnly?: boolean;
}

/** Every move the pieces can make, before asking whether the king survives it. */
export function pseudoLegalMoves(position: Position, options: GenerateOptions = {}): Move[] {
  const { board, turn } = position;
  const moves: Move[] = [];
  for (let from = 0; from < SQUARE_COUNT; from += 1) {
    const moving = board[from];
    if (!moving || moving.color !== turn) continue;
    switch (moving.type) {
      case 'p':
        pawnMoves(position, from, moving, moves, options);
        break;
      case 'n':
        stepMoves(board, from, moving, KNIGHT_STEPS, moves, options);
        break;
      case 'k':
        stepMoves(board, from, moving, KING_STEPS, moves, options);
        break;
      case 'b':
        rayMoves(board, from, moving, DIAGONALS, moves, options);
        break;
      case 'r':
        rayMoves(board, from, moving, ORTHOGONALS, moves, options);
        break;
      case 'q':
        rayMoves(board, from, moving, KING_STEPS, moves, options);
        break;
    }
  }
  if (!options.capturesOnly) castlingMoves(position, moves);
  return moves;
}

function pawnMoves(
  position: Position,
  from: number,
  moving: Piece,
  moves: Move[],
  options: GenerateOptions,
): void {
  const { board } = position;
  const file = fileOf(from);
  const rank = rankOf(from);
  const forward = moving.color === 'w' ? 1 : -1;
  const start = moving.color === 'w' ? 1 : 6;
  const last = moving.color === 'w' ? 7 : 0;

  const ahead = squareAt(file, rank + forward);
  const promotes = rank + forward === last;
  if (ahead >= 0 && !board[ahead] && (!options.capturesOnly || promotes)) {
    pushPawn(moves, from, ahead, moving, null, 'normal');
    const twice = squareAt(file, rank + forward * 2);
    if (rank === start && twice >= 0 && !board[twice] && !options.capturesOnly) {
      pushPawn(moves, from, twice, moving, null, 'double-pawn');
    }
  }

  for (const side of [-1, 1]) {
    const to = squareAt(file + side, rank + forward);
    if (to < 0) continue;
    const target = board[to];
    if (target && target.color !== moving.color) {
      pushPawn(moves, from, to, moving, target.type, 'normal');
    } else if (!target && position.ep === to) {
      pushPawn(moves, from, to, moving, 'p', 'en-passant');
    }
  }
}

function stepMoves(
  board: Board,
  from: number,
  moving: Piece,
  steps: ReadonlyArray<readonly [number, number]>,
  moves: Move[],
  options: GenerateOptions,
): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of steps) {
    const to = squareAt(file + df, rank + dr);
    if (to < 0) continue;
    const target = board[to];
    if (target?.color === moving.color) continue;
    if (!target && options.capturesOnly) continue;
    push(moves, from, to, moving, target ? target.type : null);
  }
}

function rayMoves(
  board: Board,
  from: number,
  moving: Piece,
  directions: ReadonlyArray<readonly [number, number]>,
  moves: Move[],
  options: GenerateOptions,
): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of directions) {
    for (let step = 1; step < 8; step += 1) {
      const to = squareAt(file + df * step, rank + dr * step);
      if (to < 0) break;
      const target = board[to];
      if (!target) {
        if (!options.capturesOnly) push(moves, from, to, moving, null);
        continue;
      }
      if (target.color !== moving.color) push(moves, from, to, moving, target.type);
      break;
    }
  }
}

/** Where each side's king and rooks stand when castling is still possible. */
const CASTLE_HOME = {
  w: {
    king: squareAt(4, 0),
    k: {
      rook: squareAt(7, 0),
      through: [squareAt(5, 0), squareAt(6, 0)],
      empty: [squareAt(5, 0), squareAt(6, 0)],
      to: squareAt(6, 0),
    },
    q: {
      rook: squareAt(0, 0),
      through: [squareAt(3, 0), squareAt(2, 0)],
      empty: [squareAt(3, 0), squareAt(2, 0), squareAt(1, 0)],
      to: squareAt(2, 0),
    },
  },
  b: {
    king: squareAt(4, 7),
    k: {
      rook: squareAt(7, 7),
      through: [squareAt(5, 7), squareAt(6, 7)],
      empty: [squareAt(5, 7), squareAt(6, 7)],
      to: squareAt(6, 7),
    },
    q: {
      rook: squareAt(0, 7),
      through: [squareAt(3, 7), squareAt(2, 7)],
      empty: [squareAt(3, 7), squareAt(2, 7), squareAt(1, 7)],
      to: squareAt(2, 7),
    },
  },
} as const;

function castlingMoves(position: Position, moves: Move[]): void {
  const { board, turn, castling } = position;
  const home = CASTLE_HOME[turn];
  const king = board[home.king];
  if (king?.type !== 'k' || king.color !== turn) return;
  const enemy = opposite(turn);
  // Starting in check is not a castling move; testing it once covers both sides.
  if (isSquareAttacked(board, home.king, enemy)) return;

  for (const side of ['k', 'q'] as const) {
    if (!hasRight(castling, turn, side)) continue;
    const plan = home[side];
    const rook = board[plan.rook];
    if (rook?.type !== 'r' || rook.color !== turn) continue;
    if (plan.empty.some((square) => board[square])) continue;
    // The landing square is covered by the legality filter; the square the
    // king crosses is not, so it is checked here.
    if (plan.through.some((square) => isSquareAttacked(board, square, enemy))) continue;
    push(moves, home.king, plan.to, king, null, side === 'k' ? 'castle-king' : 'castle-queen');
  }
}

/** The castling rights a square losing its occupant costs, king moves aside. */
function rightsAfter(rights: CastlingRights, move: Move): CastlingRights {
  let next = rights;
  if (move.piece === 'k') {
    next = move.color === 'w' ? withoutRights(next, 'wk', 'wq') : withoutRights(next, 'bk', 'bq');
  }
  for (const square of [move.from, move.to]) {
    if (square === CASTLE_HOME.w.k.rook) next = withoutRights(next, 'wk');
    else if (square === CASTLE_HOME.w.q.rook) next = withoutRights(next, 'wq');
    else if (square === CASTLE_HOME.b.k.rook) next = withoutRights(next, 'bk');
    else if (square === CASTLE_HOME.b.q.rook) next = withoutRights(next, 'bq');
  }
  return next;
}

/** Play a move. The move must have come from this position's generator. */
export function applyMove(position: Position, move: Move): Position {
  const board = position.board.slice();
  const moving = board[move.from];
  board[move.from] = null;
  board[move.to] = move.promotion
    ? piece(move.color, move.promotion)
    : (moving ?? piece(move.color, move.piece));

  if (move.kind === 'en-passant') {
    const captured = squareAt(fileOf(move.to), rankOf(move.from));
    if (captured >= 0) board[captured] = null;
  } else if (move.kind === 'castle-king' || move.kind === 'castle-queen') {
    const home = CASTLE_HOME[move.color];
    const plan = move.kind === 'castle-king' ? home.k : home.q;
    const rook = board[plan.rook];
    board[plan.rook] = null;
    // The rook lands on the square the king crossed.
    board[plan.through[0] as number] = rook ?? piece(move.color, 'r');
  }

  const doubled = move.kind === 'double-pawn';
  return {
    board,
    turn: opposite(position.turn),
    castling: rightsAfter(position.castling, move),
    ep: doubled ? squareAt(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2) : null,
    halfmove: move.piece === 'p' || move.capture ? 0 : position.halfmove + 1,
    fullmove: position.turn === 'b' ? position.fullmove + 1 : position.fullmove,
  };
}

/**
 * Does this move leave its own king safe?
 *
 * The move is played onto a copy of the board and nothing else: the rights,
 * the clocks and the en passant square cannot put a king in check, and
 * skipping them keeps the filter cheap enough to run on every pseudo-legal
 * move of every node. `king` is where the moving side's king stands before
 * the move, which the caller already knows once per position.
 */
function leavesKingSafe(position: Position, move: Move, king: number): boolean {
  const board = position.board.slice();
  board[move.from] = null;
  board[move.to] = move.promotion
    ? piece(move.color, move.promotion)
    : (position.board[move.from] ?? piece(move.color, move.piece));
  if (move.kind === 'en-passant') {
    const captured = squareAt(fileOf(move.to), rankOf(move.from));
    if (captured >= 0) board[captured] = null;
  }
  // The rook of a castling move never stands between the king and an
  // attacker — castling out of check is already refused — so it stays put.
  const at = move.piece === 'k' ? move.to : king;
  return at < 0 || !isSquareAttacked(board, at, opposite(move.color));
}

/** Does this move leave its own king safe? */
export function isLegal(position: Position, move: Move): boolean {
  return leavesKingSafe(position, move, kingSquare(position.board, move.color));
}

/** Every move the side to move may actually play. */
export function legalMoves(position: Position): Move[] {
  const king = kingSquare(position.board, position.turn);
  return pseudoLegalMoves(position).filter((move) => leavesKingSafe(position, move, king));
}

/** The legal moves starting on one square — what the board draws as targets. */
export function movesFrom(position: Position, from: number): Move[] {
  return legalMoves(position).filter((move) => move.from === from);
}

/** The legal move matching a from/to pair, choosing the promotion asked for. */
export function findMove(
  position: Position,
  from: number,
  to: number,
  promotion: PromotionPiece | null = null,
): Move | null {
  const candidates = legalMoves(position).filter((move) => move.from === from && move.to === to);
  if (candidates.length === 0) return null;
  if (promotion) return candidates.find((move) => move.promotion === promotion) ?? null;
  return candidates.find((move) => move.promotion === null) ?? candidates[0] ?? null;
}

export const moveEquals = (a: Move, b: Move): boolean =>
  a.from === b.from && a.to === b.to && a.promotion === b.promotion;

/** Long algebraic coordinates, the form a saved game keeps. */
export const toUci = (move: Move): string =>
  `${squareName(move.from)}${squareName(move.to)}${move.promotion ?? ''}`;

export function fromUci(position: Position, uci: string): Move | null {
  if (uci.length !== 4 && uci.length !== 5) return null;
  const from = squareFrom(uci.slice(0, 2));
  const to = squareFrom(uci.slice(2, 4));
  if (from < 0 || to < 0) return null;
  const suffix = uci.length === 5 ? uci[4] : null;
  const promotion = PROMOTION_PIECES.find((p) => p === suffix) ?? null;
  if (uci.length === 5 && !promotion) return null;
  return findMove(position, from, to, promotion);
}
