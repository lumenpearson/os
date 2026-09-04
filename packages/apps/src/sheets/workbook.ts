/**
 * The `.lsd` document model and every edit the view performs on it.
 * Pure data in, pure data out: the component holds one Workbook in state and
 * replaces it with the result of these functions.
 */

import { parseDelimited, serializeDelimited } from './engine/csv';
import {
  adjustFormula,
  type CellInput,
  type Cells,
  evaluateSheet,
  isFormula,
  shiftFormula,
} from './engine/evaluate';
import { type Align, formatValue, type NumberFormat } from './engine/format';
import {
  type Coord,
  colToLetters,
  coordKey,
  expandRange,
  normalizeRange,
  type RangeRef,
} from './engine/refs';
import { CellError, numberToText, parseNumberText, type Scalar } from './engine/values';

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: Align;
  format?: NumberFormat;
}

export interface SheetData {
  name: string;
  cells: Cells;
  /** Column letter → width in px. */
  columnWidths?: Record<string, number>;
  /** 1-based row number → height in px. */
  rowHeights?: Record<string, number>;
  styles?: Record<string, CellStyle>;
}

export interface Workbook {
  version: 1;
  sheets: SheetData[];
}

export const DEFAULT_COL_WIDTH = 96;
export const DEFAULT_ROW_HEIGHT = 22;
export const MIN_COL_WIDTH = 32;
export const MIN_ROWS = 200;
export const MIN_COLS = 52;
export const MAX_ROWS = 20_000;
export const MAX_COLS = 702;

export function emptySheet(name = 'Sheet 1'): SheetData {
  return { name, cells: {} };
}

export function emptyWorkbook(): Workbook {
  return { version: 1, sheets: [emptySheet()] };
}

// ── reading and writing ───────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const ALIGNS: readonly Align[] = ['left', 'center', 'right'];
const FORMATS: readonly NumberFormat[] = ['general', 'number', 'percent', 'currency', 'date'];

function readStyle(v: unknown): CellStyle | null {
  if (!isRecord(v)) return null;
  const style: CellStyle = {};
  if (v.bold === true) style.bold = true;
  if (v.italic === true) style.italic = true;
  const align = ALIGNS.find((a) => a === v.align);
  if (align) style.align = align;
  const format = FORMATS.find((f) => f === v.format);
  if (format && format !== 'general') style.format = format;
  return Object.keys(style).length > 0 ? style : null;
}

function readNumberMap(v: unknown, min: number): Record<string, number> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'number' && Number.isFinite(value))
      out[key] = Math.max(min, Math.round(value));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readSheet(v: unknown, index: number): SheetData {
  const source = isRecord(v) ? v : {};
  const sheet: SheetData = {
    name:
      typeof source.name === 'string' && source.name.trim() ? source.name : `Sheet ${index + 1}`,
    cells: {},
  };
  if (isRecord(source.cells)) {
    for (const [key, value] of Object.entries(source.cells)) {
      const ref = coordKeyOf(key);
      if (!ref) continue;
      if (typeof value === 'string') {
        if (value !== '') sheet.cells[ref] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        sheet.cells[ref] = value;
      } else if (typeof value === 'boolean') {
        sheet.cells[ref] = value ? 'TRUE' : 'FALSE';
      }
    }
  }
  const widths = readNumberMap(source.columnWidths, MIN_COL_WIDTH);
  if (widths) sheet.columnWidths = widths;
  const heights = readNumberMap(source.rowHeights, 14);
  if (heights) sheet.rowHeights = heights;
  if (isRecord(source.styles)) {
    const styles: Record<string, CellStyle> = {};
    for (const [key, value] of Object.entries(source.styles)) {
      const ref = coordKeyOf(key);
      const style = readStyle(value);
      if (ref && style) styles[ref] = style;
    }
    if (Object.keys(styles).length > 0) sheet.styles = styles;
  }
  return sheet;
}

