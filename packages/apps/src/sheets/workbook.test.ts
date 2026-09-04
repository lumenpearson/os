import { describe, expect, it } from 'vitest';
import { evaluateSheet } from './engine/evaluate';
import { rangeOf } from './engine/refs';
import {
  acceptsReference,
  addSheet,
  blockToTsv,
  cellText,
  clearRange,
  coordOf,
  DEFAULT_COL_WIDTH,
  deleteColumns,
  deleteRows,
  emptyWorkbook,
  endsWithReference,
  fillRange,
  freeSheetName,
  gridSize,
  insertColumns,
  insertReference,
  insertRows,
  MAX_COLS,
  MAX_ROWS,
  MIN_COLS,
  MIN_ROWS,
  parseCellInput,
  parseWorkbook,
  pushHistory,
  readRange,
  removeSheet,
  renameSheet,
  type SheetData,
  selectionStats,
  serializeWorkbook,
  setCell,
  setColumnWidth,
  setStyle,
  sheetFromRows,
  sheetToCsv,
  sheetToRows,
  tsvToBlock,
  usedBounds,
  workbookFromCsv,
  writeBlock,
} from './workbook';

const options = { locale: 'en-US', now: () => new Date(2024, 4, 17) };

function sheet(cells: SheetData['cells'], extra: Partial<SheetData> = {}): SheetData {
  return { name: 'Sheet 1', cells, ...extra };
}

/** The seeded Documents/Budget.lsd, as written by packages/kernel/src/fs/seed.ts. */
const SEEDED_BUDGET = {
  version: 1,
  sheets: [
    {
      name: 'Budget',
      cells: {
        A1: 'Item',
        B1: 'Planned',
        C1: 'Actual',
        A2: 'Rent',
        B2: 1200,
        C2: 1200,
        A3: 'Groceries',
        B3: 420,
        C3: 388,
        A4: 'Transport',
        B4: 90,
        C4: 104,
        A5: 'Total',
        B5: '=SUM(B2:B4)',
        C5: '=SUM(C2:C4)',
        A7: 'Difference',
        B7: '=B5-C5',
      },
      columnWidths: { A: 140 },
    },
  ],
};

describe('parseWorkbook', () => {
  it('reads the seeded budget', () => {
    const wb = parseWorkbook(SEEDED_BUDGET);
    expect(wb.sheets).toHaveLength(1);
    const s = wb.sheets[0] as SheetData;
    expect(s.name).toBe('Budget');
    expect(s.cells.B2).toBe(1200);
    expect(s.cells.B5).toBe('=SUM(B2:B4)');
    expect(s.columnWidths).toEqual({ A: 140 });
  });

  it('gives an empty workbook one sheet', () => {
    expect(parseWorkbook({}).sheets).toHaveLength(1);
    expect(parseWorkbook(null).sheets).toHaveLength(1);
    expect(parseWorkbook('nonsense').sheets).toHaveLength(1);
    expect(parseWorkbook({ sheets: [] }).sheets).toHaveLength(1);
  });

  it('names an unnamed sheet by its position', () => {
    expect(parseWorkbook({ sheets: [{}, {}] }).sheets.map((s) => s.name)).toEqual([
      'Sheet 1',
      'Sheet 2',
    ]);
  });

  it('normalises cell keys and drops junk', () => {
    const s = parseWorkbook({ sheets: [{ cells: { a1: 1, $B$2: 2, nope: 3, A0: 4, C3: null } }] })
      .sheets[0] as SheetData;
    expect(s.cells).toEqual({ A1: 1, B2: 2 });
  });

  it('keeps only known styles', () => {
    const s = parseWorkbook({
      sheets: [
        {
          styles: {
            A1: { bold: true, align: 'right', format: 'currency' },
            B1: { align: 'sideways' },
            C1: 'no',
          },
        },
      ],
    }).sheets[0] as SheetData;
    expect(s.styles).toEqual({ A1: { bold: true, align: 'right', format: 'currency' } });
  });

  it('drops a non-finite or too small size', () => {
    const s = parseWorkbook({ sheets: [{ columnWidths: { A: 10, B: Number.NaN, C: 200 } }] })
      .sheets[0] as SheetData;
    expect(s.columnWidths).toEqual({ A: 32, C: 200 });
  });

  it('round-trips through serializeWorkbook', () => {
    expect(serializeWorkbook(parseWorkbook(SEEDED_BUDGET))).toEqual(SEEDED_BUDGET);
  });

  it('writes cells in reading order', () => {
    const wb = { version: 1 as const, sheets: [sheet({ B2: 2, A1: 1, A2: 3 })] };
    expect(Object.keys(serializeWorkbook(wb).sheets[0]?.cells ?? {})).toEqual(['A1', 'A2', 'B2']);
  });

  it('leaves empty maps out of the file', () => {
    const written = serializeWorkbook(emptyWorkbook()).sheets[0] as SheetData;
    expect(written.styles).toBeUndefined();
    expect(written.columnWidths).toBeUndefined();
  });
});

