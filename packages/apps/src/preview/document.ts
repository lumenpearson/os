/**
 * Turning bytes into something a viewer can draw: decoding, the CSV table
 * shape, JSON parsing and the readings the status bar shows. The delimited
 * parser is the one Sheets uses — Preview reads the same files, so it reads
 * them the same way.
 */
import { detectDelimiter, parseDelimited } from '../sheets/engine/csv';

/** Text past this is cut; the viewer says so rather than freezing the window. */
export const TEXT_LIMIT = 2_000_000;

/** Rows past this are cut; the table is a preview, not a spreadsheet. */
export const CSV_ROW_LIMIT = 2000;

export function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface TruncatedText {
  text: string;
  /** Characters dropped from the end, or zero. */
  dropped: number;
}

export function limitText(text: string, limit = TEXT_LIMIT): TruncatedText {
  if (text.length <= limit) return { text, dropped: 0 };
  return { text: text.slice(0, limit), dropped: text.length - limit };
}

export interface CsvTable {
  header: string[];
  rows: string[][];
  /** Widest row in the file, so short rows can be padded out. */
  columns: number;
  /** Data rows in the file, before the limit. */
  totalRows: number;
  truncated: boolean;
  delimiter: ',' | ';' | '\t';
}

const EMPTY_TABLE: CsvTable = {
  header: [],
  rows: [],
  columns: 0,
  totalRows: 0,
  truncated: false,
  delimiter: ',',
};

/** First row is the header; the rest are data, padded to a rectangle. */
export function toCsvTable(text: string, limit = CSV_ROW_LIMIT): CsvTable {
  if (text.trim() === '') return EMPTY_TABLE;
  const delimiter = detectDelimiter(text);
  const parsed = parseDelimited(text, delimiter);
  const [header = [], ...body] = parsed;
  const columns = parsed.reduce((widest, row) => Math.max(widest, row.length), 0);
  const rows = body.slice(0, limit).map((row) => pad(row, columns));
  return {
    header: pad(header, columns),
    rows,
    columns,
    totalRows: body.length,
    truncated: body.length > rows.length,
    delimiter,
  };
}

function pad(row: readonly string[], width: number): string[] {
  const out = row.slice();
  while (out.length < width) out.push('');
  return out;
}

export type JsonDocument = { ok: true; value: unknown } | { ok: false; error: string };

export function parseJsonDocument(text: string): JsonDocument {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** `1:05` under an hour, `1:02:03` over it. Unknown durations read as `--:--`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function formatDimensions(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '—';
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/** Fraction of a seek bar a position sits at, safe before metadata arrives. */
export function progressFraction(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, position / duration));
}
