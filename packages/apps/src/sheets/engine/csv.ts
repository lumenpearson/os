/** CSV/TSV reading and writing (RFC 4180: quotes, doubled quotes, newlines in fields). */

export type Delimiter = ',' | ';' | '\t';

/**
 * Pick the delimiter. Delimiters are counted with the quote state carried
 * across newlines, so a quoted field holding a newline or a delimiter does not
 * skew the result. One that splits every row into the same number of fields
 * beats one that does not; a comma wins a tie.
 */
export function detectDelimiter(text: string): Delimiter {
  const candidates: Delimiter[] = [',', '\t', ';'];
  let best: Delimiter = ',';
  let bestScore = 0;
  for (const d of candidates) {
    const counts = countPerRow(text, d);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const score = min > 0 && min === max ? total * 2 + 1 : total;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** How many delimiters each row holds, ignoring those inside quoted fields. */
function countPerRow(text: string, delimiter: string): number[] {
  const rows: number[] = [];
  let count = 0;
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    started = true;
    if (ch === '"') {
      if (quoted && text.charAt(i + 1) === '"') i++;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (ch === delimiter) count++;
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
      rows.push(count);
      count = 0;
      started = false;
    }
  }
  if (started) rows.push(count);
  return rows;
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