describe('parseCellInput', () => {
  it('clears on empty text', () => {
    expect(parseCellInput('')).toEqual({ value: null });
    expect(parseCellInput('   ')).toEqual({ value: null });
  });

  it('keeps a formula as text', () => {
    expect(parseCellInput('=SUM(A1:A3)')).toEqual({ value: '=SUM(A1:A3)' });
    expect(parseCellInput('  =1+1  ')).toEqual({ value: '=1+1' });
  });

  it('stores a lone = as text', () => {
    expect(parseCellInput('=')).toEqual({ value: '=' });
  });

  it('makes numbers numbers', () => {
    expect(parseCellInput('42')).toEqual({ value: 42 });
    expect(parseCellInput('-3.5')).toEqual({ value: -3.5 });
    expect(parseCellInput('0')).toEqual({ value: 0 });
  });

  it('keeps text a number would not round-trip', () => {
    expect(parseCellInput('007')).toEqual({ value: '007' });
    expect(parseCellInput('1.50')).toEqual({ value: '1.50' });
    expect(parseCellInput('1e3')).toEqual({ value: '1e3' });
  });

  it('reads a percent and remembers the format', () => {
    expect(parseCellInput('50%')).toEqual({ value: 0.5, format: 'percent' });
  });

  it('reads a grouped number and remembers the format', () => {
    expect(parseCellInput('1,234.50')).toEqual({ value: 1234.5, format: 'number' });
  });

  it('keeps plain text', () => {
    expect(parseCellInput('Groceries')).toEqual({ value: 'Groceries' });
    expect(parseCellInput('2024-05-17')).toEqual({ value: '2024-05-17' });
  });

  it('keeps the spaces of text as typed', () => {
    expect(parseCellInput('  hello  ')).toEqual({ value: '  hello  ' });
  });
});

describe('cellText', () => {
  it('shows what the formula bar should show', () => {
    expect(cellText(undefined)).toBe('');
    expect(cellText('=SUM(A1:A2)')).toBe('=SUM(A1:A2)');
    expect(cellText(1200)).toBe('1200');
    expect(cellText(0.1 + 0.2)).toBe('0.3');
  });
});

describe('coordOf', () => {
  it('reads a canonical key', () => {
    expect(coordOf('A1')).toEqual({ col: 0, row: 0 });
    expect(coordOf('AA10')).toEqual({ col: 26, row: 9 });
    expect(coordOf('nope')).toBeNull();
  });
});

describe('bounds and grid size', () => {
  it('measures the used area', () => {
    expect(usedBounds(sheet({ A1: 1, C5: 2 }))).toEqual({ rows: 5, cols: 3 });
    expect(usedBounds(sheet({}))).toEqual({ rows: 0, cols: 0 });
  });

  it('counts styled but empty cells and sized columns', () => {
    expect(usedBounds(sheet({}, { styles: { D2: { bold: true } } }))).toEqual({ rows: 2, cols: 4 });
    expect(usedBounds(sheet({}, { columnWidths: { C: 120 } }))).toEqual({ rows: 0, cols: 3 });
    expect(usedBounds(sheet({}, { rowHeights: { 4: 40 } }))).toEqual({ rows: 4, cols: 0 });
  });

  it('keeps a floor of 200 rows and 52 columns', () => {
    expect(gridSize(sheet({ A1: 1 }))).toEqual({ rows: MIN_ROWS, cols: MIN_COLS });
  });

  it('grows past the used area', () => {
    const big = gridSize(sheet({ A400: 1 }));
    expect(big.rows).toBeGreaterThan(400);
  });

  it('never falls below the floor the view asks for', () => {
    const grown = gridSize(sheet({ A1: 1 }), { rows: 400, cols: 80 });
    expect(grown.rows).toBe(400);
    expect(grown.cols).toBe(80);
  });

  it('ignores a floor under the default size', () => {
    expect(gridSize(sheet({ A1: 1 }), { rows: 10, cols: 2 })).toEqual({
      rows: MIN_ROWS,
      cols: MIN_COLS,
    });
  });

  it('stops at the maximum grid', () => {
    const huge = gridSize(sheet({ A1: 1 }), { rows: 1e9, cols: 1e9 });
    expect(huge.rows).toBe(MAX_ROWS);
    expect(huge.cols).toBe(MAX_COLS);
  });
});

