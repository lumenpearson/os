/**
 * How a game ends.
 *
 * Check, mate and stalemate come straight out of the move generator. The
 * three draws that do not are material, the fifty-move clock and repetition.
 *
 * Repetition compares position keys, not FENs: two positions repeat when the
 * placement, the side to move, the castling rights and the available en
 * passant capture all match. The en passant square only counts when a capture
 * onto it actually exists, otherwise a pawn's double step would make every
 * position that follows it look new.
 */

import {
  type Color,
  isLightSquare,
  opposite,
  type PieceType,
  type Position,
  SQUARE_COUNT,
} from './board';
import { castlingField } from './fen';
import { isKingAttacked, legalMoves, pseudoLegalMoves } from './moves';

/** Plies without a capture or a pawn move that make the game a draw. */
export const FIFTY_MOVE_PLIES = 100;
/** How many times a position has to appear for the draw. */
export const REPETITION_LIMIT = 3;

export function inCheck(position: Position): boolean {
  return isKingAttacked(position.board, position.turn);
}

export function hasLegalMoves(position: Position): boolean {
  return legalMoves(position).length > 0;
}

export function isCheckmate(position: Position): boolean {
  return inCheck(position) && !hasLegalMoves(position);
}

export function isStalemate(position: Position): boolean {
  return !inCheck(position) && !hasLegalMoves(position);
}

/**
 * The four endings where mate is impossible with any sequence of legal moves:
 * bare kings, king and bishop, king and knight, and bishops of one colour.
 */
export function insufficientMaterial(position: Position): boolean {
  const minor: Record<Color, PieceType[]> = { w: [], b: [] };
  const bishops: number[] = [];
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    if (!found || found.type === 'k') continue;
    if (found.type === 'p' || found.type === 'r' || found.type === 'q') return false;
    minor[found.color].push(found.type);
    if (found.type === 'b') bishops.push(square);
  }
  const count = minor.w.length + minor.b.length;
  if (count === 0) return true;
  if (count === 1) return true;
  if (count === 2 && bishops.length === 2 && minor.w.length === 1 && minor.b.length === 1) {
    return isLightSquare(bishops[0] as number) === isLightSquare(bishops[1] as number);
  }
  return false;
}

/** Is there a pawn that could take en passant right now? */
function epIsLive(position: Position): boolean {
  if (position.ep === null) return false;
  return pseudoLegalMoves(position).some((move) => move.kind === 'en-passant');
}

/**
 * The identity of a position for repetition: placement, side to move,
 * castling rights, and the en passant square when it can be used.
 */
export function positionKey(position: Position): string {
  let placement = '';
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    placement += found ? (found.color === 'w' ? found.type.toUpperCase() : found.type) : '.';
  }
  const ep = epIsLive(position) ? String(position.ep) : '-';
  return `${placement} ${position.turn} ${castlingField(position.castling)} ${ep}`;
}

/** How often `key` appears in a list of keys. */
export function countKey(keys: readonly string[], key: string): number {
  let seen = 0;
  for (const other of keys) if (other === key) seen += 1;
  return seen;
}

export type DrawReason =
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move'
  | 'threefold-repetition'
  | 'agreement';

export type Outcome =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'resignation'; winner: Color }
  | { kind: 'draw'; reason: DrawReason };

/**
 * The state of a game. `keys` holds the key of every position the game has
 * been in, this one included, and the count of this position's own key among
 * them is what a threefold means.
 */
export function outcome(
  position: Position,
  keys: readonly string[] = [],
  resigned: Color | null = null,
): Outcome {
  if (resigned) return { kind: 'resignation', winner: opposite(resigned) };
  if (!hasLegalMoves(position)) {
    return inCheck(position)
      ? { kind: 'checkmate', winner: opposite(position.turn) }
      : { kind: 'draw', reason: 'stalemate' };
  }
  if (insufficientMaterial(position)) return { kind: 'draw', reason: 'insufficient-material' };
  if (keys.length > 0 && countKey(keys, positionKey(position)) >= REPETITION_LIMIT)
    return { kind: 'draw', reason: 'threefold-repetition' };
  if (position.halfmove >= FIFTY_MOVE_PLIES) return { kind: 'draw', reason: 'fifty-move' };
  return { kind: 'playing', check: inCheck(position) };
}

export const isOver = (result: Outcome): boolean => result.kind !== 'playing';

/** The PGN result token for an outcome. */
export function resultToken(result: Outcome): string {
  switch (result.kind) {
    case 'checkmate':
    case 'resignation':
      return result.winner === 'w' ? '1-0' : '0-1';
    case 'draw':
      return '1/2-1/2';
    case 'playing':
      return '*';
  }
}