/** Normalise a key written by hand ("a1", "$A$1") to the canonical "A1". */
function coordKeyOf(key: string): string | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(key.trim());
  if (!m) return null;
  const row = Number(m[2]);
  if (row < 1) return null;
  return `${(m[1] ?? '').toUpperCase()}${row}`;
}

/** Read a parsed `.lsd` document, filling in anything missing. */
export function parseWorkbook(data: unknown): Workbook {
  const source = isRecord(data) ? data : {};
  const list = Array.isArray(source.sheets) ? source.sheets : [];
  const sheets = list.map(readSheet);
  return { version: 1, sheets: sheets.length > 0 ? sheets : [emptySheet()] };
}

/** The JSON to write to a `.lsd` file: no empty maps, sorted keys. */
export function serializeWorkbook(workbook: Workbook): Workbook {
  return {
    version: 1,
    sheets: workbook.sheets.map((sheet) => {
      const out: SheetData = { name: sheet.name, cells: sortKeys(sheet.cells) };
      if (sheet.columnWidths && Object.keys(sheet.columnWidths).length > 0)
        out.columnWidths = sheet.columnWidths;
      if (sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0)
        out.rowHeights = sheet.rowHeights;
      if (sheet.styles && Object.keys(sheet.styles).length > 0) out.styles = sortKeys(sheet.styles);
      return out;
    }),
  };
}

function sortKeys<T>(map: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(map).sort(compareRefKeys)) {
    const value = map[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function compareRefKeys(a: string, b: string): number {
  const pa = coordOf(a);
  const pb = coordOf(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa.row - pb.row || pa.col - pb.col;
}

/** The coordinate a canonical key names, or null. */
export function coordOf(key: string): Coord | null {
  const m = /^([A-Z]{1,3})(\d+)$/.exec(key);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1] ?? '') col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

// ── typed input ───────────────────────────────────────────────────────────

export interface ParsedInput {
  /** null clears the cell. */
  value: CellInput | null;
  /** A format the typed text implies (typing "50%" sets the percent format). */
  format?: NumberFormat;
}

/**
 * What typing `text` into a cell stores. Numbers become numbers so they add
 * up; anything whose text would not survive the round trip stays text.
 */
export function parseCellInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null };
  if (trimmed.length > 1 && trimmed.startsWith('=')) return { value: trimmed };
  const grouped = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed);
  const percent = trimmed.endsWith('%');
  const n = parseNumberText(trimmed);
  if (n !== null) {
    if (percent) return { value: n, format: 'percent' };
    if (grouped) return { value: n, format: 'number' };
    if (numberToText(n) === trimmed || `+${numberToText(n)}` === trimmed) return { value: n };
  }
  return { value: text };
}

/** The text the formula bar shows for a cell. */
export function cellText(input: CellInput | undefined): string {
  if (input === undefined) return '';
  return typeof input === 'number' ? numberToText(input) : input;
}

// ── sheet access ──────────────────────────────────────────────────────────

export function styleAt(sheet: SheetData, key: string): CellStyle | undefined {
  return sheet.styles?.[key];
}

export function columnWidth(sheet: SheetData, col: number): number {
  return sheet.columnWidths?.[colToLetters(col)] ?? DEFAULT_COL_WIDTH;
}

export function rowHeight(sheet: SheetData, row: number): number {
  return sheet.rowHeights?.[String(row + 1)] ?? DEFAULT_ROW_HEIGHT;
}

/** One past the last row and column that hold anything. */
export function usedBounds(sheet: SheetData): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  const keys = [...Object.keys(sheet.cells), ...Object.keys(sheet.styles ?? {})];
  for (const key of keys) {
    const c = coordOf(key);
    if (!c) continue;
    rows = Math.max(rows, c.row + 1);
    cols = Math.max(cols, c.col + 1);
  }
  for (const letter of Object.keys(sheet.columnWidths ?? {})) {
    const c = coordOf(`${letter}1`);
    if (c) cols = Math.max(cols, c.col + 1);
  }
  for (const row of Object.keys(sheet.rowHeights ?? {})) {
    const n = Number(row);
    if (Number.isFinite(n)) rows = Math.max(rows, n);
  }
  return { rows, cols };
}