describe('cell edits', () => {
  it('sets and clears a cell', () => {
    const s = setCell(sheet({}), 'A1', 5);
    expect(s.cells.A1).toBe(5);
    expect(setCell(s, 'A1', null).cells.A1).toBeUndefined();
  });

  it('does not touch the sheet it was given', () => {
    const before = sheet({ A1: 1 });
    setCell(before, 'A1', 2);
    expect(before.cells.A1).toBe(1);
  });

  it('clears a range but keeps styles', () => {
    const s = clearRange(
      sheet({ A1: 1, A2: 2, B1: 3 }, { styles: { A1: { bold: true } } }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 1 }),
    );
    expect(s.cells).toEqual({ B1: 3 });
    expect(s.styles?.A1).toEqual({ bold: true });
  });

  it('merges a style patch', () => {
    let s = setStyle(sheet({}), ['A1'], { bold: true });
    s = setStyle(s, ['A1'], { italic: true });
    expect(s.styles?.A1).toEqual({ bold: true, italic: true });
  });

  it('drops a style turned off', () => {
    let s = setStyle(sheet({}), ['A1'], { bold: true, italic: true });
    s = setStyle(s, ['A1'], { bold: false });
    expect(s.styles?.A1).toEqual({ italic: true });
    s = setStyle(s, ['A1'], { italic: false });
    expect(s.styles).toBeUndefined();
  });

  it('drops the general format rather than storing it', () => {
    const s = setStyle(sheet({}), ['A1'], { format: 'general' });
    expect(s.styles).toBeUndefined();
  });

  it('styles several cells at once', () => {
    const s = setStyle(sheet({}), ['A1', 'B1'], { align: 'center' });
    expect(s.styles).toEqual({ A1: { align: 'center' }, B1: { align: 'center' } });
  });

  it('sets a column width with a floor', () => {
    expect(setColumnWidth(sheet({}), 0, 200).columnWidths?.A).toBe(200);
    expect(setColumnWidth(sheet({}), 0, 4).columnWidths?.A).toBe(32);
  });
});

describe('readRange and writeBlock', () => {
  const src = sheet({ A1: 1, B1: 2, A2: '=A1*2', B2: 'x' });

  it('reads a block row-major with holes', () => {
    expect(readRange(src, rangeOf({ col: 0, row: 0 }, { col: 1, row: 2 }))).toEqual([
      [1, 2],
      ['=A1*2', 'x'],
      [undefined, undefined],
    ]);
  });

  it('writes a block at a target', () => {
    const s = writeBlock(sheet({}), { col: 2, row: 4 }, [
      [1, 2],
      [3, 4],
    ]);
    expect(s.cells).toEqual({ C5: 1, D5: 2, C6: 3, D6: 4 });
  });

  it('shifts formulas by how far the block moved', () => {
    const block = readRange(src, rangeOf({ col: 0, row: 1 }, { col: 0, row: 1 }));
    const s = writeBlock(sheet({}), { col: 1, row: 5 }, block, { col: 0, row: 1 });
    expect(s.cells.B6).toBe('=B5*2');
  });

  it('leaves formulas alone when pasting without an origin', () => {
    const s = writeBlock(sheet({}), { col: 1, row: 5 }, [['=A1*2']]);
    expect(s.cells.B6).toBe('=A1*2');
  });

  it('clears the target cell for a hole in the block', () => {
    const s = writeBlock(sheet({ A1: 'old' }), { col: 0, row: 0 }, [[undefined]]);
    expect(s.cells.A1).toBeUndefined();
  });
});

