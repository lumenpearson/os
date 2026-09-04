/**
 * The keypads, as data. Every key carries its keyboard equivalent, so the
 * keyboard and the buttons cannot drift apart: typing flashes the button that
 * would have done the same thing.
 */

import type { ProgrammerOp } from './bases';
import type { Mode } from './storage';

export type KeyAction =
  | 'equals'
  | 'clear'
  | 'backspace'
  | 'sign'
  | 'reciprocal'
  | 'memory-clear'
  | 'memory-recall'
  | 'memory-add'
  | 'memory-subtract'
  | 'second'
  | 'hyperbolic'
  | 'angle'
  | 'operator'
  | 'not';

export type KeyTone = 'digit' | 'function' | 'operator' | 'accent';

export interface KeyDef {
  id: string;
  label: string;
  /** Accessible name, when the label is a symbol. */
  name?: string;
  /** Text put into the expression, or the digit appended in programmer mode. */
  insert?: string;
  action?: KeyAction;
  operator?: ProgrammerOp;
  /** `KeyboardEvent.key` values that press this button. */
  keys?: string[];
  /** The field already does this on its own; the key press only flashes it. */
  native?: boolean;
  /** Columns spanned in the grid. */
  span?: number;
  tone?: KeyTone;
  icon?: 'backspace';
}

export interface Layout {
  columns: number;
  keys: KeyDef[];
}

const digit = (value: string): KeyDef => ({
  id: `digit-${value}`,
  label: value,
  insert: value,
  keys: [value],
  native: true,
  tone: 'digit',
});

const DOT: KeyDef = {
  id: 'dot',
  label: '.',
  name: 'Decimal point',
  insert: '.',
  keys: ['.', ','],
  native: true,
  tone: 'digit',
};

const CLEAR: KeyDef = {
  id: 'clear',
  label: 'AC',
  name: 'Clear',
  action: 'clear',
  keys: ['Escape'],
  tone: 'function',
};

const BACKSPACE: KeyDef = {
  id: 'backspace',
  label: 'Backspace',
  name: 'Backspace',
  icon: 'backspace',
  action: 'backspace',
  keys: ['Backspace'],
  native: true,
  tone: 'function',
};

const EQUALS: KeyDef = {
  id: 'equals',
  label: '=',
  name: 'Equals',
  action: 'equals',
  keys: ['Enter', '='],
  tone: 'accent',
};

const SIGN: KeyDef = {
  id: 'sign',
  label: '±',
  name: 'Change sign',
  action: 'sign',
  tone: 'function',
};

const PERCENT: KeyDef = {
  id: 'percent',
  label: '%',
  name: 'Percent',
  insert: '%',
  keys: ['%'],
  native: true,
  tone: 'function',
};

const operator = (id: string, label: string, name: string, keys: string[]): KeyDef => ({
  id,
  label,
  name,
  insert: label,
  keys,
  native: true,
  tone: 'operator',
});

const DIVIDE = operator('divide', '÷', 'Divide', ['/']);
const MULTIPLY = operator('multiply', '×', 'Multiply', ['*']);
const SUBTRACT = operator('subtract', '−', 'Subtract', ['-']);
const ADD = operator('add', '+', 'Add', ['+']);

const MEMORY: KeyDef[] = [
  { id: 'mc', label: 'MC', name: 'Memory clear', action: 'memory-clear', tone: 'function' },
  { id: 'mr', label: 'MR', name: 'Memory recall', action: 'memory-recall', tone: 'function' },
  { id: 'm-add', label: 'M+', name: 'Memory add', action: 'memory-add', tone: 'function' },
  {
    id: 'm-sub',
    label: 'M−',
    name: 'Memory subtract',
    action: 'memory-subtract',
    tone: 'function',
  },
];

export const BASIC_LAYOUT: Layout = {
  columns: 4,
  keys: [
    ...MEMORY,
    CLEAR,
    BACKSPACE,
    PERCENT,
    DIVIDE,
    digit('7'),
    digit('8'),
    digit('9'),
    MULTIPLY,
    digit('4'),
    digit('5'),
    digit('6'),
    SUBTRACT,
    digit('1'),
    digit('2'),
    digit('3'),
    ADD,
    SIGN,
    digit('0'),
    DOT,
    EQUALS,
  ],
};

const fn = (id: string, label: string, name: string, insert: string): KeyDef => ({
  id,
  label,
  name,
  insert,
  tone: 'function',
});

export const SCIENTIFIC_LAYOUT: Layout = {
  columns: 5,
  keys: [
    { id: 'second', label: '2nd', name: 'Inverse functions', action: 'second', tone: 'function' },
    { id: 'angle', label: 'DEG', name: 'Angle unit', action: 'angle', tone: 'function' },
    {
      id: 'open',
      label: '(',
      name: 'Open bracket',
      insert: '(',
      keys: ['('],
      native: true,
      tone: 'function',
    },
    {
      id: 'close',
      label: ')',
      name: 'Close bracket',
      insert: ')',
      keys: [')'],
      native: true,
      tone: 'function',
    },
    BACKSPACE,
    ...MEMORY,
    PERCENT,
    fn('sin', 'sin', 'Sine', 'sin('),
    fn('cos', 'cos', 'Cosine', 'cos('),
    fn('tan', 'tan', 'Tangent', 'tan('),
    fn('ln', 'ln', 'Natural logarithm', 'ln('),
    fn('log', 'log', 'Logarithm base 10', 'log('),
    fn('exp', 'eˣ', 'e to the power of x', 'exp('),
    fn('pow10', '10ˣ', '10 to the power of x', '10^'),
    {
      id: 'power',
      label: 'xʸ',
      name: 'Power',
      insert: '^',
      keys: ['^'],
      native: true,
      tone: 'function',
    },
    {
      id: 'hyperbolic',
      label: 'hyp',
      name: 'Hyperbolic functions',
      action: 'hyperbolic',
      tone: 'function',
    },
    fn('sqrt', '√', 'Square root', '√('),
    fn('cbrt', '∛', 'Cube root', '∛('),
    {
      id: 'factorial',
      label: 'x!',
      name: 'Factorial',
      insert: '!',
      keys: ['!'],
      native: true,
      tone: 'function',
    },
    { id: 'reciprocal', label: '1/x', name: 'Reciprocal', action: 'reciprocal', tone: 'function' },
    fn('pi', 'π', 'Pi', 'π'),
    fn('euler', 'e', "Euler's number", 'e'),
    digit('7'),
    digit('8'),
    digit('9'),
    DIVIDE,
    MULTIPLY,
    digit('4'),
    digit('5'),
    digit('6'),
    SUBTRACT,
    ADD,
    digit('1'),
    digit('2'),
    digit('3'),
    DOT,
    SIGN,
    CLEAR,
    { ...digit('0'), span: 2 },
    { ...EQUALS, span: 2 },
  ],
};

