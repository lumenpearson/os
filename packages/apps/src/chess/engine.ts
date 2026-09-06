/**
 * The opponent: negamax with alpha-beta, iterative deepening, MVV-LVA
 * ordering and a quiescence search on captures, over a material and
 * piece-square evaluation.
 *
 * Two things matter as much as the strength. It is bounded — a node budget
 * and a time budget, both checked inside the recursion, so a search cannot
 * run away. And it is resumable — the deepening loop is a generator, so the
 * caller can hand the window back between iterations and the board keeps
 * painting while the engine thinks.
 *
 * The piece-square tables are the published "simplified evaluation" set,
 * written from White's side with a8 first, which is the order squares are
 * numbered here; Black reads the same table mirrored with `square ^ 56`.
 */

import { type PieceType, type Position, SQUARE_COUNT } from './board';
import {
  applyMove,
  isKingAttacked,
  isLegal,
  legalMoves,
  type Move,
  moveEquals,
  pseudoLegalMoves,
} from './moves';
import { insufficientMaterial, positionKey } from './rules';

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/** A mate is worth more than any material; the ply keeps the shortest one preferred. */
export const MATE_SCORE = 100_000;
const INFINITY = 1_000_000;
/** How deep the capture search may run past the nominal depth. */
const MAX_QUIESCENCE_PLY = 8;
/** Nodes between two readings of the clock. */
const CLOCK_INTERVAL = 1024;

const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10,
  25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10,
  10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0,
  -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5,
  -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
  0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5,
  5, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5,
  0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0,
  -10, -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MIDDLE_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
  -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
  -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
  10, 30, 20,
];

const KING_END_TABLE = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30,
  20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10,
  20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];

const TABLES: Record<PieceType, readonly number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MIDDLE_TABLE,
};

/** Below this much material on the board the king belongs in the middle. */
const ENDGAME_MATERIAL = 1500;

/** Material and placement, in centipawns, from the point of view of the side to move. */
export function evaluate(position: Position): number {
  let white = 0;
  let black = 0;
  let heavy = 0;
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    if (!found || found.type === 'k') continue;
    const value = PIECE_VALUES[found.type];
    if (found.type !== 'p') heavy += value;
    if (found.color === 'w') white += value;
    else black += value;
  }
  const endgame = heavy <= ENDGAME_MATERIAL;
  for (let square = 0; square < SQUARE_COUNT; square += 1) {
    const found = position.board[square];
    if (!found) continue;
    const table =
      found.type === 'k' ? (endgame ? KING_END_TABLE : KING_MIDDLE_TABLE) : TABLES[found.type];
    const bonus = table[found.color === 'w' ? square : square ^ 56] ?? 0;
    if (found.color === 'w') white += bonus;
    else black += bonus;
  }
  const score = white - black;
  return position.turn === 'w' ? score : -score;
}

/** Most valuable victim, least valuable attacker, then promotions. */
function orderScore(move: Move, preferred: Move | null): number {
  if (preferred && moveEquals(move, preferred)) return 1_000_000;
  let score = 0;
  if (move.capture) score += 10_000 + PIECE_VALUES[move.capture] * 10 - PIECE_VALUES[move.piece];
  if (move.promotion) score += 5_000 + PIECE_VALUES[move.promotion];
  return score;
}

