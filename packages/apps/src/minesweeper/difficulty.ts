/**
 * Board shapes: the three classic presets and a custom one the user types.
 *
 * The one rule custom boards have to respect is the safe opening: the first
 * click and its eight neighbours are never mined, so a board must have room
 * for that neighbourhood on top of its mines.
 */

export interface BoardConfig {
  width: number;
  height: number;
  mines: number;
}

export type PresetId = 'beginner' | 'intermediate' | 'expert';
export type DifficultyId = PresetId | 'custom';

export const PRESET_IDS: readonly PresetId[] = ['beginner', 'intermediate', 'expert'];
export const DIFFICULTY_IDS: readonly DifficultyId[] = [...PRESET_IDS, 'custom'];

export const PRESETS: Record<PresetId, BoardConfig> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

export const DIFFICULTY_LABEL: Record<DifficultyId, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
  custom: 'Custom',
};

export const LIMITS = {
  minWidth: 5,
  maxWidth: 50,
  minHeight: 5,
  maxHeight: 50,
  minMines: 1,
} as const;

/** Cells the opening click keeps clear: itself plus its eight neighbours. */
export function safeZoneSize(width: number, height: number): number {
  return Math.min(3, width) * Math.min(3, height);
}

/** The most mines that still leave room for the safe opening, anywhere on the board. */
export function maxMines(width: number, height: number): number {
  return Math.max(0, width * height - safeZoneSize(width, height));
}

export const DEFAULT_CUSTOM: BoardConfig = { width: 20, height: 14, mines: 50 };

/** Which preset this is, or null for a shape the user typed. */
export function presetOf(config: BoardConfig): PresetId | null {
  for (const id of PRESET_IDS) {
    const preset = PRESETS[id];
    if (
      preset.width === config.width &&
      preset.height === config.height &&
      preset.mines === config.mines
    )
      return id;
  }
  return null;
}

/** "30×16, 99 mines" — the shape, for the status line. */
export function describeConfig(config: BoardConfig): string {
  return `${config.width}×${config.height}, ${config.mines} mines`;
}

export interface CustomDraft {
  width: string;
  height: string;
  mines: string;
}

export interface CustomErrors {
  width?: string;
  height?: string;
  mines?: string;
}

export type CustomResult = { ok: true; config: BoardConfig } | { ok: false; errors: CustomErrors };

const WHOLE_NUMBER = /^\s*\d+\s*$/;

function parseWhole(text: string): number | null {
  if (!WHOLE_NUMBER.test(text)) return null;
  const value = Number.parseInt(text.trim(), 10);
  return Number.isSafeInteger(value) ? value : null;
}

function checkSide(text: string, low: number, high: number, name: string): number | string {
  const value = parseWhole(text);
  if (value === null) return `${name} must be a whole number.`;
  if (value < low || value > high) return `${name} must be between ${low} and ${high}.`;
  return value;
}

/**
 * Validate what the user typed. Nothing is clamped: an out-of-range value
 * comes back with the sentence that explains the range, so the user chooses
 * the board rather than the app quietly choosing it for them.
 */
export function validateCustom(draft: CustomDraft): CustomResult {
  const errors: CustomErrors = {};
  const width = checkSide(draft.width, LIMITS.minWidth, LIMITS.maxWidth, 'Width');
  const height = checkSide(draft.height, LIMITS.minHeight, LIMITS.maxHeight, 'Height');
  if (typeof width === 'string') errors.width = width;
  if (typeof height === 'string') errors.height = height;

  const mines = parseWhole(draft.mines);
  if (mines === null) {
    errors.mines = 'Mines must be a whole number.';
  } else if (typeof width === 'number' && typeof height === 'number') {
    const most = maxMines(width, height);
    if (mines < LIMITS.minMines || mines > most)
      errors.mines = `A ${width}×${height} board holds ${LIMITS.minMines} to ${most} mines: the first cell you click and its eight neighbours always stay clear.`;
  }

  if (typeof width !== 'number' || typeof height !== 'number' || mines === null)
    return { ok: false, errors };
  if (errors.mines !== undefined) return { ok: false, errors };
  return { ok: true, config: { width, height, mines } };
}

/** Force a stored or launched config into the allowed range. */
export function clampConfig(config: BoardConfig): BoardConfig {
  const width = Math.min(LIMITS.maxWidth, Math.max(LIMITS.minWidth, Math.round(config.width)));
  const height = Math.min(LIMITS.maxHeight, Math.max(LIMITS.minHeight, Math.round(config.height)));
  const mines = Math.min(
    maxMines(width, height),
    Math.max(LIMITS.minMines, Math.round(config.mines)),
  );
  return { width, height, mines };
}
