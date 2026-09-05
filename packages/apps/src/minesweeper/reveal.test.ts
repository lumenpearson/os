import { describe, expect, it } from 'vitest';
import { countAdjacent, indexAt, neighbours, safeZone } from './board';
import type { BoardConfig } from './difficulty';
import { PRESETS } from './difficulty';
import {
  activate,
  canChord,
  cellView,
  chord,
  createGame,
  cycleMark,
  elapsedMs,
  type GameState,
  isOver,
  markAt,
  remainingMines,
  reveal,
  safeTarget,
  setQuestionMarks,
} from './reveal';

const config = (width: number, height: number, mines: number): BoardConfig => ({
  width,
  height,
  mines,
});

const fresh = (shape: BoardConfig, questionMarks = false): GameState =>
  createGame(shape, { seed: 42, questionMarks });

/**
 * A game with a hand-placed field, already in play: the tests below need to
 * know exactly where the mines are.
 */
function planted(rows: string[], options: { questionMarks?: boolean } = {}): GameState {
  const height = rows.length;
  const width = (rows[0] ?? '').length;
  const mine = rows.flatMap((row) => [...row].map((ch) => ch === '*'));
  const count = mine.filter(Boolean).length;
  const base = fresh(config(width, height, count), options.questionMarks ?? false);
  return {
    ...base,
    phase: 'playing',
    startedAt: 1_000,
    board: { width, height, mines: count, mine, adjacent: countAdjacent(width, height, mine) },
  };
}

const revealedCells = (state: GameState) => state.revealed.filter(Boolean).length;

describe('createGame', () => {
  it('starts ready, with nothing placed and no clock running', () => {
    const game = fresh(PRESETS.beginner);
    expect(game.phase).toBe('ready');
    expect(game.board.mine.some(Boolean)).toBe(false);
    expect(game.startedAt).toBeNull();
    expect(elapsedMs(game, 9_999)).toBe(0);
    expect(remainingMines(game)).toBe(10);
    expect(safeTarget(game)).toBe(71);
  });
});

describe('the first reveal', () => {
  it('generates the board only then, and never under the click', () => {
    for (let first = 0; first < 81; first += 1) {
      const game = reveal(
        createGame(PRESETS.beginner, { seed: first, questionMarks: false }),
        first,
        1_000,
      );
      expect(game.phase).toBe('playing');
      for (const index of safeZone(9, 9, first)) {
        expect(game.board.mine[index]).toBe(false);
        expect(game.revealed[index]).toBe(true);
      }
    }
  });

  it('always opens a region, because the whole neighbourhood is clear', () => {
    const game = reveal(fresh(PRESETS.expert), indexAt(30, 12, 8), 1_000);
    expect(revealedCells(game)).toBeGreaterThanOrEqual(9);
  });

  it('starts the clock', () => {
    const game = reveal(fresh(PRESETS.beginner), 40, 5_000);
    expect(game.startedAt).toBe(5_000);
    expect(elapsedMs(game, 8_000)).toBe(3_000);
  });

  it('does nothing on a flagged cell', () => {
    const flagged = cycleMark(fresh(PRESETS.beginner), 40);
    expect(reveal(flagged, 40, 1_000)).toBe(flagged);
    expect(flagged.phase).toBe('ready');
  });

  it('ignores an index outside the board', () => {
    const game = fresh(PRESETS.beginner);
    expect(reveal(game, -1, 1_000)).toBe(game);
    expect(reveal(game, 81, 1_000)).toBe(game);
  });
});

