/**
 * Standard Algebraic Notation, both directions.
 *
 * Writing it is mostly disambiguation: a move names the file, the rank, or
 * both, and only when another legal move of the same piece could reach the
 * same square. Reading it back is the same rules run backwards — the text
 * narrows the legal move list until one move is left, which is why an
 * ambiguous or impossible move comes back as null rather than as a guess.
 */

import {
  FILE_NAMES,
  fileOf,
  type PieceType,
  type Position,
  PROMOTION_PIECES,
  rankOf,
  squareFrom,
  squareName,
} from './board';
import { applyMove, isKingAttacked, legalMoves, type Move } from './moves';

const LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** "+" when the move gives check, "#" when that check is mate. */
function suffixFor(position: Position, move: Move): string {
  const next = applyMove(position, move);
  if (!isKingAttacked(next.board, next.turn)) return '';
  return legalMoves(next).length === 0 ? '#' : '+';
}

/**
 * How much of the origin square the move has to name. Only moves of the same
 * piece type to the same square compete, and a king never needs it.
 */
export function disambiguation(move: Move, legal: readonly Move[]): string {
  if (move.piece === 'p' || move.piece === 'k') return '';
  const rivals = legal.filter(
    (other) =>
      other.piece === move.piece &&
      other.to === move.to &&
      other.from !== move.from &&
      other.color === move.color,
  );
  if (rivals.length === 0) return '';
  const file = FILE_NAMES[fileOf(move.from)] as string;
  if (!rivals.some((other) => fileOf(other.from) === fileOf(move.from))) return file;
  if (!rivals.some((other) => rankOf(other.from) === rankOf(move.from)))
    return String(rankOf(move.from) + 1);
  return squareName(move.from);
}

/**
 * The move in SAN. `legal` is the legal move list of `position`; pass it when
 * writing a whole move list so it is generated once per position.
 */
export function toSan(position: Position, move: Move, legal?: readonly Move[]): string {
  if (move.kind === 'castle-king') return `O-O${suffixFor(position, move)}`;
  if (move.kind === 'castle-queen') return `O-O-O${suffixFor(position, move)}`;

  const moves = legal ?? legalMoves(position);
  const target = squareName(move.to);
  const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
  const body =
    move.piece === 'p'
      ? move.capture
        ? `${FILE_NAMES[fileOf(move.from)]}x${target}`
        : target
      : `${LETTER[move.piece]}${disambiguation(move, moves)}${move.capture ? 'x' : ''}${target}`;
  return `${body}${promotion}${suffixFor(position, move)}`;
}

const CASTLE_KING = /^(?:O-O|0-0)$/;
const CASTLE_QUEEN = /^(?:O-O-O|0-0-0)$/;
const MOVE_TEXT = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBNqrbn]))?$/;

/** Strip the decorations SAN allows but does not need: !?, +#, and "e.p.". */
function clean(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '')
    .replace(/e\.p\.?$/i, '')
    .replace(/[+#!?]+$/, '');
}

/** Read one move in SAN against a position. Null when it is not a legal move. */
export function parseSan(position: Position, text: string): Move | null {
  const cleaned = clean(text);
  if (cleaned === '') return null;
  const legal = legalMoves(position);

  if (CASTLE_QUEEN.test(cleaned)) return legal.find((move) => move.kind === 'castle-queen') ?? null;
  if (CASTLE_KING.test(cleaned)) return legal.find((move) => move.kind === 'castle-king') ?? null;

  const parts = MOVE_TEXT.exec(cleaned);
  if (!parts) return null;
  const [, letter, fromFile, fromRank, capture, target, promoted] = parts;
  const to = squareFrom(target as string);
  if (to < 0) return null;

  const type: PieceType = letter ? (letter.toLowerCase() as PieceType) : 'p';
  const promotion = promoted
    ? (PROMOTION_PIECES.find((p) => p === promoted.toLowerCase()) ?? null)
    : null;
  if (promoted && !promotion) return null;

  const matches = legal.filter((move) => {
    if (move.piece !== type || move.to !== to) return false;
    if (move.kind === 'castle-king' || move.kind === 'castle-queen') return false;
    if (move.promotion !== promotion) return false;
    if (fromFile && FILE_NAMES[fileOf(move.from)] !== fromFile) return false;
    if (fromRank && rankOf(move.from) + 1 !== Number.parseInt(fromRank, 10)) return false;
    // "exd5" names the file it comes from; a pawn push never carries an "x".
    if (capture && !move.capture) return false;
    if (type === 'p' && !capture && move.capture) return false;
    return true;
  });
  return matches.length === 1 ? (matches[0] as Move) : null;
}

/** Play a list of SAN moves. Stops at the first move that does not fit. */
export function playSan(
  position: Position,
  moves: readonly string[],
): { position: Position; played: Move[]; rejected: string | null } {
  let current = position;
  const played: Move[] = [];
  for (const text of moves) {
    const move = parseSan(current, text);
    if (!move) return { position: current, played, rejected: text };
    played.push(move);
    current = applyMove(current, move);
  }
  return { position: current, played, rejected: null };
}
