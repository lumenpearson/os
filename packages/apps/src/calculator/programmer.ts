/**
 * Programmer mode is a pending-operation machine rather than an expression
 * line: you enter a word, choose an operation, enter the next word. Every
 * value is a `BigInt` masked to the word size (see bases.ts), so 64-bit
 * results are exact.
 */

import {
  applyOp,
  BASE_PREFIX,
  type Base,
  filterDigits,
  formatBase,
  maxDigits,
  negate,
  not,
  type ProgrammerOp,
  parseBase,
  type WordSize,
  wrap,
} from './bases';
import type { TapeEntry } from './storage';

export const OP_LABEL: Record<ProgrammerOp, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
  mod: 'MOD',
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
  shl: '<<',
  shr: '>>',
  rol: 'RoL',
  ror: 'RoR',
};

export interface ProgrammerState {
  /** The value carried across operations. */
  accumulator: bigint;
  /** Digits typed since the last operation; empty means the accumulator shows. */
  entry: string;
  operator: ProgrammerOp | null;
  /** The left side and operator, ready for the tape. */
  pending: string;
  error: string | null;
}

export const INITIAL_PROGRAMMER: ProgrammerState = {
  accumulator: 0n,
  entry: '',
  operator: null,
  pending: '',
  error: null,
};

export interface ProgrammerContext {
  base: Base;
  wordSize: WordSize;
}

export type ProgrammerAction =
  | { type: 'digit'; digit: string }
  | { type: 'entry'; text: string }
  | { type: 'operator'; operator: ProgrammerOp }
  | { type: 'equals' }
  | { type: 'not' }
  | { type: 'negate' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'value'; value: bigint }
  | { type: 'rebase'; from: Base }
  | { type: 'resize'; from: WordSize };

export interface ProgrammerResult {
  state: ProgrammerState;
  /** Set when `=` completed an operation. */
  tape?: TapeEntry;
}

/** The number the display is showing. */
export function currentValue(state: ProgrammerState, context: ProgrammerContext): bigint {
  if (state.entry === '') return state.accumulator;
  const parsed = parseBase(state.entry, context.base);
  return wrap(parsed ?? 0n, context.wordSize);
}

/** The text the display is showing, in the active base. */
export function displayText(state: ProgrammerState, context: ProgrammerContext): string {
  if (state.entry !== '') return state.entry;
  return formatBase(state.accumulator, context.base, context.wordSize);
}

const tagged = (value: bigint, context: ProgrammerContext): string =>
  `${BASE_PREFIX[context.base]}${formatBase(value, context.base, context.wordSize)}`;

function appendDigit(entry: string, digit: string, context: ProgrammerContext): string {
  const limit = maxDigits(context.base, context.wordSize);
  if (entry === '' || entry === '0') return digit;
  if (entry.length >= limit) return entry;
  return entry + digit;
}

function fold(
  state: ProgrammerState,
  context: ProgrammerContext,
): { value: bigint; right: bigint } | { error: string } {
  const right = currentValue(state, context);
  if (state.operator === null) return { value: right, right };
  const value = applyOp(state.operator, state.accumulator, right, context.wordSize);
  if (value === null) return { error: 'Division by zero' };
  return { value, right };
}

/** Advance the machine. Pure: the component holds the state. */
export function reduceProgrammer(
  state: ProgrammerState,
  action: ProgrammerAction,
  context: ProgrammerContext,
): ProgrammerResult {
  const cleared = state.error ? { ...INITIAL_PROGRAMMER } : state;
  switch (action.type) {
    case 'digit':
      return { state: { ...cleared, entry: appendDigit(cleared.entry, action.digit, context) } };
    case 'entry': {
      const limit = maxDigits(context.base, context.wordSize);
      const text = filterDigits(action.text, context.base).slice(0, limit);
      return { state: { ...cleared, entry: text } };
    }
    case 'value':
      return {
        state: {
          ...cleared,
          entry: '',
          accumulator: wrap(action.value, context.wordSize),
          operator: null,
          pending: '',
        },
      };
    case 'operator': {
      const folded = fold(cleared, context);
      if ('error' in folded) return { state: { ...INITIAL_PROGRAMMER, error: folded.error } };
      return {
        state: {
          ...cleared,
          accumulator: folded.value,
          entry: '',
          operator: action.operator,
          pending: `${tagged(folded.value, context)} ${OP_LABEL[action.operator]}`,
        },
      };
    }
    case 'equals': {
      const folded = fold(cleared, context);
      if ('error' in folded) return { state: { ...INITIAL_PROGRAMMER, error: folded.error } };
      const next: ProgrammerState = {
        ...INITIAL_PROGRAMMER,
        accumulator: folded.value,
      };
      if (cleared.operator === null) return { state: next };
      return {
        state: next,
        tape: {
          expression: `${cleared.pending} ${tagged(folded.right, context)}`,
          result: tagged(folded.value, context),
          at: Date.now(),
        },
      };
    }
    case 'not':
      return {
        state: {
          ...cleared,
          entry: '',
          accumulator: not(currentValue(cleared, context), context.wordSize),
        },
      };
    case 'negate':
      return {
        state: {
          ...cleared,
          entry: '',
          accumulator: negate(currentValue(cleared, context), context.wordSize),
        },
      };
    case 'clear':
      return { state: { ...INITIAL_PROGRAMMER } };
    case 'backspace': {
      if (cleared.entry === '') {
        const shown = formatBase(cleared.accumulator, context.base, context.wordSize);
        const negative = shown.startsWith('-');
        const shorter = (negative ? shown.slice(1) : shown).slice(0, -1);
        const value = shorter === '' ? 0n : (parseBase(shorter, context.base) ?? 0n);
        return {
          state: {
            ...cleared,
            accumulator: wrap(negative ? -value : value, context.wordSize),
          },
        };
      }
      return { state: { ...cleared, entry: cleared.entry.slice(0, -1) } };
    }
    case 'rebase': {
      if (cleared.entry === '') return { state: cleared };
      const value = parseBase(cleared.entry, action.from);
      return {
        state: {
          ...cleared,
          entry: value === null ? '' : formatBase(value, context.base, context.wordSize),
        },
      };
    }
    case 'resize': {
      const value = currentValue(cleared, { base: context.base, wordSize: action.from });
      return {
        state: {
          ...cleared,
          entry: '',
          accumulator: wrap(value, context.wordSize),
        },
      };
    }
  }
}