describe('the flood', () => {
  it('stops at cells that touch a mine', () => {
    // 5×5 with one mine in the corner: opening the far corner leaves the
    // mine and nothing else hidden.
    const game = reveal(planted(['*....', '.....', '.....', '.....', '.....']), 24, 2_000);
    expect(revealedCells(game)).toBe(24);
    expect(game.revealed[0]).toBe(false);
    expect(game.phase).toBe('won');
  });

  it('runs on a stack, so a large empty field cannot blow it', () => {
    const wide = config(50, 50, 1);
    const game = reveal(createGame(wide, { seed: 3, questionMarks: false }), 0, 1_000);
    expect(revealedCells(game)).toBeGreaterThan(2_400);
    expect(game.phase).toBe('won');
  });

  it('does not cross a flag', () => {
    const start = planted(['.....', '.....', '..*..', '.....', '.....']);
    const flagged = cycleMark(start, indexAt(5, 0, 0));
    const game = reveal(flagged, indexAt(5, 4, 4), 2_000);
    expect(game.revealed[indexAt(5, 0, 0)]).toBe(false);
    expect(markAt(game, indexAt(5, 0, 0))).toBe('flag');
  });

  it('clears a question mark as the cell opens', () => {
    const start = planted(['.....', '.....', '..*..', '.....', '.....'], { questionMarks: true });
    const marked = cycleMark(cycleMark(start, 0), 0);
    expect(markAt(marked, 0)).toBe('question');
    const game = reveal(marked, indexAt(5, 4, 4), 2_000);
    expect(game.revealed[0]).toBe(true);
    expect(markAt(game, 0)).toBe('none');
  });
});

describe('losing', () => {
  const field = ['*....', '.....', '.....', '.....', '....*'];

  it('ends on a mine and remembers which one', () => {
    const game = reveal(planted(field), 0, 3_000);
    expect(game.phase).toBe('lost');
    expect(game.explodedAt).toBe(0);
    expect(isOver(game)).toBe(true);
    expect(cellView(game, 0)).toEqual({ kind: 'mine', exploded: true });
  });

  it('brings up every other mine', () => {
    const game = reveal(planted(field), 0, 3_000);
    expect(cellView(game, 24)).toEqual({ kind: 'mine', exploded: false });
  });

  it('marks a flag that was wrong and leaves a right one alone', () => {
    const start = cycleMark(cycleMark(planted(field), 24), indexAt(5, 2, 2));
    const game = reveal(start, 0, 3_000);
    expect(cellView(game, 24)).toEqual({ kind: 'flag', wrong: false });
    expect(cellView(game, indexAt(5, 2, 2))).toEqual({ kind: 'flag', wrong: true });
  });

  it('keeps a correctly flagged mine covered', () => {
    const game = reveal(cycleMark(planted(field), 24), 0, 3_000);
    expect(game.revealed[24]).toBe(false);
  });

  it('freezes the clock and refuses further moves', () => {
    const game = reveal(planted(field), 0, 3_000);
    expect(elapsedMs(game, 90_000)).toBe(2_000);
    expect(reveal(game, 12, 4_000)).toBe(game);
    expect(cycleMark(game, 12)).toBe(game);
  });
});

describe('winning', () => {
  it('arrives when the last safe cell opens, and flags the mines', () => {
    const game = reveal(planted(['*....', '.....', '.....', '.....', '....*']), 12, 4_000);
    expect(game.phase).toBe('won');
    expect(markAt(game, 0)).toBe('flag');
    expect(markAt(game, 24)).toBe('flag');
    expect(remainingMines(game)).toBe(0);
    expect(game.finishedAt).toBe(4_000);
  });

  it('does not count a revealed mine towards the win', () => {
    const game = reveal(planted(['*....', '.....', '.....', '.....', '....*']), 0, 4_000);
    expect(game.phase).toBe('lost');
  });
});

