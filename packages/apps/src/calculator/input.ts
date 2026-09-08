/**
 * Edits on the expression line. The field is a real text input — typing is
 * the primary way in — so every button press is expressed as a text edit at
 * the caret, and each of these functions returns the new text with the caret
 * that goes with it.
 */

import { canonicalizeInput, evaluate } from './expression';
import { parseNumberText } from './format';

export interface Selection {
  start: number;
  end: number;
}

export interface Edit {
  text: string;
  caret: number;
}

const NUMBER_ONLY = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Replace the selection with `insert`. */
export function insertText(text: string, selection: Selection, insert: string): Edit {
  const start = clampIndex(selection.start, text.length);
  const end = clampIndex(selection.end, text.length);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}

/** Delete the selection, or the character before the caret. */
export function deleteBackwards(text: string, selection: Selection): Edit {
  const start = clampIndex(selection.start, text.length);
  const end = clampIndex(selection.end, text.length);
  if (start !== end) return insertText(text, selection, '');
  if (start === 0) return { text, caret: 0 };
  return { text: text.slice(0, start - 1) + text.slice(start), caret: start - 1 };
}

/**
 * Flip the sign of the whole expression: a bare number gains or loses its
 * minus, anything else is wrapped in `-( … )` — and unwrapped again.
 */
export function toggleSign(text: string): Edit {
  const trimmed = text.trim();
  if (trimmed === '') return { text: '-', caret: 1 };
  if (NUMBER_ONLY.test(trimmed)) {
    const next = trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`;
    return { text: next, caret: next.length };
  }
  if (trimmed.startsWith('-(') && closesAtEnd(trimmed, 1)) {
    const inner = trimmed.slice(2, -1);
    return { text: inner, caret: inner.length };
  }
  const next = `-(${trimmed})`;
  return { text: next, caret: next.length };
}

/** Wrap the expression as a divisor of one. */
export function reciprocal(text: string): Edit {
  const trimmed = text.trim();
  if (trimmed === '') return { text, caret: text.length };
  const next = `1÷(${trimmed})`;
  return { text: next, caret: next.length };
}

/** `C` clears what is typed, `AC` clears an already empty line. */
export function clearLabel(text: string): 'C' | 'AC' {
  return text.trim() === '' ? 'AC' : 'C';
}

/**
 * What pasted text should put on the line: a number if it reads as one, an
 * expression if it parses, nothing otherwise.
 */
export function textForPaste(raw: string): string | null {
  const number = parseNumberText(raw);
  if (number !== null) return String(number);
  const cleaned = canonicalizeInput(raw.trim());
  if (cleaned === '') return null;
  return evaluate(cleaned).ok ? cleaned : null;
}

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) return length;
  return Math.min(Math.max(0, Math.round(value)), length);
}

/** True when the bracket opened at `open` is the one that closes the string. */
function closesAtEnd(text: string, open: number): boolean {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const character = text.charAt(i);
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return i === text.length - 1;
    }
  }
  return false;
}
