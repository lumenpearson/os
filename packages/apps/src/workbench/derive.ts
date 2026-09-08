/**
 * What each pane shows, derived from its stored state.
 *
 * The panes are thin on purpose: everything on screen — the output text, the
 * note beside a label, the message under a field — comes out of one of these
 * functions, so the Copy Output command and the pane can never disagree about
 * what the output is.
 */

import { type Coded, decodeText, encodeText } from './encode';
import { describeInstant, formatSince, parseTimeInput, type TimeView, UTC } from './epoch';
import { formatJson, parseJson, queryJson, renderMatches, type WriteOptions } from './json';
import {
  capNote,
  DEFAULT_LIMITS,
  findMatches,
  type RegexMatch,
  replaceMatches,
  type ScanOptions,
} from './regex';
import type { DiffState, EncodeState, JsonState, RegexState, TimeState } from './storage';
import { alignRuns, type DiffRow, diffLines, toUnified } from './textdiff';

// ── JSON ──────────────────────────────────────────────────────────────────

export interface JsonResult {
  output: string;
  /** Under the document field. */
  parseError: string | null;
  /** Under the path field. */
  queryError: string | null;
  /** Beside the output label. */
  note: string | null;
}

const NO_JSON: JsonResult = { output: '', parseError: null, queryError: null, note: null };

export function runJson(state: JsonState): JsonResult {
  if (state.input.trim() === '') return NO_JSON;
  const write: WriteOptions = { indent: state.indent, sortKeys: state.sortKeys };

  const parsed = parseJson(state.input);
  if (!parsed.ok) {
    const { line, column, message } = parsed.error;
    return { ...NO_JSON, parseError: `Line ${line}, column ${column}: ${message}` };
  }

  const query = state.query.trim();
  if (query === '') {
    const formatted = formatJson(state.input, write);
    return { ...NO_JSON, output: formatted.ok ? formatted.text : '' };
  }

  const found = queryJson(parsed.value, query);
  if (!found.ok)
    return { ...NO_JSON, queryError: `Column ${found.error.column}: ${found.error.message}` };
  const first = found.matches[0];
  return {
    ...NO_JSON,
    output: renderMatches(found.matches, write),
    note: found.matches.length === 1 && first ? first.path : `${found.matches.length} matches`,
  };
}

// ── regex ─────────────────────────────────────────────────────────────────

export interface RegexResult {
  matches: RegexMatch[];
  /** Under the pattern field. */
  error: string | null;
  /** Beside the Matches label. */
  note: string | null;
  /** The subject with every match replaced. */
  output: string;
}

const NO_REGEX: RegexResult = { matches: [], error: null, note: null, output: '' };

export function runRegex(state: RegexState, options: ScanOptions = {}): RegexResult {
  if (state.pattern === '') return NO_REGEX;
  const search = findMatches(state.pattern, state.flags, state.subject, options);
  if (!search.ok) return { ...NO_REGEX, error: search.error };

  const { run } = search;
  const replaced = replaceMatches(
    state.pattern,
    state.flags,
    state.subject,
    state.replacement,
    options,
  );
  const count = run.matches.length;
  const cap = capNote(run, { ...DEFAULT_LIMITS, ...options.limits });
  const plural = count === 1 ? '1 match' : `${count} matches`;
  return {
    matches: run.matches,
    error: null,
    note: cap ? `${plural} · ${cap}` : run.single ? `${plural} · no g flag` : plural,
    output: replaced.ok ? replaced.run.text : '',
  };
}

// ── diff ──────────────────────────────────────────────────────────────────

export interface DiffResult {
  rows: DiffRow[];
  output: string;
  note: string | null;
  capped: boolean;
}

export function runDiff(state: DiffState): DiffResult {
  if (state.left === '' && state.right === '')
    return { rows: [], output: '', note: null, capped: false };
  const diff = diffLines(state.left, state.right);
  const note =
    diff.added === 0 && diff.removed === 0 ? 'identical' : `+${diff.added} −${diff.removed}`;
  return { rows: alignRuns(diff.runs), output: toUnified(diff.runs), note, capped: diff.capped };
}

// ── encode ────────────────────────────────────────────────────────────────

export interface EncodeResult {
  output: string;
  error: string | null;
}

export function runEncode(state: EncodeState): EncodeResult {
  if (state.input === '') return { output: '', error: null };
  const result: Coded =
    state.direction === 'encode'
      ? encodeText(state.codec, state.input)
      : decodeText(state.codec, state.input);
  return result.ok ? { output: result.value, error: null } : { output: '', error: result.error };
}

// ── time ──────────────────────────────────────────────────────────────────

export interface TimeResult {
  view: TimeView | null;
  relative: string | null;
  error: string | null;
  /** Every row as `label: value` lines, for Copy Output. */
  output: string;
}

const NO_TIME: TimeResult = { view: null, relative: null, error: null, output: '' };

export const TIME_ROWS = [
  ['Epoch seconds', 'epochSeconds'],
  ['Epoch ms', 'epochMilliseconds'],
  ['ISO 8601', 'iso'],
  ['ISO 8601 UTC', 'isoUtc'],
  ['Readable', 'human'],
  ['Offset', 'offset'],
] as const satisfies ReadonlyArray<readonly [string, keyof TimeView]>;

export function runTime(state: TimeState, zone: string, now: number, locale = 'en-US'): TimeResult {
  if (state.input.trim() === '') return NO_TIME;
  const parsed = parseTimeInput(state.input, state.unit, zone);
  if (!parsed.ok) return { ...NO_TIME, error: parsed.error };
  const view = describeInstant(parsed.ms, zone || UTC, locale);
  return {
    view,
    relative: formatSince(parsed.ms, now, locale),
    error: null,
    output: TIME_ROWS.map(([label, key]) => `${label}: ${view[key]}`).join('\n'),
  };
}