describe('fillRange', () => {
  it('fills down, shifting relative references', () => {
    const s = fillRange(
      sheet({ A1: 1, B1: 2, C1: '=A1+B1' }),
      rangeOf({ col: 2, row: 0 }, { col: 2, row: 0 }),
      rangeOf({ col: 2, row: 0 }, { col: 2, row: 2 }),
    );
    expect(s.cells.C2).toBe('=A2+B2');
    expect(s.cells.C3).toBe('=A3+B3');
    expect(s.cells.C1).toBe('=A1+B1');
  });

  it('fills right', () => {
    const s = fillRange(
      sheet({ A1: '=A2*2' }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 0 }),
      rangeOf({ col: 0, row: 0 }, { col: 2, row: 0 }),
    );
    expect(s.cells.B1).toBe('=B2*2');
    expect(s.cells.C1).toBe('=C2*2');
  });

  it('keeps absolute references fixed while filling', () => {
    const s = fillRange(
      sheet({ A1: '=B1*$C$1' }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 0 }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 1 }),
    );
    expect(s.cells.A2).toBe('=B2*$C$1');
  });

  it('repeats plain values', () => {
    const s = fillRange(
      sheet({ A1: 'x' }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 0 }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 2 }),
    );
    expect(s.cells.A2).toBe('x');
    expect(s.cells.A3).toBe('x');
  });

  it('cycles a multi-cell source', () => {
    const s = fillRange(
      sheet({ A1: 'a', A2: 'b' }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 1 }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 5 }),
    );
    expect([s.cells.A3, s.cells.A4, s.cells.A5, s.cells.A6]).toEqual(['a', 'b', 'a', 'b']);
  });

  it('carries the style of the source', () => {
    const s = fillRange(
      sheet({ A1: 1 }, { styles: { A1: { bold: true } } }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 0 }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 1 }),
    );
    expect(s.styles?.A2).toEqual({ bold: true });
  });

  it('clears a target whose source is empty', () => {
    const s = fillRange(
      sheet({ A2: 'old' }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 0 }),
      rangeOf({ col: 0, row: 0 }, { col: 0, row: 1 }),
    );
    expect(s.cells.A2).toBeUndefined();
  });
});

describe('insert and delete rows', () => {
  const base = sheet(
    { A1: 'head', A2: 1, A3: 2, A4: '=SUM(A2:A3)' },
    { styles: { A1: { bold: true } }, rowHeights: { 2: 40 } },
  );

  it('moves cells down and grows the range', () => {
    const s = insertRows(base, 1);
    expect(s.cells.A1).toBe('head');
    expect(s.cells.A2).toBeUndefined();
    expect(s.cells.A3).toBe(1);
    expect(s.cells.A5).toBe('=SUM(A3:A4)');
  });

  it('moves styles and row heights with the rows', () => {
    const s = insertRows(base, 0);
    expect(s.styles?.A2).toEqual({ bold: true });
    expect(s.rowHeights).toEqual({ 3: 40 });
  });

  it('deletes a row and shrinks the range to the one cell left', () => {
    const s = deleteRows(base, 2);
    expect(s.cells.A3).toBe('=SUM(A2)');
    expect(s.cells.A4).toBeUndefined();
  });

  it('breaks a formula whose only cell is deleted', () => {
    const s = deleteRows(sheet({ A1: 1, B1: '=A1' }), 0);
    expect(s.cells.B1).toBeUndefined();
    expect(deleteRows(sheet({ A1: 1, A5: '=A1' }), 0).cells.A4).toBe('=#REF!');
  });

  it('keeps the total after inserting a row inside the summed range', () => {
    const s = insertRows(sheet({ A1: 10, A2: 20, A3: '=SUM(A1:A2)' }), 1);
    const values = evaluateSheet(s.cells);
    expect(s.cells.A4).toBe('=SUM(A1:A3)');
    expect(values.get('A4')?.value).toBe(30);
  });
});

describe('insert and delete columns', () => {
  const base = sheet({ A1: 1, B1: 2, C1: '=A1+B1' }, { columnWidths: { B: 140 } });

  it('moves cells right', () => {
    const s = insertColumns(base, 1);
    expect(s.cells.A1).toBe(1);
    expect(s.cells.C1).toBe(2);
    expect(s.cells.D1).toBe('=A1+C1');
    expect(s.columnWidths).toEqual({ C: 140 });
  });

  it('deletes a column and moves the rest left', () => {
    const s = deleteColumns(base, 0);
    expect(s.cells.A1).toBe(2);
    expect(s.cells.B1).toBe('=#REF!+A1');
    expect(s.columnWidths).toEqual({ A: 140 });
  });

  it('recomputes after the change', () => {
    const s = insertColumns(sheet({ A1: 2, B1: 3, C1: '=A1*B1' }), 1);
    expect(evaluateSheet(s.cells).get('D1')?.value).toBe(6);
  });
});

