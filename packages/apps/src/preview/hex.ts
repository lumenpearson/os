/**
 * The hex dump model: a file becomes rows of an offset, sixteen bytes and an
 * ASCII gutter. Rows are built on demand for the slice on screen, so a large
 * file costs one row object per visible line rather than one per 16 bytes.
 */

export const BYTES_PER_ROW = 16;

/** Bytes outside this range have no glyph in the gutter. */
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;
const PLACEHOLDER = '.';

export interface HexRow {
  /** Byte offset of the first byte in the row. */
  offset: number;
  /** The offset as fixed-width uppercase hex. */
  label: string;
  /** Two-digit hex for each byte present; the final row may be short. */
  bytes: string[];
  /** One character per byte present, non-printables replaced. */
  ascii: string;
}

export function rowCount(byteLength: number, perRow = BYTES_PER_ROW): number {
  if (byteLength <= 0) return 0;
  return Math.ceil(byteLength / perRow);
}

/** Digits wide enough for the largest offset in the file, at least eight. */
export function offsetWidth(byteLength: number): number {
  return Math.max(8, Math.max(0, byteLength - 1).toString(16).length);
}

export function offsetLabel(offset: number, width = 8): string {
  return offset.toString(16).toUpperCase().padStart(width, '0');
}

export function byteHex(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

export function asciiChar(byte: number): string {
  return byte >= FIRST_PRINTABLE && byte <= LAST_PRINTABLE
    ? String.fromCharCode(byte)
    : PLACEHOLDER;
}

export function hexRow(
  bytes: Uint8Array,
  index: number,
  perRow = BYTES_PER_ROW,
  width = offsetWidth(bytes.length),
): HexRow {
  const offset = index * perRow;
  const end = Math.min(offset + perRow, bytes.length);
  const cells: string[] = [];
  let ascii = '';
  for (let i = offset; i < end; i++) {
    const byte = bytes[i] ?? 0;
    cells.push(byteHex(byte));
    ascii += asciiChar(byte);
  }
  return { offset, label: offsetLabel(offset, width), bytes: cells, ascii };
}

/** `count` rows starting at row `start`, clipped to the end of the file. */
export function hexRows(
  bytes: Uint8Array,
  start: number,
  count: number,
  perRow = BYTES_PER_ROW,
): HexRow[] {
  const total = rowCount(bytes.length, perRow);
  const first = Math.max(0, Math.min(start, total));
  const last = Math.max(first, Math.min(first + count, total));
  const width = offsetWidth(bytes.length);
  const rows: HexRow[] = [];
  for (let i = first; i < last; i++) rows.push(hexRow(bytes, i, perRow, width));
  return rows;
}

/**
 * One row of hex as a single string: pairs separated by a space, a wider gap
 * at the halfway mark, and padding so a short final row keeps the ASCII
 * gutter in its column.
 */
export function formatHexCells(cells: readonly string[], perRow = BYTES_PER_ROW): string {
  const half = Math.floor(perRow / 2);
  let out = '';
  for (let i = 0; i < perRow; i++) {
    if (i > 0) out += i === half ? '  ' : ' ';
    out += cells[i] ?? '  ';
  }
  return out;
}

export interface RowWindow {
  start: number;
  end: number;
}

/**
 * The rows a scroller needs to draw, plus a margin above and below so a fast
 * scroll does not show a gap before the next frame.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = 8,
): RowWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.min(total - 1, Math.floor(Math.max(0, scrollTop) / rowHeight));
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  return { start, end: Math.min(total, first + visible + overscan) };
}
