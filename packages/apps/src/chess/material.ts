/**
 * What each side has taken, and who is ahead.
 *
 * Two different questions, answered from two different places. The captured
 * pieces are what the starting position had and the current one does not, so
 * a game set up from a FEN counts from that position rather than from a full
 * set. The balance is counted from the pieces still on the board, which is the
 * only way a promoted pawn scores as the queen it became.
 */

import { type Color, PIECE_TYPES, type PieceType, type Position, SQUARE_COUNT } from './board';

/** What a piece is worth on a score sheet — the numbers a player counts with. */
export const MATERIAL_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Captured pieces are shown heaviest first, the way they are set down beside a board. */
export const CAPTURE_ORDER: readonly PieceType[] = ['q', 'r', 'b', 'n', 'p'];

export type Census = Record<Color, Record<PieceType, number>>;

function emptyCensus(): Census {
  const side = (): Record<PieceType, number> => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });
  return { w: side(), b: side() };
}

/** How many of each piece each colour has on the board. */
export function census(position: Position): Census {
  const counted = emptyCensus();
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    if (found) counted[found.color][found.type] += 1;
  }
  return counted;
}

/** The points a colour has on the board, kings excluded as always. */
export function points(position: Position, color: Color): number {
  const counted = census(position)[color];
  let total = 0;
  for (const type of PIECE_TYPES) total += counted[type] * MATERIAL_VALUES[type];
  return total;
}

export interface Material {
  /** The pieces each colour has lost, heaviest first. */
  lost: Record<Color, PieceType[]>;
  /** Points White is ahead by. Negative when Black is ahead, zero when level. */
  balance: number;
}

/**
 * The material of a game: what has been taken off since `start`, and who is
 * ahead in `now`. A promotion can leave a side with more of a piece than it
 * began with; that is not a capture, so the count stops at zero.
 */
export function material(start: Position, now: Position): Material {
  const before = census(start);
  const after = census(now);
  const lost: Record<Color, PieceType[]> = { w: [], b: [] };
  for (const color of ['w', 'b'] as const) {
    for (const type of CAPTURE_ORDER) {
      const taken = Math.max(0, before[color][type] - after[color][type]);
      for (let n = 0; n < taken; n += 1) lost[color].push(type);
    }
  }
  return { lost, balance: points(now, 'w') - points(now, 'b') };
}

/** "+3" for the side that is ahead, an empty string for the side that is not. */
export function leadLabel(balance: number, color: Color): string {
  const lead = color === 'w' ? balance : -balance;
  return lead > 0 ? `+${lead}` : '';
}