/** The grid size to render: the used area plus room to keep going. */
export function gridSize(sheet: SheetData): { rows: number; cols: number } {
  const used = usedBounds(sheet);
  return {
    rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, used.rows + 40)),
    cols: Math.min(MAX_COLS, Math.max(MIN_COLS, used.cols + 8)),
  };
}

// ── edits ─────────────────────────────────────────────────────────────────

function withCells(sheet: SheetData, cells: Cells): SheetData {
  return { ...sheet, cells };
}

/** Set or clear one cell. */
export function setCell(sheet: SheetData, key: string, value: CellInput | null): SheetData {
  const cells = { ...sheet.cells };
  if (value === null || value === '') delete cells[key];
  else cells[key] = value;
  return withCells(sheet, cells);
}

export function setCells(sheet: SheetData, entries: Array<[string, CellInput | null]>): SheetData {
  const cells = { ...sheet.cells };
  for (const [key, value] of entries) {
    if (value === null || value === '') delete cells[key];
    else cells[key] = value;
  }
  return withCells(sheet, cells);
}

/** Clear the contents of a range, keeping styles. */
export function clearRange(sheet: SheetData, range: RangeRef): SheetData {
  const cells = { ...sheet.cells };
  for (const key of expandRange(range)) delete cells[key];
  return withCells(sheet, cells);
}

export function setStyle(sheet: SheetData, keys: string[], patch: CellStyle): SheetData {
  const styles = { ...(sheet.styles ?? {}) };
  for (const key of keys) {
    const next: CellStyle = { ...styles[key], ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === false || v === 'general') delete next[k as keyof CellStyle];
    }
    if (Object.keys(next).length === 0) delete styles[key];
    else styles[key] = next;
  }
  const out: SheetData = { ...sheet };
  if (Object.keys(styles).length > 0) out.styles = styles;
  else delete out.styles;
  return out;
}

export function setColumnWidth(sheet: SheetData, col: number, width: number): SheetData {
  const columnWidths = { ...(sheet.columnWidths ?? {}) };
  columnWidths[colToLetters(col)] = Math.max(MIN_COL_WIDTH, Math.round(width));
  return { ...sheet, columnWidths };
}

export function setRowHeight(sheet: SheetData, row: number, height: number): SheetData {
  const rowHeights = { ...(sheet.rowHeights ?? {}) };
  rowHeights[String(row + 1)] = Math.max(14, Math.round(height));
  return { ...sheet, rowHeights };
}

/** Every cell of a range, laid out as rows for the clipboard. */
export function readRange(sheet: SheetData, range: RangeRef): Array<Array<CellInput | undefined>> {
  const r = normalizeRange(range);
  const rows: Array<Array<CellInput | undefined>> = [];
  for (let row = r.start.row; row <= r.end.row; row++) {
    const line: Array<CellInput | undefined> = [];
    for (let col = r.start.col; col <= r.end.col; col++)
      line.push(sheet.cells[coordKey({ col, row })]);
    rows.push(line);
  }
  return rows;
}

/**
 * Write a block at a target cell, shifting the relative references of every
 * formula by how far the block moved.
 */
export function writeBlock(
  sheet: SheetData,
  target: Coord,
  block: Array<Array<CellInput | undefined>>,
  origin?: Coord,
): SheetData {
  const dRow = origin ? target.row - origin.row : 0;
  const dCol = origin ? target.col - origin.col : 0;
  const entries: Array<[string, CellInput | null]> = [];
  block.forEach((line, r) => {
    line.forEach((value, c) => {
      const key = coordKey({ col: target.col + c, row: target.row + r });
      if (value === undefined) entries.push([key, null]);
      else entries.push([key, isFormula(value) ? shiftFormula(value, dRow, dCol) : value]);
    });
  });
  return setCells(sheet, entries);
}

