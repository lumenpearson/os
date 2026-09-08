/**
 * A1 notation. Columns are zero-based internally (A = 0, Z = 25, AA = 26);
 * rows are zero-based too (A1 → row 0). `$` marks an absolute part, which
 * only matters when a formula is shifted (fill, copy/paste).
 */

export interface Coord {
  col: number;
  row: number;
}

export interface CellRef extends Coord {
  absCol: boolean;
  absRow: boolean;
}

export interface RangeRef {
  start: CellRef;
  end: CellRef;
}

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

export function colToLetters(col: number): string {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRef(text: string): CellRef | null {
  const m = REF_RE.exec(text.trim());
  if (!m) return null;
  const row = Number(m[4]) - 1;
  if (row < 0) return null;
  return { col: lettersToCol(m[2] ?? 'A'), row, absCol: m[1] === '$', absRow: m[3] === '$' };
}

export function formatRef(ref: Coord & Partial<Pick<CellRef, 'absCol' | 'absRow'>>): string {
  return `${ref.absCol ? '$' : ''}${colToLetters(ref.col)}${ref.absRow ? '$' : ''}${ref.row + 1}`;
}

/** "A1" for a coordinate, ignoring absolute flags. Used as the cell map key. */
export function coordKey(c: Coord): string {
  return `${colToLetters(c.col)}${c.row + 1}`;
}

export function cellRef(col: number, row: number, absCol = false, absRow = false): CellRef {
  return { col, row, absCol, absRow };
}

export function parseRange(text: string): RangeRef | null {
  const parts = text.split(':');
  if (parts.length !== 2) return null;
  const start = parseRef(parts[0] ?? '');
  const end = parseRef(parts[1] ?? '');
  if (!start || !end) return null;
  return normalizeRange({ start, end });
}

/** A single ref becomes a one-cell range; "A1:B3" a range. */
export function parseRefOrRange(text: string): RangeRef | null {
  const single = parseRef(text);
  if (single) return { start: single, end: { ...single } };
  return parseRange(text);
}

/** Order the corners so start is top-left and end bottom-right. */
export function normalizeRange(r: RangeRef): RangeRef {
  const minCol = Math.min(r.start.col, r.end.col);
  const maxCol = Math.max(r.start.col, r.end.col);
  const minRow = Math.min(r.start.row, r.end.row);
  const maxRow = Math.max(r.start.row, r.end.row);
  const startColAbs = r.start.col <= r.end.col ? r.start.absCol : r.end.absCol;
  const endColAbs = r.start.col <= r.end.col ? r.end.absCol : r.start.absCol;
  const startRowAbs = r.start.row <= r.end.row ? r.start.absRow : r.end.absRow;
  const endRowAbs = r.start.row <= r.end.row ? r.end.absRow : r.start.absRow;
  return {
    start: { col: minCol, row: minRow, absCol: startColAbs, absRow: startRowAbs },
    end: { col: maxCol, row: maxRow, absCol: endColAbs, absRow: endRowAbs },
  };
}

export function rangeOf(a: Coord, b: Coord): RangeRef {
  return normalizeRange({ start: cellRef(a.col, a.row), end: cellRef(b.col, b.row) });
}

export function formatRange(r: RangeRef): string {
  if (r.start.col === r.end.col && r.start.row === r.end.row) return formatRef(r.start);
  return `${formatRef(r.start)}:${formatRef(r.end)}`;
}

export function rangeSize(r: RangeRef): { rows: number; cols: number } {
  return { rows: r.end.row - r.start.row + 1, cols: r.end.col - r.start.col + 1 };
}

/** Row-major list of cell keys inside a range. */
export function expandRange(r: RangeRef): string[] {
  const n = normalizeRange(r);
  const out: string[] = [];
  for (let row = n.start.row; row <= n.end.row; row++) {
    for (let col = n.start.col; col <= n.end.col; col++) out.push(coordKey({ col, row }));
  }
  return out;
}

export function inRange(c: Coord, r: RangeRef): boolean {
  return c.col >= r.start.col && c.col <= r.end.col && c.row >= r.start.row && c.row <= r.end.row;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function sameRange(a: RangeRef, b: RangeRef): boolean {
  return sameCoord(a.start, b.start) && sameCoord(a.end, b.end);
}
