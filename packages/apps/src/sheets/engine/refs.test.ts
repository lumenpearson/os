import { describe, expect, it } from 'vitest';
import {
  cellRef,
  colToLetters,
  coordKey,
  expandRange,
  formatRange,
  formatRef,
  inRange,
  lettersToCol,
  normalizeRange,
  parseRange,
  parseRef,
  parseRefOrRange,
  rangeOf,
  rangeSize,
  sameRange,
} from './refs';

describe('column letters', () => {
  it('converts the single-letter columns', () => {
    expect(colToLetters(0)).toBe('A');
    expect(colToLetters(25)).toBe('Z');
  });

  it('converts columns beyond Z', () => {
    expect(colToLetters(26)).toBe('AA');
    expect(colToLetters(27)).toBe('AB');
    expect(colToLetters(51)).toBe('AZ');
    expect(colToLetters(52)).toBe('BA');
    expect(colToLetters(701)).toBe('ZZ');
    expect(colToLetters(702)).toBe('AAA');
  });

  it('round-trips letters and indices', () => {
    for (const col of [0, 1, 25, 26, 27, 51, 52, 100, 701, 702, 1000]) {
      expect(lettersToCol(colToLetters(col))).toBe(col);
    }
  });

  it('reads letters case-insensitively', () => {
    expect(lettersToCol('a')).toBe(0);
    expect(lettersToCol('aa')).toBe(26);
  });
});

describe('parseRef', () => {
  it('parses a plain reference', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 0, absCol: false, absRow: false });
    expect(parseRef('B3')).toEqual({ col: 1, row: 2, absCol: false, absRow: false });
    expect(parseRef('AA10')).toEqual({ col: 26, row: 9, absCol: false, absRow: false });
  });

  it('keeps the absolute markers', () => {
    expect(parseRef('$A$1')).toEqual({ col: 0, row: 0, absCol: true, absRow: true });
    expect(parseRef('$A1')).toEqual({ col: 0, row: 0, absCol: true, absRow: false });
    expect(parseRef('A$1')).toEqual({ col: 0, row: 0, absCol: false, absRow: true });
  });

  it('accepts lower case and surrounding space', () => {
    expect(parseRef(' b2 ')).toEqual({ col: 1, row: 1, absCol: false, absRow: false });
  });

  it('rejects what is not a reference', () => {
    expect(parseRef('')).toBeNull();
    expect(parseRef('A')).toBeNull();
    expect(parseRef('1')).toBeNull();
    expect(parseRef('A0')).toBeNull();
    expect(parseRef('A1:B2')).toBeNull();
    expect(parseRef('ABCD1')).toBeNull();
  });
});

describe('formatRef', () => {
  it('writes the reference back', () => {
    expect(formatRef({ col: 0, row: 0 })).toBe('A1');
    expect(formatRef({ col: 26, row: 9 })).toBe('AA10');
  });

  it('keeps absolute markers', () => {
    expect(formatRef({ col: 0, row: 0, absCol: true, absRow: true })).toBe('$A$1');
    expect(formatRef({ col: 1, row: 4, absCol: false, absRow: true })).toBe('B$5');
  });

  it('round-trips through parseRef', () => {
    for (const text of ['A1', 'Z9', '$A$1', 'B$12', '$AA7', 'ZZ100']) {
      const ref = parseRef(text);
      expect(ref).not.toBeNull();
      expect(formatRef(ref as NonNullable<typeof ref>)).toBe(text);
    }
  });
});

describe('coordKey', () => {
  it('drops the absolute markers', () => {
    expect(coordKey({ col: 0, row: 0 })).toBe('A1');
    expect(coordKey(cellRef(1, 2, true, true))).toBe('B3');
  });
});

describe('ranges', () => {
  it('parses a range', () => {
    const r = parseRange('A1:B3');
    expect(r?.start).toMatchObject({ col: 0, row: 0 });
    expect(r?.end).toMatchObject({ col: 1, row: 2 });
  });

  it('normalises reversed corners', () => {
    const r = parseRange('B3:A1');
    expect(r?.start).toMatchObject({ col: 0, row: 0 });
    expect(r?.end).toMatchObject({ col: 1, row: 2 });
  });

  it('keeps absolute markers on the right corner when normalising', () => {
    const r = parseRange('$B$3:A1');
    expect(r?.start).toMatchObject({ col: 0, row: 0, absCol: false, absRow: false });
    expect(r?.end).toMatchObject({ col: 1, row: 2, absCol: true, absRow: true });
  });

  it('parses a single ref as a one-cell range', () => {
    const r = parseRefOrRange('C4');
    expect(r?.start).toMatchObject({ col: 2, row: 3 });
    expect(r?.end).toMatchObject({ col: 2, row: 3 });
  });

  it('rejects malformed ranges', () => {
    expect(parseRange('A1')).toBeNull();
    expect(parseRange('A1:')).toBeNull();
    expect(parseRange('A1:B2:C3')).toBeNull();
  });

  it('expands row-major', () => {
    expect(expandRange(rangeOf({ col: 0, row: 0 }, { col: 1, row: 2 }))).toEqual([
      'A1',
      'B1',
      'A2',
      'B2',
      'A3',
      'B3',
    ]);
  });

  it('expands a single cell to itself', () => {
    expect(expandRange(rangeOf({ col: 3, row: 3 }, { col: 3, row: 3 }))).toEqual(['D4']);
  });

  it('measures a range', () => {
    expect(rangeSize(rangeOf({ col: 0, row: 0 }, { col: 2, row: 4 }))).toEqual({
      rows: 5,
      cols: 3,
    });
  });

  it('formats a range, collapsing single cells', () => {
    expect(formatRange(rangeOf({ col: 0, row: 0 }, { col: 1, row: 2 }))).toBe('A1:B3');
    expect(formatRange(rangeOf({ col: 1, row: 1 }, { col: 1, row: 1 }))).toBe('B2');
  });

  it('tests membership', () => {
    const r = rangeOf({ col: 1, row: 1 }, { col: 3, row: 5 });
    expect(inRange({ col: 2, row: 3 }, r)).toBe(true);
    expect(inRange({ col: 1, row: 1 }, r)).toBe(true);
    expect(inRange({ col: 0, row: 3 }, r)).toBe(false);
    expect(inRange({ col: 2, row: 6 }, r)).toBe(false);
  });

  it('compares ranges', () => {
    const a = rangeOf({ col: 0, row: 0 }, { col: 1, row: 1 });
    const b = normalizeRange({ start: cellRef(1, 1), end: cellRef(0, 0) });
    expect(sameRange(a, b)).toBe(true);
  });
});
