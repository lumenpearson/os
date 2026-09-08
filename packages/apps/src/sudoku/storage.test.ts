import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { formatGrid } from './grid';
import { markOf, NO_MARKS, setValue, startPlay, toggleMark } from './play';
import { createRng } from './rng';
import {
  DEFAULT_DATA,
  DEFAULT_PREFS,
  fromSaved,
  normalizeData,
  type SavedGame,
  toSaved,
} from './storage';

function played() {
  const made = generate(createRng(4242), 'medium');
  const start = startPlay(made.puzzle, made.solution, made.difficulty, 4242);
  const open = made.puzzle.indexOf(0);
  const other = made.puzzle.indexOf(0, open + 1);
  return {
    state: toggleMark(setValue(start, open, made.solution[open] as number), other, 4),
    open,
    other,
  };
}

describe('normalizeData', () => {
  it('falls back on anything that is not the file it expects', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('sudoku')).toEqual(DEFAULT_DATA);
    expect(normalizeData([])).toEqual({ prefs: DEFAULT_PREFS, game: null });
    expect(normalizeData({})).toEqual(DEFAULT_DATA);
  });

  it('keeps the preferences it recognises and defaults the rest', () => {
    const data = normalizeData({
      prefs: { difficulty: 'expert', pencil: true, highlight: 'yes', timer: false },
    });
    expect(data.prefs).toEqual({
      difficulty: 'expert',
      pencil: true,
      highlight: DEFAULT_PREFS.highlight,
      timer: false,
    });
  });

  it('drops a difficulty it has never heard of', () => {
    expect(normalizeData({ prefs: { difficulty: 'fiendish' } }).prefs.difficulty).toBe(
      DEFAULT_PREFS.difficulty,
    );
  });

  it('drops a game that is missing its parts', () => {
    expect(normalizeData({ game: { puzzle: '...' } }).game).toBeNull();
    expect(normalizeData({ game: 7 }).game).toBeNull();
  });

  it('drops a game whose marks are not eighty-one numbers', () => {
    const { state } = played();
    const saved = toSaved(state, 0);
    expect(normalizeData({ game: { ...saved, marks: [1, 2, 3] } }).game).toBeNull();
    expect(normalizeData({ game: { ...saved, marks: 'none' } }).game).toBeNull();
    const outOfRange = saved.marks.slice();
    outOfRange[0] = 1024;
    expect(normalizeData({ game: { ...saved, marks: outOfRange } }).game).toBeNull();
  });

  it('reads a game it wrote itself', () => {
    const { state } = played();
    const data = normalizeData({ prefs: { difficulty: 'hard' }, game: toSaved(state, 61_000) });
    expect(data.game?.elapsedMs).toBe(61_000);
    expect(data.game?.difficulty).toBe('medium');
  });

  it('treats a nonsense clock as no time played', () => {
    const { state } = played();
    const saved = toSaved(state, 0);
    expect(normalizeData({ game: { ...saved, elapsedMs: -5 } }).game?.elapsedMs).toBe(0);
    expect(normalizeData({ game: { ...saved, elapsedMs: 'ages' } }).game?.elapsedMs).toBe(0);
  });
});

describe('round trip', () => {
  it('restores the board, the marks and the clock', () => {
    const { state, open, other } = played();
    const restored = fromSaved(toSaved(state, 90_000));
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(formatGrid(restored.state.values)).toBe(formatGrid(state.values));
    expect(formatGrid(restored.state.puzzle)).toBe(formatGrid(state.puzzle));
    expect(restored.state.values[open]).toBe(state.values[open]);
    expect(restored.state.marks[other]).toBe(markOf(4));
    expect(restored.state.difficulty).toBe('medium');
    expect(restored.state.seed).toBe(4242);
    expect(restored.elapsedMs).toBe(90_000);
  });

  it('restores nothing from nothing', () => {
    expect(fromSaved(null)).toBeNull();
  });

  it('drops a pencil mark left on a cell that holds a digit', () => {
    const { state, open } = played();
    const saved = toSaved(state, 0);
    const marks = saved.marks.slice();
    marks[open] = markOf(9);
    const restored = fromSaved({ ...saved, marks });
    expect(restored?.state.marks[open]).toBe(NO_MARKS);
  });
});

describe('a saved game that does not hold together', () => {
  const base = (): SavedGame => toSaved(played().state, 0);

  it('is refused when a board will not parse', () => {
    expect(fromSaved({ ...base(), values: 'nope' })).toBeNull();
    expect(fromSaved({ ...base(), puzzle: '' })).toBeNull();
  });

  it('is refused when the solution is not a solved board', () => {
    const saved = base();
    const broken = `${saved.solution.slice(0, 1)}${saved.solution.slice(0, 1)}${saved.solution.slice(2)}`;
    expect(fromSaved({ ...saved, solution: broken })).toBeNull();
  });

  it('is refused when a clue contradicts the solution', () => {
    const saved = base();
    const index = [...saved.puzzle].findIndex((char) => char !== '.');
    const digit = Number(saved.puzzle[index]);
    const swapped = `${saved.puzzle.slice(0, index)}${digit === 9 ? 1 : digit + 1}${saved.puzzle.slice(index + 1)}`;
    expect(fromSaved({ ...saved, puzzle: swapped })).toBeNull();
  });

  it('is refused when a clue has been written over', () => {
    const saved = base();
    const index = [...saved.puzzle].findIndex((char) => char !== '.');
    const values = `${saved.values.slice(0, index)}.${saved.values.slice(index + 1)}`;
    expect(fromSaved({ ...saved, values })).toBeNull();
  });

  it('is refused when the marks are the wrong length', () => {
    expect(fromSaved({ ...base(), marks: [] })).toBeNull();
  });
});