const bitwise = (
  id: string,
  label: string,
  name: string,
  op: ProgrammerOp,
  keys: string[],
): KeyDef => ({ id, label, name, action: 'operator', operator: op, keys, tone: 'function' });

const progOperator = (
  id: string,
  label: string,
  name: string,
  op: ProgrammerOp,
  keys: string[],
): KeyDef => ({ id, label, name, action: 'operator', operator: op, keys, tone: 'operator' });

const hexDigit = (value: string): KeyDef => ({
  id: `digit-${value}`,
  label: value,
  insert: value,
  keys: [value, value.toLowerCase()],
  native: true,
  tone: 'digit',
});

/**
 * Programmer mode drives a state machine rather than a text field, so no key
 * is left to the field: every keystroke goes through the reducer.
 */
export const PROGRAMMER_LAYOUT: Layout = {
  columns: 6,
  // `satisfies` keeps each literal narrow (an action stays a KeyAction) while
  // the spread below rewrites `native` on every key.
  keys: (
    [
      bitwise('and', 'AND', 'Bitwise and', 'and', ['&']),
      bitwise('or', 'OR', 'Bitwise or', 'or', ['|']),
      bitwise('xor', 'XOR', 'Bitwise exclusive or', 'xor', ['^']),
      {
        id: 'not',
        label: 'NOT',
        name: 'Bitwise not',
        action: 'not',
        keys: ['~'],
        tone: 'function',
      },
      bitwise('shl', '<<', 'Shift left', 'shl', ['<']),
      bitwise('shr', '>>', 'Shift right', 'shr', ['>']),
      bitwise('rol', 'RoL', 'Rotate left', 'rol', []),
      bitwise('ror', 'RoR', 'Rotate right', 'ror', []),
      bitwise('mod', 'MOD', 'Remainder', 'mod', ['%']),
      SIGN,
      CLEAR,
      BACKSPACE,
      hexDigit('A'),
      hexDigit('B'),
      digit('7'),
      digit('8'),
      digit('9'),
      progOperator('divide', '÷', 'Divide', 'div', ['/']),
      hexDigit('C'),
      hexDigit('D'),
      digit('4'),
      digit('5'),
      digit('6'),
      progOperator('multiply', '×', 'Multiply', 'mul', ['*']),
      hexDigit('E'),
      hexDigit('F'),
      digit('1'),
      digit('2'),
      digit('3'),
      progOperator('subtract', '−', 'Subtract', 'sub', ['-']),
      { ...digit('0'), span: 2 },
      { ...EQUALS, span: 3 },
      progOperator('add', '+', 'Add', 'add', ['+']),
    ] satisfies KeyDef[]
  ).map((key) => ({ ...key, native: false })),
};

export const LAYOUTS: Record<Mode, Layout> = {
  basic: BASIC_LAYOUT,
  scientific: SCIENTIFIC_LAYOUT,
  programmer: PROGRAMMER_LAYOUT,
};

// ── keyboard ──────────────────────────────────────────────────────────────

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type KeyOutcome =
  /** The field handles the keystroke; only flash the button. */
  | { kind: 'flash'; key: KeyDef }
  /** The app handles the keystroke. */
  | { kind: 'run'; key: KeyDef };

/**
 * Which button a keystroke belongs to. Modified keystrokes belong to the
 * menus, so they are left alone.
 */
export function resolveKey(layout: Layout, event: KeyEventLike): KeyOutcome | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const match = layout.keys.find((key) =>
    key.keys?.some((candidate) => sameKey(candidate, event.key)),
  );
  if (!match) return null;
  return { kind: match.native ? 'flash' : 'run', key: match };
}

function sameKey(candidate: string, pressed: string): boolean {
  return candidate.length === 1 && pressed.length === 1
    ? candidate.toLowerCase() === pressed.toLowerCase()
    : candidate === pressed;
}

// ── labels that depend on state ───────────────────────────────────────────

export type TrigName = 'sin' | 'cos' | 'tan';

export interface TrigMode {
  second: boolean;
  hyperbolic: boolean;
}

/** The label and insertion for a trig key under the 2nd / hyp toggles. */
export function trigKey(name: TrigName, mode: TrigMode): { label: string; insert: string } {
  const base = mode.hyperbolic ? `${name}h` : name;
  const label = mode.second ? `${base}⁻¹` : base;
  const insert = `${mode.second ? 'a' : ''}${base}(`;
  return { label, insert };
}
