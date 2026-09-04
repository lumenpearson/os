/**
 * What the calculator keeps between sessions: the mode it was left in, the
 * angle unit, the programmer base and word size, and the tape.
 * Written to ~/.config/calculator.json, so every field is validated on the
 * way in — the file is a text file a user can edit.
 */

import { BASES, type Base, WORD_SIZES, type WordSize } from './bases';
import type { AngleUnit } from './expression';

export type Mode = 'basic' | 'scientific' | 'programmer';

export const MODES: readonly Mode[] = ['basic', 'scientific', 'programmer'];

export const MODE_LABEL: Record<Mode, string> = {
  basic: 'Basic',
  scientific: 'Scientific',
  programmer: 'Programmer',
};

export interface TapeEntry {
  /** The expression as it was entered. */
  expression: string;
  /** The result as it was shown. */
  result: string;
  at: number;
}

export interface CalculatorData {
  mode: Mode;
  angle: AngleUnit;
  base: Base;
  wordSize: WordSize;
  showTape: boolean;
  memory: number;
  tape: TapeEntry[];
}

/** Lines of tape kept; older ones fall off the end. */
export const TAPE_LIMIT = 60;

export const DEFAULT_DATA: CalculatorData = {
  mode: 'basic',
  angle: 'deg',
  base: 'hex',
  wordSize: 32,
  showTape: false,
  memory: 0,
  tape: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readEntry(value: unknown): TapeEntry | null {
  if (!isRecord(value)) return null;
  const { expression, result, at } = value;
  if (typeof expression !== 'string' || typeof result !== 'string') return null;
  return { expression, result, at: typeof at === 'number' ? at : 0 };
}

/** Coerce whatever is in the file into a usable state. */
export function normalizeData(raw: unknown): CalculatorData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  const tape = Array.isArray(raw.tape)
    ? raw.tape
        .map(readEntry)
        .filter((entry): entry is TapeEntry => entry !== null)
        .slice(0, TAPE_LIMIT)
    : DEFAULT_DATA.tape;
  return {
    mode: oneOf(raw.mode, MODES, DEFAULT_DATA.mode),
    angle: oneOf<AngleUnit>(raw.angle, ['deg', 'rad'], DEFAULT_DATA.angle),
    base: oneOf(raw.base, BASES, DEFAULT_DATA.base),
    wordSize: oneOf<WordSize>(raw.wordSize, WORD_SIZES, DEFAULT_DATA.wordSize),
    showTape: typeof raw.showTape === 'boolean' ? raw.showTape : DEFAULT_DATA.showTape,
    memory: typeof raw.memory === 'number' && Number.isFinite(raw.memory) ? raw.memory : 0,
    tape,
  };
}

/** Newest first, capped. */
export function pushTape(
  tape: readonly TapeEntry[],
  entry: TapeEntry,
  limit = TAPE_LIMIT,
): TapeEntry[] {
  return [entry, ...tape].slice(0, Math.max(0, limit));
}
