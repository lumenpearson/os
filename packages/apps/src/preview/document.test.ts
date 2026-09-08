import { describe, expect, it } from 'vitest';
import {
  CSV_ROW_LIMIT,
  decodeText,
  formatDimensions,
  formatDuration,
  limitText,
  parseJsonDocument,
  progressFraction,
  toCsvTable,
} from './document';

describe('decodeText', () => {
  it('decodes UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('héllo — ok'))).toBe('héllo — ok');
  });

  it('drops a byte-order mark so it does not show up as a glyph', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(decodeText(bytes)).toBe('hi');
  });

  it('handles an empty file', () => {
    expect(decodeText(new Uint8Array(0))).toBe('');
  });
});

describe('limitText', () => {
  it('leaves a normal file alone', () => {
    expect(limitText('short')).toEqual({ text: 'short', dropped: 0 });
  });

  it('cuts a huge file and reports how much it dropped', () => {
    expect(limitText('abcdef', 4)).toEqual({ text: 'abcd', dropped: 2 });
  });
});

describe('toCsvTable', () => {
  it('takes the first row as the header', () => {
    const table = toCsvTable('name,size\nada.png,4\nbob.png,7\n');
    expect(table.header).toEqual(['name', 'size']);
    expect(table.rows).toEqual([
      ['ada.png', '4'],
      ['bob.png', '7'],
    ]);
    expect(table.totalRows).toBe(2);
    expect(table.truncated).toBe(false);
  });

  it('reads tabs and semicolons through the shared parser', () => {
    expect(toCsvTable('a\tb\n1\t2\n').delimiter).toBe('\t');
    expect(toCsvTable('a;b\n1;2\n').header).toEqual(['a', 'b']);
  });

  it('keeps quoted fields whole, newlines and all', () => {
    const table = toCsvTable('note,who\n"line one\nline two",ada\n');
    expect(table.rows).toEqual([['line one\nline two', 'ada']]);
  });

  it('pads short rows out to a rectangle', () => {
    const table = toCsvTable('a,b,c\n1\n1,2,3\n');
    expect(table.columns).toBe(3);
    expect(table.rows[0]).toEqual(['1', '', '']);
  });

  it('cuts long files and says so', () => {
    const text = ['h', ...Array.from({ length: CSV_ROW_LIMIT + 5 }, (_, i) => String(i))].join(
      '\n',
    );
    const table = toCsvTable(text);
    expect(table.rows).toHaveLength(CSV_ROW_LIMIT);
    expect(table.totalRows).toBe(CSV_ROW_LIMIT + 5);
    expect(table.truncated).toBe(true);
  });

  it('returns an empty table for an empty file', () => {
    expect(toCsvTable('   \n')).toMatchObject({ header: [], rows: [], columns: 0 });
  });

  it('handles a header with no data rows', () => {
    const table = toCsvTable('only,header');
    expect(table.header).toEqual(['only', 'header']);
    expect(table.rows).toEqual([]);
  });
});

describe('parseJsonDocument', () => {
  it('parses valid documents of every shape', () => {
    expect(parseJsonDocument('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonDocument('[]')).toEqual({ ok: true, value: [] });
    expect(parseJsonDocument('null')).toEqual({ ok: true, value: null });
  });

  it('reports the parser error rather than throwing', () => {
    const result = parseJsonDocument('{oops}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('formatDuration', () => {
  it('reads minutes and seconds under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(599.9)).toBe('9:59');
  });

  it('adds hours when there are any', () => {
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('admits when the duration is unknown', () => {
    expect(formatDuration(Number.NaN)).toBe('--:--');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('--:--');
    expect(formatDuration(-1)).toBe('--:--');
  });
});

describe('formatDimensions', () => {
  it('writes pixels with a multiplication sign', () => {
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
  });

  it('rounds fractional intrinsic sizes', () => {
    expect(formatDimensions(100.4, 50.6)).toBe('100 × 51');
  });

  it('shows nothing readable when the media has no size', () => {
    expect(formatDimensions(0, 0)).toBe('—');
  });
});

describe('progressFraction', () => {
  it('maps position onto the seek bar', () => {
    expect(progressFraction(30, 120)).toBe(0.25);
  });

  it('stays inside the bar before metadata arrives', () => {
    expect(progressFraction(5, Number.NaN)).toBe(0);
    expect(progressFraction(200, 120)).toBe(1);
    expect(progressFraction(-5, 120)).toBe(0);
  });
});
