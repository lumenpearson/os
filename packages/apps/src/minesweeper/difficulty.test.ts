import { describe, expect, it } from 'vitest';
import {
  clampConfig,
  DIFFICULTY_IDS,
  describeConfig,
  LIMITS,
  maxMines,
  PRESETS,
  presetOf,
  safeZoneSize,
  validateCustom,
} from './difficulty';

describe('presets', () => {
  it('are the three classic boards', () => {
    expect(PRESETS.beginner).toEqual({ width: 9, height: 9, mines: 10 });
    expect(PRESETS.intermediate).toEqual({ width: 16, height: 16, mines: 40 });
    expect(PRESETS.expert).toEqual({ width: 30, height: 16, mines: 99 });
  });

  it('all leave room for the safe opening', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.mines).toBeLessThanOrEqual(maxMines(preset.width, preset.height));
    }
  });

  it('lists custom last', () => {
    expect(DIFFICULTY_IDS).toEqual(['beginner', 'intermediate', 'expert', 'custom']);
  });

  it('recognises a shape as one of them', () => {
    expect(presetOf({ width: 16, height: 16, mines: 40 })).toBe('intermediate');
    expect(presetOf({ width: 16, height: 16, mines: 41 })).toBeNull();
    expect(presetOf({ width: 20, height: 14, mines: 50 })).toBeNull();
  });
});

describe('the safe neighbourhood', () => {
  it('is nine cells on any board with room for them', () => {
    expect(safeZoneSize(9, 9)).toBe(9);
    expect(safeZoneSize(30, 16)).toBe(9);
  });

  it('shrinks with the board', () => {
    expect(safeZoneSize(2, 5)).toBe(6);
    expect(safeZoneSize(1, 1)).toBe(1);
  });

  it('is subtracted from the cells a board can mine', () => {
    expect(maxMines(9, 9)).toBe(72);
    expect(maxMines(30, 16)).toBe(471);
    expect(maxMines(3, 3)).toBe(0);
  });
});

describe('validateCustom', () => {
  const draft = (width: string, height: string, mines: string) => ({ width, height, mines });

  it('accepts a board that fits', () => {
    const result = validateCustom(draft('20', '14', '50'));
    expect(result).toEqual({ ok: true, config: { width: 20, height: 14, mines: 50 } });
  });

  it('tolerates surrounding spaces', () => {
    expect(validateCustom(draft(' 9 ', ' 9 ', ' 10 '))).toEqual({
      ok: true,
      config: { width: 9, height: 9, mines: 10 },
    });
  });

  it('rejects anything that is not a whole number', () => {
    const result = validateCustom(draft('9.5', '', 'lots'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a rejection');
    expect(result.errors.width).toBe('Width must be a whole number.');
    expect(result.errors.height).toBe('Height must be a whole number.');
    expect(result.errors.mines).toBe('Mines must be a whole number.');
  });

  it('names the range for a side that is out of it', () => {
    const result = validateCustom(draft('4', '99', '10'));
    if (result.ok) throw new Error('expected a rejection');
    expect(result.errors.width).toBe(
      `Width must be between ${LIMITS.minWidth} and ${LIMITS.maxWidth}.`,
    );
    expect(result.errors.height).toBe('Height must be between 5 and 50.');
  });

  it('explains the mine limit instead of clamping it', () => {
    const result = validateCustom(draft('9', '9', '73'));
    if (result.ok) throw new Error('expected a rejection');
    expect(result.errors.mines).toBe(
      'A 9×9 board holds 1 to 72 mines: the first cell you click and its eight neighbours always stay clear.',
    );
  });

  it('takes the largest board that still leaves the opening free', () => {
    expect(validateCustom(draft('9', '9', '72')).ok).toBe(true);
    expect(validateCustom(draft('9', '9', '0')).ok).toBe(false);
  });

  it('holds back the mine range while a side is unreadable', () => {
    const result = validateCustom(draft('wide', '9', '400'));
    if (result.ok) throw new Error('expected a rejection');
    expect(result.errors.mines).toBeUndefined();
    expect(result.errors.width).toBeDefined();
  });
});

describe('clampConfig', () => {
  it('leaves a legal board alone', () => {
    expect(clampConfig({ width: 30, height: 16, mines: 99 })).toEqual({
      width: 30,
      height: 16,
      mines: 99,
    });
  });

  it('pulls a stored file back into range', () => {
    expect(clampConfig({ width: 900, height: 1, mines: -5 })).toEqual({
      width: 50,
      height: 5,
      mines: 1,
    });
    expect(clampConfig({ width: 9, height: 9, mines: 500 })).toEqual({
      width: 9,
      height: 9,
      mines: 72,
    });
  });
});

describe('describeConfig', () => {
  it('prints the shape', () => {
    expect(describeConfig({ width: 30, height: 16, mines: 99 })).toBe('30×16, 99 mines');
  });
});
