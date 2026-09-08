import { describe, expect, it } from 'vitest';
import { countAdjacent, indexAt } from './board';
import { PRESETS } from './difficulty';
import { cellName, formatClock, NUMBER_CLASSES, numberClass, statusMessage } from './labels';
import { createGame, cycleMark, type GameState, reveal } from './reveal';

function planted(rows: string[], questionMarks = false): GameState {
  const height = rows.length;
  const width = (rows[0] ?? '').length;
  const mine = rows.flatMap((row) => [...row].map((ch) => ch === '*'));
  const mines = mine.filter(Boolean).length;
  const base = createGame({ width, height, mines }, { seed: 1, questionMarks });
  return {
    ...base,
    phase: 'playing',
    startedAt: 1_000,
    board: { width, height, mines, mine, adjacent: countAdjacent(width, height, mine) },
  };
}

describe('formatClock', () => {
  it('prints m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(61_500)).toBe('1:01');
    expect(formatClock(600_000)).toBe('10:00');
  });

  it('never goes backwards or past the width of the field', () => {
    expect(formatClock(-500)).toBe('0:00');
    expect(formatClock(60 * 60 * 1000 * 5)).toBe('99:59');
  });
});

describe('cellName', () => {
  const field = ['*..', '...', '...'];

  it('places the cell and says it is hidden', () => {
    expect(cellName(planted(field), indexAt(3, 2, 1))).toBe('Row 2, column 3, hidden');
  });

  it('reads a revealed count, singular and plural', () => {
    const game = reveal(planted(field), indexAt(3, 1, 1), 2_000);
    expect(cellName(game, indexAt(3, 1, 1))).toBe('Row 2, column 2, revealed, 1 adjacent mine');
    const four = reveal(planted(['*.*', '...', '*.*']), indexAt(3, 1, 1), 2_000);
    expect(cellName(four, indexAt(3, 1, 1))).toBe('Row 2, column 2, revealed, 4 adjacent mines');
  });

  it('reads a blank cell', () => {
    const game = reveal(planted(field), indexAt(3, 2, 2), 2_000);
    expect(cellName(game, indexAt(3, 2, 2))).toBe('Row 3, column 3, revealed, no adjacent mines');
  });

  it('reads flags, question marks and mines', () => {
    const flagged = cycleMark(planted(field, true), 0);
    expect(cellName(flagged, 0)).toBe('Row 1, column 1, flagged');
    expect(cellName(cycleMark(flagged, 0), 0)).toBe('Row 1, column 1, marked with a question mark');
    const lost = reveal(planted(field), 0, 2_000);
    expect(cellName(lost, 0)).toBe('Row 1, column 1, mine, hit');
  });

  it('says which flag was wrong once the game is lost', () => {
    const lost = reveal(cycleMark(planted(field), indexAt(3, 2, 2)), 0, 2_000);
    expect(cellName(lost, indexAt(3, 2, 2))).toBe('Row 3, column 3, flagged, no mine here');
  });
});

describe('statusMessage', () => {
  it('counts the mines before the game starts', () => {
    expect(statusMessage(createGame(PRESETS.beginner, { seed: 1, questionMarks: false }), 0)).toBe(
      'Ready. 10 mines.',
    );
  });

  it('counts down as flags go in', () => {
    const game = reveal(createGame(PRESETS.beginner, { seed: 1, questionMarks: false }), 40, 1_000);
    expect(statusMessage(game, 2_000)).toBe('10 mines left.');
    expect(statusMessage(cycleMark(game, 0), 2_000)).toBe('9 mines left.');
  });

  it('says when there are more flags than mines', () => {
    let game = reveal(
      planted(['*....', '.....', '.....', '.....', '.....']),
      indexAt(5, 1, 1),
      1_000,
    );
    game = cycleMark(cycleMark(cycleMark(game, 1), 2), 3);
    expect(statusMessage(game, 2_000)).toBe('2 flags more than there are mines.');
  });

  it('reports the outcome', () => {
    const won = reveal(planted(['*..', '...', '...']), indexAt(3, 2, 2), 5_000);
    expect(won.phase).toBe('won');
    expect(statusMessage(won, 9_000)).toBe('Swept in 0:04.');
    const lost = reveal(planted(['*..', '...', '...']), 0, 5_000);
    expect(statusMessage(lost, 9_000)).toBe('Mine hit.');
  });
});

describe('numberClass', () => {
  it('gives all eight counts a treatment of their own', () => {
    const seen = new Set<string>();
    for (let count = 1; count <= 8; count += 1) {
      const value = numberClass(count);
      expect(value).not.toBe('');
      seen.add(value);
    }
    expect(seen.size).toBe(8);
    expect(NUMBER_CLASSES).toHaveLength(8);
  });

  it('stays inside the neutral ramp and the one accent', () => {
    for (const value of NUMBER_CLASSES) {
      for (const token of value.split(' ')) {
        expect(token).toMatch(
          /^(text-(ink|ink-2|ink-3|accent)|font-(medium|bold)|underline|decoration-2|decoration-accent|underline-offset-2)$/,
        );
      }
    }
  });

  it('falls back to plain ink for a count it does not know', () => {
    expect(numberClass(0)).toBe('text-ink');
    expect(numberClass(9)).toBe('text-ink');
  });
});