describe('flags and question marks', () => {
  it('cycles none → flag → none with question marks off', () => {
    const start = fresh(PRESETS.beginner);
    const flagged = cycleMark(start, 3);
    expect(markAt(flagged, 3)).toBe('flag');
    expect(remainingMines(flagged)).toBe(9);
    expect(markAt(cycleMark(flagged, 3), 3)).toBe('none');
    expect(remainingMines(cycleMark(flagged, 3))).toBe(10);
  });

  it('cycles through the question mark when it is on', () => {
    const start = fresh(PRESETS.beginner, true);
    const question = cycleMark(cycleMark(start, 3), 3);
    expect(markAt(question, 3)).toBe('question');
    expect(remainingMines(question)).toBe(10);
    expect(markAt(cycleMark(question, 3), 3)).toBe('none');
  });

  it('lets the counter go negative when flags outnumber mines', () => {
    let game: GameState = fresh(config(9, 9, 1));
    for (let index = 0; index < 3; index += 1) game = cycleMark(game, index);
    expect(remainingMines(game)).toBe(-2);
  });

  it('will not mark a revealed cell', () => {
    const game = reveal(fresh(PRESETS.beginner), 40, 1_000);
    expect(cycleMark(game, 40)).toBe(game);
  });

  it('does not start the clock', () => {
    const game = cycleMark(fresh(PRESETS.beginner), 40);
    expect(game.startedAt).toBeNull();
    expect(game.phase).toBe('ready');
  });

  it('clears the question marks when the option is switched off', () => {
    const start = fresh(PRESETS.beginner, true);
    const question = cycleMark(cycleMark(start, 3), 3);
    const off = setQuestionMarks(question, false);
    expect(markAt(off, 3)).toBe('none');
    expect(off.questionMarks).toBe(false);
    expect(setQuestionMarks(off, false)).toBe(off);
  });
});

describe('chording', () => {
  //  * . .
  //  . . .
  //  . . .   → the centre reads 1
  const field = ['*..', '...', '...'];
  const centre = indexAt(3, 1, 1);

  const opened = () => reveal(planted(field), centre, 2_000);

  it('needs the flags to match the number', () => {
    const game = opened();
    expect(canChord(game, centre)).toBe(false);
    const flagged = cycleMark(game, 0);
    expect(canChord(flagged, centre)).toBe(true);
  });

  it('opens the rest of the neighbourhood', () => {
    const game = chord(cycleMark(opened(), 0), centre, 3_000);
    expect(game.phase).toBe('won');
    expect(game.revealed[indexAt(3, 2, 2)]).toBe(true);
  });

  it('does nothing when the count is wrong', () => {
    const game = opened();
    expect(chord(game, centre, 3_000)).toBe(game);
  });

  it('does nothing on a blank or hidden cell', () => {
    const game = planted(['...', '...', '...']);
    expect(canChord(game, centre)).toBe(false);
    const open = reveal(game, centre, 2_000);
    expect(canChord(open, 0)).toBe(false);
  });

  it('loses when a flag was in the wrong place', () => {
    const game = chord(cycleMark(opened(), indexAt(3, 2, 0)), centre, 3_000);
    expect(game.phase).toBe('lost');
    expect(game.explodedAt).toBe(0);
  });

  it('is what activate does on a revealed number', () => {
    const flagged = cycleMark(opened(), 0);
    expect(activate(flagged, centre, 3_000)).toEqual(chord(flagged, centre, 3_000));
  });

  it('is a reveal on a hidden cell', () => {
    const game = fresh(PRESETS.beginner);
    expect(activate(game, 40, 1_000).phase).toBe('playing');
  });
});

describe('cellView', () => {
  it('describes a hidden cell, a flag and a question mark', () => {
    const start = fresh(PRESETS.beginner, true);
    expect(cellView(start, 0)).toEqual({ kind: 'hidden' });
    expect(cellView(cycleMark(start, 0), 0)).toEqual({ kind: 'flag', wrong: false });
    expect(cellView(cycleMark(cycleMark(start, 0), 0), 0)).toEqual({ kind: 'question' });
  });

  it('separates a blank cell from a number', () => {
    const game = reveal(planted(['*..', '...', '...']), indexAt(3, 2, 2), 2_000);
    expect(cellView(game, indexAt(3, 2, 2))).toEqual({ kind: 'empty' });
    expect(cellView(game, indexAt(3, 1, 1))).toEqual({ kind: 'count', count: 1 });
  });

  it('agrees with the adjacency the board counted', () => {
    const game = reveal(planted(['*.*', '...', '*.*']), indexAt(3, 1, 1), 2_000);
    expect(cellView(game, indexAt(3, 1, 1))).toEqual({ kind: 'count', count: 4 });
    expect(neighbours(3, 3, indexAt(3, 1, 1))).toHaveLength(8);
  });
});
