import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM, PRESETS } from './difficulty';
import {
  clearBestTimes,
  configFor,
  DEFAULT_DATA,
  isBestTime,
  type MinesweeperData,
  normalizeData,
  recordTime,
} from './storage';

const data = (patch: Partial<MinesweeperData> = {}): MinesweeperData => ({
  ...DEFAULT_DATA,
  ...patch,
});

describe('normalizeData', () => {
  it('falls back to the defaults for anything unreadable', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('nonsense')).toEqual(DEFAULT_DATA);
    expect(normalizeData({})).toEqual(DEFAULT_DATA);
  });

  it('keeps a valid file', () => {
    const stored = {
      difficulty: 'expert',
      custom: { width: 12, height: 12, mines: 20 },
      questionMarks: true,
      best: { beginner: { ms: 41_000, at: 1_700_000_000_000 } },
    };
    expect(normalizeData(stored)).toEqual(stored);
  });

  it('rejects a difficulty it does not have', () => {
    expect(normalizeData({ difficulty: 'impossible' }).difficulty).toBe('beginner');
  });

  it('pulls a hand-edited custom board back into range', () => {
    expect(normalizeData({ custom: { width: 3, height: 400, mines: 0 } }).custom).toEqual({
      width: 5,
      height: 50,
      mines: 1,
    });
    expect(normalizeData({ custom: 'wide' }).custom).toEqual(DEFAULT_CUSTOM);
  });

  it('drops a best time that was not a measurement', () => {
    const parsed = normalizeData({
      best: {
        beginner: { ms: 0 },
        intermediate: { ms: -5, at: 1 },
        expert: { ms: 'fast' },
        custom: { ms: 1_000, at: 1 },
      },
    });
    expect(parsed.best).toEqual({});
  });

  it('keeps a time with no date, dated at zero', () => {
    expect(normalizeData({ best: { expert: { ms: 90_500 } } }).best.expert).toEqual({
      ms: 90_500,
      at: 0,
    });
  });
});

describe('best times', () => {
  it('records the first time on a preset', () => {
    const next = recordTime(data(), 'beginner', 41_000, 500);
    expect(next.best.beginner).toEqual({ ms: 41_000, at: 500 });
  });

  it('keeps the faster of the two', () => {
    const first = recordTime(data(), 'beginner', 41_000, 500);
    const slower = recordTime(first, 'beginner', 55_000, 900);
    expect(slower).toBe(first);
    const faster = recordTime(first, 'beginner', 30_000, 900);
    expect(faster.best.beginner).toEqual({ ms: 30_000, at: 900 });
  });

  it('answers whether a time would be a record before it is written', () => {
    const stored = data({ best: { expert: { ms: 200_000, at: 0 } } });
    expect(isBestTime(stored, 'expert', 199_000)).toBe(true);
    expect(isBestTime(stored, 'expert', 200_000)).toBe(false);
    expect(isBestTime(stored, 'beginner', 12_000)).toBe(true);
  });

  it('refuses a time that was never measured', () => {
    expect(isBestTime(data(), 'beginner', 0)).toBe(false);
    expect(isBestTime(data(), 'beginner', Number.NaN)).toBe(false);
    expect(recordTime(data(), 'beginner', 0, 1).best).toEqual({});
  });

  it('clears every record at once', () => {
    const stored = data({ best: { expert: { ms: 1, at: 0 }, beginner: { ms: 2, at: 0 } } });
    expect(clearBestTimes(stored).best).toEqual({});
  });
});

describe('configFor', () => {
  it('resolves a preset', () => {
    expect(configFor(data({ difficulty: 'expert' }))).toEqual(PRESETS.expert);
  });

  it('resolves the stored custom board', () => {
    const custom = { width: 12, height: 12, mines: 20 };
    expect(configFor(data({ difficulty: 'custom', custom }))).toEqual(custom);
  });
});
