/**
 * Perft: count the leaves of the move tree to a fixed depth.
 *
 * It is the only honest test of a move generator. Every published number is a
 * fact about chess, not about this code, so when a count disagrees the
 * generator is wrong.
 */

import type { Position } from './board';
import { applyMove, legalMoves, type Move, toUci } from './moves';

export function perft(position: Position, depth: number): number {
  if (depth <= 0) return 1;
  const moves = legalMoves(position);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(applyMove(position, move), depth - 1);
  return total;
}

export interface PerftBranch {
  move: string;
  nodes: number;
}

/** Per-move counts, the way a mismatch is tracked down to the move that causes it. */
export function perftDivide(position: Position, depth: number): PerftBranch[] {
  return legalMoves(position)
    .map((move: Move) => ({
      move: toUci(move),
      nodes: perft(applyMove(position, move), depth - 1),
    }))
    .sort((a, b) => (a.move < b.move ? -1 : 1));
}
