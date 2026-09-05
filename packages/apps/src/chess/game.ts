/**
 * The game around the rules: the moves played, the positions they passed
 * through, whose side the person is on, and how the game ended.
 *
 * Everything here is pure. The position history is kept in full rather than
 * as a single current position, because three things need it: taking a move
 * back, stepping through the game to look at it, and the threefold rule,
 * which is a fact about every position the game has been in.
 */

import { type Color, opposite, type Position } from './board';
import { DEFAULT_LEVEL, type LevelId } from './engine';
import { INITIAL_FEN, parseFen, toFen } from './fen';
import { applyMove, type Move, movesFrom } from './moves';
import { isOver, type Outcome, outcome, positionKey, resultToken } from './rules';
import { toSan } from './san';

export interface PlayedMove {
  move: Move;
  /** The move in Standard Algebraic Notation, as it reads in the list. */
  san: string;
  /** The position after it. */
  position: Position;
  key: string;
}

export interface Game {
  /** The position the game started from, so a game set up from a FEN works. */
  readonly start: Position;
  readonly played: readonly PlayedMove[];
  /** The colour the person plays; the engine takes the other. */
  readonly side: Color;
  readonly level: LevelId;
  /** Set when somebody resigns; the rules decide every other ending. */
  readonly resigned: Color | null;
  /** How far back the person is looking. Null means the latest position. */
  readonly viewing: number | null;
}

export function newGame(side: Color = 'w', level: LevelId = DEFAULT_LEVEL): Game {
  const parsed = parseFen(INITIAL_FEN);
  if (!parsed.ok) throw new Error(`the initial position does not parse: ${parsed.error}`);
  return { start: parsed.position, played: [], side, level, resigned: null, viewing: null };
}

/** A game from a FEN, or the reason it is not one. */
export function gameFromFen(fen: string, side: Color, level: LevelId): Game | string {
  const parsed = parseFen(fen);
  if (!parsed.ok) return parsed.error;
  return { start: parsed.position, played: [], side, level, resigned: null, viewing: null };
}

/** The position as it stands now, whatever the person happens to be looking at. */
export function current(game: Game): Position {
  const last = game.played[game.played.length - 1];
  return last ? last.position : game.start;
}

/** The position on screen, which is the latest one unless they are looking back. */
export function shown(game: Game): Position {
  if (game.viewing === null) return current(game);
  if (game.viewing <= 0) return game.start;
  const at = game.played[game.viewing - 1];
  return at ? at.position : current(game);
}

/** Every position the game has been in, for the threefold rule. */
export function keys(game: Game): string[] {
  return [positionKey(game.start), ...game.played.map((p) => p.key)];
}

export function status(game: Game): Outcome {
  return outcome(current(game), keys(game), game.resigned);
}

/** True while the person may move: their turn, the latest position, not over. */
export function canMove(game: Game): boolean {
  if (game.viewing !== null) return false;
  if (isOver(status(game))) return false;
  return current(game).turn === game.side;
}

/** True when it is the engine's move and there is a game left to play. */
export function engineToMove(game: Game): boolean {
  return !isOver(status(game)) && current(game).turn === opposite(game.side);
}

/**
 * Play a move. The move must be legal in the current position; callers get
 * their candidates from `movesFrom`, so an illegal one is a bug rather than
 * user input, and this refuses it rather than corrupting the game.
 */
export function play(game: Game, move: Move): Game {
  const position = current(game);
  const legal = movesFrom(position, move.from).find(
    (m) => m.to === move.to && m.promotion === move.promotion,
  );
  if (!legal) return game;
  const san = toSan(position, legal);
  const next = applyMove(position, legal);
  return {
    ...game,
    played: [...game.played, { move: legal, san, position: next, key: positionKey(next) }],
    viewing: null,
  };
}

/**
 * Take back to the person's own last move — one ply if the engine has not
 * replied, two if it has, so Take Back gives them their turn rather than
 * handing it to the engine.
 */
export function takeBack(game: Game): Game {
  if (game.played.length === 0) return game;
  const drop = current(game).turn === game.side ? 2 : 1;
  const played = game.played.slice(0, Math.max(0, game.played.length - drop));
  return { ...game, played, resigned: null, viewing: null };
}

export function resign(game: Game): Game {
  return isOver(status(game)) ? game : { ...game, resigned: game.side };
}

/** Look at the position after `ply` moves; null returns to the latest. */
export function view(game: Game, ply: number | null): Game {
  if (ply === null) return { ...game, viewing: null };
  const clamped = Math.max(0, Math.min(game.played.length, ply));
  return { ...game, viewing: clamped === game.played.length ? null : clamped };
}

export function stepView(game: Game, delta: number): Game {
  const at = game.viewing ?? game.played.length;
  return view(game, at + delta);
}

/** The moves in pairs, as a move list is written. */
export interface MoveRow {
  number: number;
  white: { san: string; ply: number } | null;
  black: { san: string; ply: number } | null;
}

export function moveRows(game: Game): MoveRow[] {
  const first = game.start.fullmove;
  const offset = game.start.turn === 'b' ? 1 : 0;
  const rows: MoveRow[] = [];
  game.played.forEach((entry, index) => {
    const slot = index + offset;
    const rowIndex = Math.floor(slot / 2);
    const row = rows[rowIndex] ?? { number: first + rowIndex, white: null, black: null };
    const cell = { san: entry.san, ply: index + 1 };
    if (slot % 2 === 0) row.white = cell;
    else row.black = cell;
    rows[rowIndex] = row;
  });
  return rows;
}

/** The game as PGN. Only the tags that are true of it are written. */
export function toPgn(game: Game, now: Date | null = null): string {
  const result = resultToken(status(game));
  const tags: Array<[string, string]> = [
    ['Event', 'Lumen OS'],
    ['Site', 'Local'],
  ];
  if (now) tags.push(['Date', now.toISOString().slice(0, 10).replace(/-/g, '.')]);
  tags.push(
    ['White', game.side === 'w' ? 'Player' : 'Lumen'],
    ['Black', game.side === 'b' ? 'Player' : 'Lumen'],
    ['Result', result],
  );
  if (toFen(game.start) !== INITIAL_FEN) {
    tags.push(['SetUp', '1'], ['FEN', toFen(game.start)]);
  }
  const header = tags.map(([k, v]) => `[${k} "${v}"]`).join('\n');
  const body = moveRows(game)
    .map(
      (row) => `${row.number}. ${row.white?.san ?? '...'}${row.black ? ` ${row.black.san}` : ''}`,
    )
    .join(' ');
  return `${header}\n\n${body}${body ? ' ' : ''}${result}\n`;
}
