/**
 * The optional `---` block at the top of a note.
 *
 * It is read as an ordered list of entries rather than a record, so keys this
 * app does not understand survive a read/write cycle unchanged, in their
 * original order, along with blank lines and `#` comments.
 */

/** One line of the block: a `key: value` pair, or a line kept verbatim. */
export type FrontMatterEntry =
  | { kind: 'pair'; key: string; value: string }
  | { kind: 'raw'; text: string };

export interface FrontMatter {
  entries: FrontMatterEntry[];
}

export interface ParsedDocument {
  /** `null` when the file has no front-matter block. */
  front: FrontMatter | null;
  /** The document with the block removed. */
  body: string;
  /** Index of the line `body` starts on, so AST line numbers map to the file. */
  bodyLine: number;
}

const DELIMITER = /^---[ \t\r]*$/;
const PAIR = /^([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*:[ \t]*(.*?)[ \t\r]*$/;
const TRUTHY = new Set(['true', 'yes', 'on', '1']);

/**
 * Split a document into its front matter and its body. A block only counts
 * when the very first line is `---` and a later line closes it; anything else
 * (including an unterminated block) is body text.
 */
export function parseDocument(text: string): ParsedDocument {
  const lines = text.split('\n');
  const first = lines[0];
  if (first === undefined || !DELIMITER.test(first))
    return { front: null, body: text, bodyLine: 0 };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIMITER.test(lines[i] ?? '')) {
      close = i;
      break;
    }
  }
  if (close === -1) return { front: null, body: text, bodyLine: 0 };
  const entries = lines.slice(1, close).map(parseEntry);
  return { front: { entries }, body: lines.slice(close + 1).join('\n'), bodyLine: close + 1 };
}

function parseEntry(line: string): FrontMatterEntry {
  const pair = PAIR.exec(line);
  if (!pair) return { kind: 'raw', text: line.replace(/\r$/, '') };
  return { kind: 'pair', key: pair[1] ?? '', value: unquote(pair[2] ?? '') };
}

function unquote(value: string): string {
  const quote = value.charAt(0);
  if ((quote !== '"' && quote !== "'") || value.length < 2 || !value.endsWith(quote)) return value;
  const inner = value.slice(1, -1);
  return quote === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner;
}

/**
 * Values that would not survive a re-read as themselves get double quotes.
 * A bare colon is left alone: an ISO timestamp is the commonest value in these
 * blocks, and quoting it would rewrite the line on every save.
 */
function quoteIfNeeded(value: string): string {
  const risky =
    value === '' ||
    value !== value.trim() ||
    /^["'#>|&*!%@`[{-]/.test(value) ||
    value.endsWith(':') ||
    /: | #|\n/.test(value);
  if (!risky) return value;
  return `"${value.replace(/([\\"])/g, '\\$1').replace(/\n/g, '\\n')}"`;
}

function renderEntry(entry: FrontMatterEntry): string {
  return entry.kind === 'raw' ? entry.text : `${entry.key}: ${quoteIfNeeded(entry.value)}`;
}

/**
 * Put a document back together. An empty block is dropped rather than written
 * as two bare delimiters.
 */
export function serializeDocument(front: FrontMatter | null, body: string): string {
  if (!front || front.entries.length === 0) return body;
  return `${['---', ...front.entries.map(renderEntry), '---'].join('\n')}\n${body}`;
}

export function getEntry(front: FrontMatter | null, key: string): string | undefined {
  if (!front) return undefined;
  for (const entry of front.entries)
    if (entry.kind === 'pair' && entry.key === key) return entry.value;
  return undefined;
}

/**
 * Set, replace or (with `null`) remove a key. Existing keys keep their
 * position; new ones are appended. The input is not mutated.
 */
export function setEntry(
  front: FrontMatter | null,
  key: string,
  value: string | null,
): FrontMatter {
  const entries = front ? [...front.entries] : [];
  const at = entries.findIndex((e) => e.kind === 'pair' && e.key === key);
  if (value === null) {
    if (at >= 0) entries.splice(at, 1);
    return { entries };
  }
  const next: FrontMatterEntry = { kind: 'pair', key, value };
  if (at >= 0) entries[at] = next;
  else entries.push(next);
  return { entries };
}

export function frontTitle(front: FrontMatter | null): string | undefined {
  const value = getEntry(front, 'title')?.trim();
  return value ? value : undefined;
}

export function frontPinned(front: FrontMatter | null): boolean {
  const value = getEntry(front, 'pinned');
  return value === undefined ? false : TRUTHY.has(value.trim().toLowerCase());
}

/** `created` as epoch milliseconds: an ISO date, or a bare epoch number. */
export function frontCreated(front: FrontMatter | null): number | null {
  const value = getEntry(front, 'created')?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Rewrite one key of a whole document, adding a front-matter block if needed. */
export function withEntry(text: string, key: string, value: string | null): string {
  const doc = parseDocument(text);
  return serializeDocument(setEntry(doc.front, key, value), doc.body);
}

export function formatCreated(at: number): string {
  return new Date(at).toISOString();
}