/**
 * Fill a range from its first row or column, the way dragging the fill handle
 * does: formulas shift, everything else repeats.
 */
export function fillRange(sheet: SheetData, source: RangeRef, target: RangeRef): SheetData {
  const s = normalizeRange(source);
  const t = normalizeRange(target);
  const height = s.end.row - s.start.row + 1;
  const width = s.end.col - s.start.col + 1;
  const entries: Array<[string, CellInput | null]> = [];
  for (let row = t.start.row; row <= t.end.row; row++) {
    for (let col = t.start.col; col <= t.end.col; col++) {
      if (row >= s.start.row && row <= s.end.row && col >= s.start.col && col <= s.end.col)
        continue;
      const srcRow = s.start.row + mod(row - s.start.row, height);
      const srcCol = s.start.col + mod(col - s.start.col, width);
      const value = sheet.cells[coordKey({ col: srcCol, row: srcRow })];
      const key = coordKey({ col, row });
      if (value === undefined) entries.push([key, null]);
      else
        entries.push([
          key,
          isFormula(value) ? shiftFormula(value, row - srcRow, col - srcCol) : value,
        ]);
    }
  }
  const filled = setCells(sheet, entries);
  return copyStylesOver(filled, s, t);
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function copyStylesOver(sheet: SheetData, source: RangeRef, target: RangeRef): SheetData {
  if (!sheet.styles) return sheet;
  const height = source.end.row - source.start.row + 1;
  const width = source.end.col - source.start.col + 1;
  const styles = { ...sheet.styles };
  let changed = false;
  for (let row = target.start.row; row <= target.end.row; row++) {
    for (let col = target.start.col; col <= target.end.col; col++) {
      if (
        row >= source.start.row &&
        row <= source.end.row &&
        col >= source.start.col &&
        col <= source.end.col
      )
        continue;
      const from =
        styles[
          coordKey({
            col: source.start.col + mod(col - source.start.col, width),
            row: source.start.row + mod(row - source.start.row, height),
          })
        ];
      const key = coordKey({ col, row });
      if (from) {
        styles[key] = { ...from };
        changed = true;
      } else if (styles[key]) {
        delete styles[key];
        changed = true;
      }
    }
  }
  return changed ? { ...sheet, styles } : sheet;
}

// ── rows and columns ──────────────────────────────────────────────────────

type Axis = 'row' | 'col';

function moveKeyed<T>(
  map: Record<string, T> | undefined,
  axis: Axis,
  at: number,
  delta: number,
): Record<string, T> | undefined {
  if (!map) return undefined;
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    const c = coordOf(key);
    if (!c) continue;
    const index = axis === 'row' ? c.row : c.col;
    if (delta < 0 && index >= at && index < at - delta) continue;
    const moved = index >= at ? index + delta : index;
    if (moved < 0) continue;
    out[coordKey(axis === 'row' ? { col: c.col, row: moved } : { col: moved, row: c.row })] = value;
  }
  return out;
}

