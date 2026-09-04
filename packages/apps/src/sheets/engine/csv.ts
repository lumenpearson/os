/** CSV/TSV reading and writing (RFC 4180: quotes, doubled quotes, newlines in fields). */

export type Delimiter = ',' | ';' | '\t';

/** Pick the delimiter that splits the first lines most consistently. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/, 10).filter((l) => l.length > 0);
  if (sample.length === 0) return ',';
  const candidates: Delimiter[] = ['\t', ',', ';'];
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((l) => countOutsideQuotes(l, d));
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const score = min === 0 ? 0 : min === max ? min * 2 : min;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) n++;
  }
  return n;
}

export function parseDelimited(
  text: string,
  delimiter: Delimiter = detectDelimiter(text),
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && src.charAt(i + 1) === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function needsQuotes(field: string, delimiter: string): boolean {
  return (
    field.includes(delimiter) ||
    field.includes('"') ||
    /[\r\n]/.test(field) ||
    /^\s|\s$/.test(field)
  );
}

export function serializeDelimited(
  rows: readonly (readonly string[])[],
  delimiter: Delimiter = ',',
): string {
  return rows
    .map((row) =>
      row
        .map((f) => (needsQuotes(f, delimiter) ? `"${f.replace(/"/g, '""')}"` : f))
        .join(delimiter),
    )
    .join('\n')
    .concat(rows.length > 0 ? '\n' : '');
}
