import { describe, expect, it } from 'vitest';
import {
  asciiChar,
  byteHex,
  hexRow,
  hexRows,
  offsetLabel,
  offsetWidth,
  rowCount,
  visibleRange,
} from './hex';

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);

describe('rowCount', () => {
  it('counts full and partial rows', () => {
    expect(rowCount(0)).toBe(0);
    expect(rowCount(1)).toBe(1);
    expect(rowCount(16)).toBe(1);
    expect(rowCount(17)).toBe(2);
    expect(rowCount(1024)).toBe(64);
  });
});

describe('offsets', () => {
  it('pads to eight uppercase hex digits', () => {
    expect(offsetLabel(0)).toBe('00000000');
    expect(offsetLabel(255)).toBe('000000FF');
    expect(offsetLabel(0xdeadbeef)).toBe('DEADBEEF');
  });

  it('widens only for files past 32 bits of offsets', () => {
    expect(offsetWidth(0)).toBe(8);
    expect(offsetWidth(1024)).toBe(8);
    expect(offsetWidth(0x1_0000_0001)).toBe(9);
  });
});

describe('byte formatting', () => {
  it('writes two uppercase hex digits', () => {
    expect(byteHex(0)).toBe('00');
    // deslop-ignore-next-line 30 — a padded byte in hex, not a section marker.
    expect(byteHex(9)).toBe('09');
    expect(byteHex(0xab)).toBe('AB');
    expect(byteHex(255)).toBe('FF');
  });

  it('shows printable ASCII and replaces everything else', () => {
    expect(asciiChar(0x41)).toBe('A');
    expect(asciiChar(0x20)).toBe(' ');
    expect(asciiChar(0x7e)).toBe('~');
    expect(asciiChar(0x00)).toBe('.');
    expect(asciiChar(0x0a)).toBe('.');
    expect(asciiChar(0x7f)).toBe('.');
    expect(asciiChar(0xff)).toBe('.');
  });
});

describe('hexRow', () => {
  it('builds a full row with its gutter', () => {
    const row = hexRow(ascii('Lumen OS preview'), 0);
    expect(row.offset).toBe(0);
    expect(row.label).toBe('00000000');
    expect(row.bytes).toHaveLength(16);
    expect(row.bytes.slice(0, 5)).toEqual(['4C', '75', '6D', '65', '6E']);
    expect(row.ascii).toBe('Lumen OS preview');
  });

  it('shortens the last row instead of padding the data', () => {
    const row = hexRow(ascii('Lumen OS previews'), 1);
    expect(row.offset).toBe(16);
    expect(row.label).toBe('00000010');
    expect(row.bytes).toEqual(['73']);
    expect(row.ascii).toBe('s');
  });

  it('marks a newline in the gutter without breaking the line', () => {
    const row = hexRow(Uint8Array.from([0x61, 0x0a, 0x62]), 0);
    expect(row.ascii).toBe('a.b');
  });
});

describe('hexRows', () => {
  const bytes = new Uint8Array(70).map((_, i) => i);

  it('returns the requested slice', () => {
    const rows = hexRows(bytes, 1, 2);
    expect(rows.map((r) => r.offset)).toEqual([16, 32]);
  });

  it('clips at the end of the file', () => {
    const rows = hexRows(bytes, 3, 10);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.bytes).toHaveLength(6);
  });

  it('returns nothing past the end or for an empty file', () => {
    expect(hexRows(bytes, 99, 4)).toEqual([]);
    expect(hexRows(new Uint8Array(0), 0, 4)).toEqual([]);
  });

  it('never accepts a negative start', () => {
    expect(hexRows(bytes, -5, 1)[0]?.offset).toBe(0);
  });
});

describe('visibleRange', () => {
  it('covers the window plus the overscan margin', () => {
    expect(visibleRange(0, 320, 16, 1000, 4)).toEqual({ start: 0, end: 25 });
    expect(visibleRange(1600, 320, 16, 1000, 4)).toEqual({ start: 96, end: 125 });
  });

  it('never runs past either end', () => {
    expect(visibleRange(-40, 320, 16, 1000, 4).start).toBe(0);
    expect(visibleRange(1_000_000, 320, 16, 40, 4)).toEqual({ start: 35, end: 40 });
  });

  it('draws nothing for an empty file', () => {
    expect(visibleRange(0, 320, 16, 0)).toEqual({ start: 0, end: 0 });
  });

  it('survives a zero row height before layout has run', () => {
    expect(visibleRange(0, 320, 0, 100)).toEqual({ start: 0, end: 0 });
  });
});