/** Captures first, best victim first, with the previous iteration's best move ahead of everything. */
export function orderMoves(moves: Move[], preferred: Move | null = null): Move[] {
  return moves
    .map((move) => ({ move, score: orderScore(move, preferred) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

interface Context {
  nodes: number;
  budget: number;
  deadline: number;
  aborted: boolean;
  /** Position keys already on the board, so a repetition inside the search is a draw. */
  seen: Map<string, number>;
  now: () => number;
}

function outOfBudget(context: Context): boolean {
  if (context.aborted) return true;
  if (context.nodes >= context.budget) {
    context.aborted = true;
    return true;
  }
  if (context.nodes % CLOCK_INTERVAL === 0 && context.now() >= context.deadline) {
    context.aborted = true;
    return true;
  }
  return false;
}

/** A position that cannot be won by either side, or has run the clock out. */
function drawn(position: Position): boolean {
  return position.halfmove >= 100 || insufficientMaterial(position);
}

function quiescence(
  position: Position,
  alpha: number,
  beta: number,
  context: Context,
  ply: number,
): number {
  if (outOfBudget(context)) return alpha;
  context.nodes += 1;
  if (drawn(position)) return 0;

  const check = isKingAttacked(position.board, position.turn);
  let best = alpha;
  if (!check) {
    // Standing pat is only sound when the side to move is not forced to act.
    const stand = evaluate(position);
    if (stand >= beta) return beta;
    if (stand > best) best = stand;
    if (ply >= MAX_QUIESCENCE_PLY) return best;
  }

  const candidates = check
    ? legalMoves(position)
    : pseudoLegalMoves(position, { capturesOnly: true }).filter((move) => isLegal(position, move));
  if (candidates.length === 0) {
    return check ? -(MATE_SCORE - ply) : best;
  }

  for (const move of orderMoves(candidates)) {
    const score = -quiescence(applyMove(position, move), -beta, -best, context, ply + 1);
    if (context.aborted) return best;
    if (score >= beta) return beta;
    if (score > best) best = score;
  }
  return best;
}

function negamax(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  context: Context,
  ply: number,
): number {
  if (outOfBudget(context)) return alpha;
  context.nodes += 1;
  if (drawn(position)) return 0;

  // A position seen before in this game or on this line is a draw to aim for
  // when losing and to avoid when winning; either way it scores zero.
  const key = position.halfmove >= 4 ? positionKey(position) : null;
  if (key !== null && (context.seen.get(key) ?? 0) > 0) return 0;

  if (depth <= 0) return quiescence(position, alpha, beta, context, ply);

  const moves = legalMoves(position);
  if (moves.length === 0) {
    return isKingAttacked(position.board, position.turn) ? -(MATE_SCORE - ply) : 0;
  }

  if (key !== null) context.seen.set(key, (context.seen.get(key) ?? 0) + 1);
  let best = alpha;
  for (const move of orderMoves(moves)) {
    const score = -negamax(applyMove(position, move), depth - 1, -beta, -best, context, ply + 1);
    if (context.aborted) break;
    if (score >= beta) {
      best = beta;
      break;
    }
    if (score > best) best = score;
  }
  if (key !== null) {
    const count = (context.seen.get(key) ?? 1) - 1;
    if (count > 0) context.seen.set(key, count);
    else context.seen.delete(key);
  }
  return best;
}

export interface RootMove {
  move: Move;
  score: number;
}

export interface SearchOptions {
  /** Hard ceiling on nodes. The search stops mid-iteration when it is reached. */
  nodes?: number;
  /** Deepest iteration to attempt. */
  depth?: number;
  /** Milliseconds the whole search may take. */
  timeMs?: number;
  /** Position keys the game has already been in, for repetition. */
  history?: readonly string[];
  /** Clock, injectable so tests are not at the mercy of the real one. */
  now?: () => number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  /** The deepest iteration that finished. 0 when none did. */
  depth: number;
  nodes: number;
  /** Root moves best first, from the last finished iteration. */
  moves: RootMove[];
}

const DEFAULTS = { nodes: 60_000, depth: 4, timeMs: 2_000 };

function makeContext(options: SearchOptions): Context {
  const now = options.now ?? (() => Date.now());
  const seen = new Map<string, number>();
  for (const key of options.history ?? []) seen.set(key, (seen.get(key) ?? 0) + 1);
  return {
    nodes: 0,
    budget: Math.max(1, options.nodes ?? DEFAULTS.nodes),
    deadline: now() + Math.max(1, options.timeMs ?? DEFAULTS.timeMs),
    aborted: false,
    seen,
    now,
  };
}

/**
 * Iterative deepening, one iteration per step. The caller decides what
 * happens between them: `search` runs them back to back, `searchAsync` hands
 * the window back first.
 */
export function* deepen(
  position: Position,
  options: SearchOptions = {},
): Generator<SearchResult, SearchResult, void> {
  const context = makeContext(options);
  const maxDepth = Math.max(1, options.depth ?? DEFAULTS.depth);
  const root = legalMoves(position);
  let result: SearchResult = {
    move: root[0] ?? null,
    score: 0,
    depth: 0,
    nodes: 0,
    moves: root.map((move) => ({ move, score: 0 })),
  };
  if (root.length === 0) return { ...result, move: null, moves: [] };

  // The position on the board counts as seen once, so a line that returns to
  // it is already a repetition from the search's point of view.
  const rootKey = positionKey(position);
  context.seen.set(rootKey, (context.seen.get(rootKey) ?? 0) + 1);

  let preferred: Move | null = null;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const scored: RootMove[] = [];
    for (const move of orderMoves(root, preferred)) {
      // Every root move gets the full window, so the scores can be compared
      // with each other — a weaker level picks among the near-best ones.
      const score = -negamax(applyMove(position, move), depth - 1, -INFINITY, INFINITY, context, 1);
      if (context.aborted) break;
      scored.push({ move, score });
    }
    if (context.aborted || scored.length !== root.length) break;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0] as RootMove;
    preferred = best.move;
    result = { move: best.move, score: best.score, depth, nodes: context.nodes, moves: scored };
    yield result;
    // A forced mate is the end of the useful search.
    if (Math.abs(best.score) >= MATE_SCORE - 100) break;
  }
  return { ...result, nodes: context.nodes };
}

/** Run the whole search now. Bounded, but it does not give the thread back. */
export function search(position: Position, options: SearchOptions = {}): SearchResult {
  const steps = deepen(position, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Let the browser paint between iterations. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * The same search, yielding to the caller between iterations so the window
 * keeps painting. `onDepth` sees each finished iteration.
 */
export async function searchAsync(
  position: Position,
  options: SearchOptions = {},
  hooks: { yieldTo?: () => Promise<void>; onDepth?: (result: SearchResult) => void } = {},
): Promise<SearchResult> {
  const give = hooks.yieldTo ?? nextFrame;
  const steps = deepen(position, options);
  await give();
  let step = steps.next();
  while (!step.done) {
    hooks.onDepth?.(step.value);
    await give();
    step = steps.next();
  }
  return step.value;
}

export type LevelId = 'gentle' | 'casual' | 'club' | 'strong';

export interface Level {
  id: LevelId;
  label: string;
  /** What the level does, in one line, for the control that sets it. */
  note: string;
  depth: number;
  nodes: number;
  timeMs: number;
  /** Centipawns below the best score a move may still be picked from. */
  slack: number;
}

export const LEVELS: readonly Level[] = [
  {
    id: 'gentle',
    label: 'Gentle',
    note: 'Looks one move ahead',
    depth: 1,
    nodes: 4_000,
    timeMs: 300,
    slack: 90,
  },
  {
    id: 'casual',
    label: 'Casual',
    note: 'Looks two moves ahead',
    depth: 2,
    nodes: 20_000,
    timeMs: 600,
    slack: 35,
  },
  {
    id: 'club',
    label: 'Club',
    note: 'Four moves, with tactics',
    depth: 4,
    nodes: 90_000,
    timeMs: 1_500,
    slack: 0,
  },
  {
    id: 'strong',
    label: 'Strong',
    note: 'As deep as two seconds allow',
    depth: 7,
    nodes: 400_000,
    timeMs: 2_500,
    slack: 0,
  },
];

export const DEFAULT_LEVEL: LevelId = 'casual';

export function levelById(id: string): Level {
  return LEVELS.find((level) => level.id === id) ?? (LEVELS[1] as Level);
}

/**
 * The move a level plays: the best one, or one of the moves within `slack` of
 * it, which is how the easier levels stay beatable without playing nonsense.
 */
export function chooseMove(
  moves: readonly RootMove[],
  slack: number,
  random: () => number = Math.random,
): Move | null {
  if (moves.length === 0) return null;
  const best = moves[0] as RootMove;
  if (slack <= 0) return best.move;
  const near = moves.filter((entry) => entry.score >= best.score - slack);
  const index = Math.min(near.length - 1, Math.floor(random() * near.length));
  return (near[index] as RootMove).move;
}
