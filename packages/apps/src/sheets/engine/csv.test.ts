import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited, serializeDelimited } from './csv';

describe('parseDelimited', () => {
  it('parses plain rows', () => {
    expect(parseDelimited('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseDelimited('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseDelimited('a,,c')).toEqual([['a', '', 'c']]);
    expect(parseDelimited(',')).toEqual([['', '']]);
  });

  it('unquotes quoted fields', () => {
    expect(parseDelimited('"a","b"')).toEqual([['a', 'b']]);
  });

  it('keeps a delimiter inside quotes', () => {
    expect(parseDelimited('"a,b",c')).toEqual([['a,b', 'c']]);
  });

  it('reads doubled quotes as one quote', () => {
    expect(parseDelimited('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
  });

  it('keeps a newline inside quotes', () => {
    expect(parseDelimited('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('parses tab-separated text', () => {
    expect(parseDelimited('a\tb\nc\td', '\t')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('drops a UTF-8 byte-order mark', () => {
    expect(parseDelimited('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('parses an empty document as no rows', () => {
    expect(parseDelimited('')).toEqual([]);
  });

  it('ignores a trailing newline', () => {
    expect(parseDelimited('a,b\n')).toEqual([['a', 'b']]);
  });

  it('keeps ragged rows ragged', () => {
    expect(parseDelimited('a,b,c\nd')).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('keeps spaces outside quotes', () => {
    expect(parseDelimited('a , b')).toEqual([['a ', ' b']]);
  });
});

describe('detectDelimiter', () => {
  it('finds commas', () => {
    expect(detectDelimiter('a,b,c\nd,e,f')).toBe(',');
  });

  it('finds tabs', () => {
    expect(detectDelimiter('a\tb\tc\nd\te\tf')).toBe('\t');
  });

  it('finds semicolons', () => {
    expect(detectDelimiter('a;b;c\nd;e;f')).toBe(';');
  });

  it('prefers the delimiter that splits every line the same way', () => {
    expect(detectDelimiter('a,b\tc\nd,e\tf\ng,h\ti')).toBe(',');
  });

  it('falls back to a comma', () => {
    expect(detectDelimiter('single column')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });

  it('does not count a delimiter inside quotes', () => {
    expect(detectDelimiter('"a;b;c"\td\n"e;f;g"\th')).toBe('\t');
  });
});

describe('serializeDelimited', () => {
  it('writes plain rows', () => {
    expect(
      serializeDelimited([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a,b\nc,d\n');
  });

  it('quotes a field with the delimiter in it', () => {
    expect(serializeDelimited([['a,b', 'c']])).toBe('"a,b",c\n');
  });

  it('doubles quotes inside a field', () => {
    expect(serializeDelimited([['say "hi"']])).toBe('"say ""hi"""\n');
  });

  it('quotes a field with a newline', () => {
    expect(serializeDelimited([['line1\nline2']])).toBe('"line1\nline2"\n');
  });

  it('quotes a field with leading or trailing space', () => {
    expect(serializeDelimited([[' a', 'b ']])).toBe('" a","b "\n');
  });

  it('writes tab-separated text', () => {
    expect(serializeDelimited([['a', 'b']], '\t')).toBe('a\tb\n');
  });

  it('writes an empty document as an empty string', () => {
    expect(serializeDelimited([])).toBe('');
  });

  it('round-trips awkward content', () => {
    const rows = [
      ['plain', 'with,comma', 'with "quotes"'],
      ['line1\nline2', '', ' spaced '],
      ['1', '2.5', '-3'],
    ];
    expect(parseDelimited(serializeDelimited(rows))).toEqual(rows);
  });

  it('round-trips through TSV too', () => {
    const rows = [
      ['a\tb', 'c'],
      ['d', 'e'],
    ];
    expect(parseDelimited(serializeDelimited(rows, '\t'), '\t')).toEqual(rows);
  });
});
