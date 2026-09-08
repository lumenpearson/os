/**
 * What the view keeps: the level and source predicates, the search box, and
 * the ranges a match covers so a row can mark them. The search accepts plain
 * text or a `/pattern/flags` regular expression; a pattern that will not
 * compile comes back as an error to show, never as a throw.
 */
import type { LogLevel, LogRecord } from './types';

export type Query =
  | { kind: 'empty' }
  | { kind: 'text'; needle: string }
  | { kind: 'regex'; regex: RegExp; source: string; flags: string };

export const EMPTY_QUERY: Query = { kind: 'empty' };

export interface ParsedQuery {
  query: Query;
  /** Why the pattern was rejected; null when the query is usable. */
  error: string | null;
}

/** Every flag a regular expression literal may carry. */
const REGEX_FLAGS = 'dgimsuvy';
const DELIMITED = /^\/(.*)\/([a-zA-Z]*)$/s;

function tidyRegexError(message: string): string {
  // "Invalid regular expression: /(/: Unterminated group" says the pattern
  // twice; the search box already shows it.
  const stripped = message.replace(/^Invalid regular expression:[^:]*:\s*/, '');
  return stripped || message;
}

const asText = (input: string): ParsedQuery => ({
  query: { kind: 'text', needle: input },
  error: null,
});

/**
 * A search as typed. Only `/pattern/flags` is a regular expression: text that
 * merely starts with a slash is a path, and a trailing segment that is not a
 * run of flags (`/home/user`) is part of the text being searched for. A
 * pattern that looks like one and will not compile reports why.
 */
export function parseQuery(input: string): ParsedQuery {
  if (input === '') return { query: EMPTY_QUERY, error: null };
  const delimited = DELIMITED.exec(input);
  if (!delimited) return asText(input);

  const source = delimited[1] ?? '';
  const flags = delimited[2] ?? '';
  if (source === '' || [...flags].some((flag) => !REGEX_FLAGS.includes(flag))) return asText(input);

  // The scan drives lastIndex itself, so the sticky and global flags are the
  // app's to set, not the user's.
  const scanFlags = `${[...new Set(flags)].filter((f) => f !== 'g' && f !== 'y').join('')}g`;
  try {
    const regex = new RegExp(source, scanFlags);
    return { query: { kind: 'regex', regex, source, flags }, error: null };
  } catch (error) {
    return {
      query: EMPTY_QUERY,
      error: tidyRegexError(error instanceof Error ? error.message : String(error)),
    };
  }
}

export interface MatchRange {
  start: number;
  end: number;
}

/** How many ranges one line reports; a row only has so much to mark. */
const MAX_RANGES = 100;

/** Where the query hits in a line, left to right, never overlapping. */
export function matchRanges(text: string, query: Query): MatchRange[] {
  if (query.kind === 'empty' || text === '') return [];
  const ranges: MatchRange[] = [];
  if (query.kind === 'text') {
    const needle = query.needle.toLowerCase();
    if (needle === '') return [];
    const haystack = text.toLowerCase();
    let from = 0;
    while (ranges.length < MAX_RANGES) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
    return ranges;
  }
  const { regex } = query;
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match !== null && ranges.length < MAX_RANGES) {
    // A pattern that can match nothing would otherwise stand still.
    if (match[0].length === 0) regex.lastIndex += 1;
    else ranges.push({ start: match.index, end: match.index + match[0].length });
    match = regex.exec(text);
  }
  regex.lastIndex = 0;
  return ranges;
}

/** Does the query hit this line at all? */
export function queryMatches(text: string, query: Query): boolean {
  if (query.kind === 'empty') return true;
  if (query.kind === 'text') {
    return query.needle === '' || text.toLowerCase().includes(query.needle.toLowerCase());
  }
  query.regex.lastIndex = 0;
  const hit = query.regex.test(text);
  query.regex.lastIndex = 0;
  return hit;
}

export interface TextPiece {
  text: string;
  /** Part of a match, so the row marks it. */
  hit: boolean;
}

/** A line cut into matched and unmatched pieces, in order, nothing lost. */
export function splitRanges(text: string, ranges: readonly MatchRange[]): TextPiece[] {
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const range of ranges) {
    const start = Math.max(at, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));
    if (end === start) continue;
    if (start > at) pieces.push({ text: text.slice(at, start), hit: false });
    pieces.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), hit: false });
  return pieces;
}

export interface FilterState {
  levels: ReadonlySet<LogLevel>;
  /** null means every source. */
  sources: ReadonlySet<string> | null;
  /** The search box as typed. */
  search: string;
}

export interface CompiledFilter {
  predicate: (record: LogRecord) => boolean;
  query: Query;
  /** The search error to show under the box, if any. */
  error: string | null;
}

/**
 * One pass over the state into one predicate. A search that will not compile
 * keeps the level and source filters working and reports the error.
 */
export function compileFilter(state: FilterState): CompiledFilter {
  const { query, error } = parseQuery(state.search);
  const { levels, sources } = state;
  const predicate = (record: LogRecord): boolean => {
    if (!levels.has(record.level)) return false;
    if (sources !== null && !sources.has(record.source)) return false;
    if (query.kind === 'empty') return true;
    return queryMatches(record.message, query) || queryMatches(record.source, query);
  };
  return { predicate, query, error };
}

/** Every source present, in the order the filter lists them. */
export function collectSources(records: Iterable<LogRecord>): string[] {
  const seen = new Set<string>();
  for (const record of records) seen.add(record.source);
  return [...seen].sort((a, b) => a.localeCompare(b));
}
