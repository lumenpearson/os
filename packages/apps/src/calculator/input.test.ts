import { describe, expect, it } from 'vitest';
import { evaluate } from './expression';
import {
  clearLabel,
  deleteBackwards,
  insertText,
  reciprocal,
  textForPaste,
  toggleSign,
} from './input';

const at = (index: number) => ({ start: index, end: index });

describe('insertText', () => {
  it('inserts at the caret and moves it past what was inserted', () => {
    expect(insertText('12', at(2), '+')).toEqual({ text: '12+', caret: 3 });
    expect(insertText('12', at(1), '0')).toEqual({ text: '102', caret: 2 });
    expect(insertText('', at(0), 'sin(')).toEqual({ text: 'sin(', caret: 4 });
  });

  it('replaces the selection', () => {
    expect(insertText('1234', { start: 1, end: 3 }, '9')).toEqual({ text: '194', caret: 2 });
  });

  it('reads a backwards selection the same way', () => {
    expect(insertText('1234', { start: 3, end: 1 }, '9')).toEqual({ text: '194', caret: 2 });
  });

  it('clamps a caret that is off the end of the text', () => {
    expect(insertText('12', at(99), '3')).toEqual({ text: '123', caret: 3 });
    expect(insertText('12', at(-5), '3')).toEqual({ text: '312', caret: 1 });
    expect(insertText('12', { start: Number.NaN, end: Number.NaN }, '3')).toEqual({
      text: '123',
      caret: 3,
    });
  });
});

describe('deleteBackwards', () => {
  it('removes the character before the caret', () => {
    expect(deleteBackwards('123', at(3))).toEqual({ text: '12', caret: 2 });
    expect(deleteBackwards('123', at(1))).toEqual({ text: '23', caret: 0 });
  });

  it('removes the selection when there is one', () => {
    expect(deleteBackwards('1234', { start: 1, end: 3 })).toEqual({ text: '14', caret: 1 });
  });

  it('does nothing at the start of the line', () => {
    expect(deleteBackwards('123', at(0))).toEqual({ text: '123', caret: 0 });
    expect(deleteBackwards('', at(0))).toEqual({ text: '', caret: 0 });
  });
});

describe('toggleSign', () => {
  it('adds and removes the minus on a bare number', () => {
    expect(toggleSign('12')).toEqual({ text: '-12', caret: 3 });
    expect(toggleSign('-12')).toEqual({ text: '12', caret: 2 });
    expect(toggleSign('3.5')).toEqual({ text: '-3.5', caret: 4 });
    expect(toggleSign('1e5')).toEqual({ text: '-1e5', caret: 4 });
  });

  it('starts a negative number on an empty line', () => {
    expect(toggleSign('')).toEqual({ text: '-', caret: 1 });
    expect(toggleSign('   ')).toEqual({ text: '-', caret: 1 });
  });

  it('wraps and unwraps an expression', () => {
    expect(toggleSign('1+2')).toEqual({ text: '-(1+2)', caret: 6 });
    expect(toggleSign('-(1+2)')).toEqual({ text: '1+2', caret: 3 });
  });

  it('wraps again when the leading bracket is not the whole expression', () => {
    expect(toggleSign('-(1+2)*3')).toEqual({ text: '-(-(1+2)*3)', caret: 11 });
  });

  it('keeps the expression meaning the negative of what it meant', () => {
    const before = evaluate('2+3');
    const after = evaluate(toggleSign('2+3').text);
    expect(before.ok && after.ok && after.value).toBe(-5);
  });
});

describe('reciprocal', () => {
  it('divides one by the expression', () => {
    expect(reciprocal('4')).toEqual({ text: '1÷(4)', caret: 5 });
    expect(reciprocal('2+2')).toEqual({ text: '1÷(2+2)', caret: 7 });
  });

  it('leaves an empty line alone', () => {
    expect(reciprocal('')).toEqual({ text: '', caret: 0 });
  });

  it('produces text the parser reads', () => {
    const result = evaluate(reciprocal('2+2').text);
    expect(result.ok && result.value).toBe(0.25);
  });
});

describe('clearLabel', () => {
  it('says C while there is something to clear', () => {
    expect(clearLabel('12')).toBe('C');
    expect(clearLabel('0')).toBe('C');
  });

  it('says AC on an empty line', () => {
    expect(clearLabel('')).toBe('AC');
    expect(clearLabel('   ')).toBe('AC');
  });
});

describe('textForPaste', () => {
  it('takes a number, separators and all', () => {
    expect(textForPaste('1,234.5')).toBe('1234.5');
    expect(textForPaste('  −42 ')).toBe('-42');
  });

  it('takes an expression that parses', () => {
    expect(textForPaste('2+3')).toBe('2+3');
    expect(textForPaste('sqrt(16)')).toBe('sqrt(16)');
  });

  it('rewrites typed operators on the way in', () => {
    expect(textForPaste('6/2*3')).toBe('6÷2×3');
  });

  it('refuses anything that is not a calculation', () => {
    expect(textForPaste('hello')).toBeNull();
    expect(textForPaste('')).toBeNull();
    expect(textForPaste('   ')).toBeNull();
    expect(textForPaste('2+')).toBeNull();
  });
});