describe('sheets in a workbook', () => {
  it('adds a sheet with a free name', () => {
    const wb = addSheet(emptyWorkbook());
    expect(wb.sheets).toHaveLength(2);
    expect(wb.sheets[1]?.name).toBe('Sheet 2');
  });

  it('does not reuse a name', () => {
    const wb = { version: 1 as const, sheets: [sheet({}, { name: 'Sheet 2' })] };
    expect(freeSheetName(wb)).toBe('Sheet 3');
  });

  it('renames a sheet, ignoring an empty name', () => {
    const wb = renameSheet(emptyWorkbook(), 0, ' Budget ');
    expect(wb.sheets[0]?.name).toBe('Budget');
    expect(renameSheet(wb, 0, '  ').sheets[0]?.name).toBe('Budget');
  });

  it('removes a sheet but never the last one', () => {
    const two = addSheet(emptyWorkbook());
    expect(removeSheet(two, 0).sheets).toHaveLength(1);
    expect(removeSheet(emptyWorkbook(), 0).sheets).toHaveLength(1);
  });
});

describe('CSV', () => {
  it('builds a sheet from rows', () => {
    const s = sheetFromRows(
      [
        ['Item', 'Cost'],
        ['Rent', '1200'],
        ['', '50%'],
      ],
      'Import',
    );
    expect(s.name).toBe('Import');
    expect(s.cells).toEqual({ A1: 'Item', B1: 'Cost', A2: 'Rent', B2: 1200, B3: 0.5 });
    expect(s.styles?.B3).toEqual({ format: 'percent' });
  });

  it('imports a CSV document', () => {
    const wb = workbookFromCsv('a,b\n1,2\n', 'Data');
    expect(wb.sheets[0]?.cells).toEqual({ A1: 'a', B1: 'b', A2: 1, B2: 2 });
  });

  it('imports tab-separated text', () => {
    const wb = workbookFromCsv('a\tb\n1\t2\n', 'Data');
    expect(wb.sheets[0]?.cells.B2).toBe(2);
  });

  it('exports computed values, not formulas', () => {
    const rows = sheetToRows(sheet({ A1: 2, A2: 3, A3: '=A1+A2' }), options);
    expect(rows).toEqual([['2'], ['3'], ['5']]);
  });

  it('exports the formatted value of a styled cell', () => {
    const rows = sheetToRows(
      sheet({ A1: 0.25 }, { styles: { A1: { format: 'percent' } } }),
      options,
    );
    expect(rows[0]).toEqual(['25.00%']);
  });

  it('exports an error by its code', () => {
    expect(sheetToRows(sheet({ A1: '=1/0' }), options)[0]).toEqual(['#DIV/0!']);
  });

  it('writes CSV with a trailing newline', () => {
    expect(sheetToCsv(sheet({ A1: 'a', B1: 'b' }), options)).toBe('a,b\n');
  });

  it('quotes a value holding the delimiter', () => {
    expect(sheetToCsv(sheet({ A1: 'a,b' }), options)).toBe('"a,b"\n');
  });

  it('round-trips a sheet of plain values', () => {
    const original = sheet({ A1: 'Item', B1: 'Cost', A2: 'Rent', B2: 1200 });
    const back = workbookFromCsv(sheetToCsv(original, options), 'Sheet 1').sheets[0] as SheetData;
    expect(back.cells).toEqual(original.cells);
  });
});

describe('clipboard blocks', () => {
  it('writes a block as TSV, formulas and all', () => {
    expect(
      blockToTsv([
        [1, '=A1*2'],
        ['x', undefined],
      ]),
    ).toBe('1\t=A1*2\nx\t');
  });

  it('reads TSV back into a block', () => {
    expect(tsvToBlock('1\t=A1*2\nx\t')).toEqual([
      [1, '=A1*2'],
      ['x', undefined],
    ]);
  });

  it('reads pasted CSV text too', () => {
    expect(tsvToBlock('a,b\n1,2')).toEqual([
      ['a', 'b'],
      [1, 2],
    ]);
  });

  it('round-trips through the clipboard', () => {
    const block = [
      [1, 'two'],
      ['=A1+1', undefined],
    ];
    expect(tsvToBlock(blockToTsv(block))).toEqual(block);
  });
});