function moveSizes(
  map: Record<string, number> | undefined,
  at: number,
  delta: number,
  toIndex: (key: string) => number | null,
  toKey: (index: number) => string,
): Record<string, number> | undefined {
  if (!map) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    const index = toIndex(key);
    if (index === null) continue;
    if (delta < 0 && index >= at && index < at - delta) continue;
    const moved = index >= at ? index + delta : index;
    if (moved < 0) continue;
    out[toKey(moved)] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rewriteFormulas(
  cells: Cells,
  axis: Axis,
  kind: 'insert' | 'delete',
  at: number,
  count: number,
): Cells {
  const out: Cells = {};
  for (const [key, value] of Object.entries(cells)) {
    out[key] = isFormula(value) ? adjustFormula(value, { axis, kind, at, count }) : value;
  }
  return out;
}

function structural(
  sheet: SheetData,
  axis: Axis,
  kind: 'insert' | 'delete',
  at: number,
  count: number,
): SheetData {
  const delta = kind === 'insert' ? count : -count;
  const moved = moveKeyed(sheet.cells, axis, at, delta) ?? {};
  const out: SheetData = { ...sheet, cells: rewriteFormulas(moved, axis, kind, at, count) };
  const styles = moveKeyed(sheet.styles, axis, at, delta);
  if (styles && Object.keys(styles).length > 0) out.styles = styles;
  else delete out.styles;
  if (axis === 'col') {
    const widths = moveSizes(
      sheet.columnWidths,
      at,
      delta,
      (key) => coordOf(`${key}1`)?.col ?? null,
      (index) => colToLetters(index),
    );
    if (widths) out.columnWidths = widths;
    else delete out.columnWidths;
  } else {
    const heights = moveSizes(
      sheet.rowHeights,
      at,
      delta,
      (key) => (Number.isFinite(Number(key)) ? Number(key) - 1 : null),
      (index) => String(index + 1),
    );
    if (heights) out.rowHeights = heights;
    else delete out.rowHeights;
  }
  return out;
}

export function insertRows(sheet: SheetData, at: number, count = 1): SheetData {
  return structural(sheet, 'row', 'insert', at, count);
}

export function deleteRows(sheet: SheetData, at: number, count = 1): SheetData {
  return structural(sheet, 'row', 'delete', at, count);
}

export function insertColumns(sheet: SheetData, at: number, count = 1): SheetData {
  return structural(sheet, 'col', 'insert', at, count);
}

export function deleteColumns(sheet: SheetData, at: number, count = 1): SheetData {
  return structural(sheet, 'col', 'delete', at, count);
}

// ── sheets in a workbook ──────────────────────────────────────────────────

/** A name not already used, "Sheet 2", "Sheet 3"… or "Copy 2" for a clash. */
export function freeSheetName(workbook: Workbook, base = 'Sheet'): string {
  const taken = new Set(workbook.sheets.map((s) => s.name.toLowerCase()));
  for (let i = workbook.sheets.length + 1; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function addSheet(workbook: Workbook, name = freeSheetName(workbook)): Workbook {
  return { ...workbook, sheets: [...workbook.sheets, emptySheet(name)] };
}

export function removeSheet(workbook: Workbook, index: number): Workbook {
  if (workbook.sheets.length <= 1) return workbook;
  return { ...workbook, sheets: workbook.sheets.filter((_, i) => i !== index) };
}

export function renameSheet(workbook: Workbook, index: number, name: string): Workbook {
  const trimmed = name.trim();
  if (!trimmed) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((s, i) => (i === index ? { ...s, name: trimmed } : s)),
  };
}

export function replaceSheet(workbook: Workbook, index: number, sheet: SheetData): Workbook {
  return { ...workbook, sheets: workbook.sheets.map((s, i) => (i === index ? sheet : s)) };
}

// ── CSV ───────────────────────────────────────────────────────────────────

/** A sheet from parsed CSV/TSV rows. Numbers become numbers, "=" stays a formula. */
export function sheetFromRows(rows: string[][], name: string): SheetData {
  const sheet = emptySheet(name);
  rows.forEach((line, row) => {
    line.forEach((text, col) => {
      const { value, format } = parseCellInput(text);
      if (value === null) return;
      const key = coordKey({ col, row });
      sheet.cells[key] = value;
      if (format) {
        sheet.styles = sheet.styles ?? {};
        sheet.styles[key] = { format };
      }
    });
  });
  return sheet;
}

export function workbookFromCsv(
  text: string,
  name: string,
  delimiter?: ',' | ';' | '\t',
): Workbook {
  return { version: 1, sheets: [sheetFromRows(parseDelimited(text, delimiter), name)] };
}

export interface RenderOptions {
  locale?: string;
  currency?: string;
  now?: () => Date;
}

/**
 * The sheet as rows of display text: formulas become their computed value, so
 * a CSV export holds numbers rather than "=SUM(...)".
 */
export function sheetToRows(sheet: SheetData, options: RenderOptions = {}): string[][] {
  const { rows, cols } = usedBounds(sheet);
  const values = evaluateSheet(sheet.cells, options);
  const out: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: string[] = [];
    for (let col = 0; col < cols; col++) {
      const key = coordKey({ col, row });
      const value = values.get(key)?.value ?? null;
      line.push(formatValue(value, styleAt(sheet, key)?.format ?? 'general', options));
    }
    out.push(line);
  }
  return out;
}

export function sheetToCsv(
  sheet: SheetData,
  options: RenderOptions = {},
  delimiter: ',' | '\t' = ',',
): string {
  return serializeDelimited(sheetToRows(sheet, options), delimiter);
}

/** A block of cells as TSV, for the system clipboard. */
export function blockToTsv(block: Array<Array<CellInput | undefined>>): string {
  return serializeDelimited(
    block.map((line) => line.map((v) => cellText(v))),
    '\t',
  ).replace(/\n$/, '');
}

export function tsvToBlock(text: string): Array<Array<CellInput | undefined>> {
  return parseDelimited(text, text.includes('\t') ? '\t' : ',').map((line) =>
    line.map((t) => {
      const { value } = parseCellInput(t);
      return value === null ? undefined : value;
    }),
  );
}

// ── selection summary ─────────────────────────────────────────────────────

export interface SelectionStats {
  sum: number;
  average: number | null;
  count: number;
  /** Cells that hold anything at all. */
  filled: number;
}

/** Sum, average and count of the numeric cells of a range. */
export function selectionStats(
  values: Map<string, { value: Scalar }>,
  range: RangeRef,
): SelectionStats {
  let sum = 0;
  let count = 0;
  let filled = 0;
  for (const key of expandRange(range)) {
    const value = values.get(key)?.value;
    if (value === undefined || value === null) continue;
    filled++;
    if (typeof value === 'number') {
      sum += value;
      count++;
    } else if (typeof value === 'boolean' || value instanceof CellError) {
      // not a number: counted as filled only
    }
  }
  return { sum, average: count > 0 ? sum / count : null, count, filled };
}

// ── undo history ──────────────────────────────────────────────────────────

export interface Snapshot {
  workbook: Workbook;
  active: number;
}

export const HISTORY_LIMIT = 100;

/** Push a snapshot, dropping the oldest past the cap. */
export function pushHistory(past: Snapshot[], entry: Snapshot, limit = HISTORY_LIMIT): Snapshot[] {
  const next = [...past, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

// ── editing helpers ───────────────────────────────────────────────────────

/**
 * True when clicking a cell while editing should insert its reference rather
 * than commit: the text is a formula whose caret sits after an operator,
 * an opening parenthesis, a comma, or the leading "=".
 */
export function acceptsReference(text: string, caret = text.length): boolean {
  if (!text.startsWith('=')) return false;
  const before = text.slice(0, caret).trimEnd();
  if (before === '=') return true;
  return /[+\-*/^&=<>(,:%]$/.test(before);
}

/**
 * True when the text just before the caret is a reference the next click
 * should replace, which is how a spreadsheet stays in "point" mode after one
 * cell has been picked.
 */
export function endsWithReference(text: string, caret = text.length): boolean {
  if (!text.startsWith('=')) return false;
  return /\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/.test(text.slice(0, caret));
}

/** Insert a reference at the caret, replacing a reference already sitting there. */
export function insertReference(
  text: string,
  caret: number,
  ref: string,
): { text: string; caret: number } {
  const head = text
    .slice(0, caret)
    .replace(/\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/, '');
  const tail = text.slice(caret);
  return { text: head + ref + tail, caret: head.length + ref.length };
}
