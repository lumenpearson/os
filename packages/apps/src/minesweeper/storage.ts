/**
 * What the game keeps between sessions, in ~/.config/minesweeper.json: the
 * difficulty it was left on, the last custom board, whether question marks
 * are on, and the best times.
 *
 * Only a time the app actually measured is ever written: a game has to be
 * won on one of the three presets, having run its clock. Custom boards keep
 * no record, because "best on a board you designed" means nothing.
 */

import {
  type BoardConfig,
  clampConfig,
  DEFAULT_CUSTOM,
  DIFFICULTY_IDS,
  type DifficultyId,
  PRESET_IDS,
  PRESETS,
  type PresetId,
} from './difficulty';

export interface BestTime {
  /** The measured duration in milliseconds. */
  ms: number;
  /** When it was set, for the Best Times list. */
  at: number;
}

export interface MinesweeperData {
  difficulty: DifficultyId;
  custom: BoardConfig;
  questionMarks: boolean;
  best: Partial<Record<PresetId, BestTime>>;
}

export const DEFAULT_DATA: MinesweeperData = {
  difficulty: 'beginner',
  custom: DEFAULT_CUSTOM,
  questionMarks: false,
  best: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readConfig(value: unknown): BoardConfig {
  if (!isRecord(value)) return DEFAULT_CUSTOM;
  const { width, height, mines } = value;
  if (typeof width !== 'number' || typeof height !== 'number' || typeof mines !== 'number')
    return DEFAULT_CUSTOM;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(mines))
    return DEFAULT_CUSTOM;
  return clampConfig({ width, height, mines });
}

function readBestTime(value: unknown): BestTime | null {
  if (!isRecord(value)) return null;
  const { ms, at } = value;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return { ms: Math.round(ms), at: typeof at === 'number' && Number.isFinite(at) ? at : 0 };
}

/** The file is text a user can edit, so nothing from it is trusted. */
export function normalizeData(raw: unknown): MinesweeperData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  const best: Partial<Record<PresetId, BestTime>> = {};
  if (isRecord(raw.best)) {
    for (const id of PRESET_IDS) {
      const time = readBestTime(raw.best[id]);
      if (time) best[id] = time;
    }
  }
  return {
    difficulty: DIFFICULTY_IDS.includes(raw.difficulty as DifficultyId)
      ? (raw.difficulty as DifficultyId)
      : DEFAULT_DATA.difficulty,
    custom: readConfig(raw.custom),
    questionMarks: typeof raw.questionMarks === 'boolean' ? raw.questionMarks : false,
    best,
  };
}

/** Whether `ms` would be a new record on `preset`. */
export function isBestTime(data: MinesweeperData, preset: PresetId, ms: number): boolean {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const current = data.best[preset];
  return current === undefined || ms < current.ms;
}

/** Write a measured time, keeping whichever is faster. */
export function recordTime(
  data: MinesweeperData,
  preset: PresetId,
  ms: number,
  at: number,
): MinesweeperData {
  if (!isBestTime(data, preset, ms)) return data;
  return { ...data, best: { ...data.best, [preset]: { ms: Math.round(ms), at } } };
}

export function clearBestTimes(data: MinesweeperData): MinesweeperData {
  return { ...data, best: {} };
}

/** The board the stored difficulty means. */
export function configFor(data: MinesweeperData): BoardConfig {
  return data.difficulty === 'custom' ? data.custom : PRESETS[data.difficulty];
}