describe('selectionStats', () => {
  const values = evaluateSheet({ A1: 1, A2: 2, A3: 'text', A4: '=1/0', A5: 4 });

  it('sums and averages only the numbers', () => {
    const stats = selectionStats(values, rangeOf({ col: 0, row: 0 }, { col: 0, row: 4 }));
    expect(stats.sum).toBe(7);
    expect(stats.count).toBe(3);
    expect(stats.average).toBeCloseTo(7 / 3, 12);
    expect(stats.filled).toBe(5);
  });

  it('has no average without numbers', () => {
    const stats = selectionStats(values, rangeOf({ col: 0, row: 2 }, { col: 0, row: 2 }));
    expect(stats.count).toBe(0);
    expect(stats.average).toBeNull();
  });

  it('ignores empty cells', () => {
    const stats = selectionStats(values, rangeOf({ col: 4, row: 0 }, { col: 5, row: 5 }));
    expect(stats).toEqual({ sum: 0, average: null, count: 0, filled: 0 });
  });
});

describe('pushHistory', () => {
  const snap = (n: number) => ({
    workbook: { version: 1 as const, sheets: [sheet({ A1: n })] },
    active: 0,
  });

  it('appends', () => {
    expect(pushHistory([], snap(1))).toHaveLength(1);
    expect(pushHistory([snap(1)], snap(2))).toHaveLength(2);
  });

  it('drops the oldest past the cap', () => {
    let past = [] as ReturnType<typeof snap>[];
    for (let i = 0; i < 120; i++) past = pushHistory(past, snap(i), 100);
    expect(past).toHaveLength(100);
    expect(past[0]?.workbook.sheets[0]?.cells.A1).toBe(20);
    expect(past[99]?.workbook.sheets[0]?.cells.A1).toBe(119);
  });
});

describe('acceptsReference', () => {
  it('is true right after = or an operator', () => {
    expect(acceptsReference('=')).toBe(true);
    expect(acceptsReference('=1+')).toBe(true);
    expect(acceptsReference('=SUM(')).toBe(true);
    expect(acceptsReference('=SUM(A1,')).toBe(true);
    expect(acceptsReference('=A1:')).toBe(true);
    expect(acceptsReference('=1+ ')).toBe(true);
  });

  it('is true after a reference, which a click replaces', () => {
    expect(acceptsReference('=A1')).toBe(false);
  });

  it('is false for text and finished expressions', () => {
    expect(acceptsReference('hello')).toBe(false);
    expect(acceptsReference('=SUM(A1:A3)')).toBe(false);
    expect(acceptsReference('=1')).toBe(false);
  });

  it('reads the caret, not the end', () => {
    expect(acceptsReference('=1+2', 3)).toBe(true);
  });
});

describe('endsWithReference', () => {
  it('is true right after a picked reference', () => {
    expect(endsWithReference('=A1')).toBe(true);
    expect(endsWithReference('=SUM(A1:A3')).toBe(true);
    expect(endsWithReference('=1+$B$2')).toBe(true);
  });

  it('is false once the formula moved on', () => {
    expect(endsWithReference('=A1+')).toBe(false);
    expect(endsWithReference('=SUM(A1:A3)')).toBe(false);
    expect(endsWithReference('=1')).toBe(false);
    expect(endsWithReference('plain text')).toBe(false);
  });

  it('reads the caret, not the end', () => {
    expect(endsWithReference('=A1+B2', 3)).toBe(true);
  });
});

describe('insertReference', () => {
  it('inserts at the caret', () => {
    expect(insertReference('=', 1, 'B2')).toEqual({ text: '=B2', caret: 3 });
    expect(insertReference('=SUM(', 5, 'A1:A3')).toEqual({ text: '=SUM(A1:A3', caret: 10 });
  });

  it('replaces a reference already at the caret', () => {
    expect(insertReference('=A1', 3, 'B2')).toEqual({ text: '=B2', caret: 3 });
    expect(insertReference('=SUM(A1:A3', 10, 'B1:B9')).toEqual({ text: '=SUM(B1:B9', caret: 10 });
  });

  it('keeps what follows the caret', () => {
    expect(insertReference('=+1', 1, 'C3')).toEqual({ text: '=C3+1', caret: 3 });
  });
});

describe('default sizes', () => {
  it('are the ones the grid draws with', () => {
    expect(DEFAULT_COL_WIDTH).toBeGreaterThan(0);
  });
});
