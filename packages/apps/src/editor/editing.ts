/**
 * Editing primitives for the text editor: caret arithmetic, indentation,
 * an undo history that coalesces a typing burst, and find/replace. Every
 * function here is pure so the component stays a thin shell around a
 * <textarea>.
 */

export interface TextSelection {
  start: number;
  end: number;
}

export interface EditResult {
  text: string;
  selection: TextSelection;
}

/** What Tab inserts, and what Shift+Tab removes. */
export const INDENT_UNIT = '  ';

/** Files above this size open read-only: a <textarea> cannot carry them. */
export const LARGE_FILE_LIMIT = 2 * 1024 * 1024;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 13;

export function isLargeText(text: string): boolean {
  return text.length > LARGE_FILE_LIMIT;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function ordered(selection: TextSelection, length: number): TextSelection {
  const a = clamp(selection.start, 0, length);
  const b = clamp(selection.end, 0, length);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function caret(at: number): TextSelection {
  return { start: at, end: at };
}

// ── caret arithmetic ──────────────────────────────────────────────────────

/** Offset of the first character of the line containing `index`. */
export function lineStartAt(text: string, index: number): number {
  return text.lastIndexOf('\n', clamp(index, 0, text.length) - 1) + 1;
}

/** Offset of the newline ending the line containing `index`, or the length. */
export function lineEndAt(text: string, index: number): number {
  const found = text.indexOf('\n', clamp(index, 0, text.length));
  return found === -1 ? text.length : found;
}

/** Zero-based line index of an offset. */
export function lineIndexAt(text: string, index: number): number {
  const limit = clamp(index, 0, text.length);
  let line = 0;
  for (let at = text.indexOf('\n'); at !== -1 && at < limit; at = text.indexOf('\n', at + 1)) {
    line++;
  }
  return line;
}

/** One-based line and column, the way a status bar reads them. */
export function lineColumnAt(text: string, index: number): { line: number; column: number } {
  const limit = clamp(index, 0, text.length);
  return { line: lineIndexAt(text, limit) + 1, column: limit - lineStartAt(text, limit) + 1 };
}

export function lineCount(text: string): number {
  let lines = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) lines++;
  return lines;
}

/** Offset where a one-based line begins, clamped to the document. */
export function offsetForLine(text: string, line: number): number {
  const target = clamp(Math.floor(line), 1, lineCount(text));
  let at = 0;
  for (let n = 1; n < target; n++) at = text.indexOf('\n', at) + 1;
  return at;
}

/** Leading spaces and tabs of a line. */
export function indentOf(line: string): string {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : '';
}

export function wordCount(text: string): number {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const space = code === 32 || (code >= 9 && code <= 13) || code === 0x00a0;
    if (space) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

/** The line ending the file already uses; new text keeps it. */
export function detectLineEnding(text: string): 'LF' | 'CRLF' {
  const at = text.indexOf('\n');
  return at > 0 && text.charAt(at - 1) === '\r' ? 'CRLF' : 'LF';
}

// ── edits ─────────────────────────────────────────────────────────────────

export function replaceRange(text: string, selection: TextSelection, insert: string): EditResult {
  const { start, end } = ordered(selection, text.length);
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    selection: caret(start + insert.length),
  };
}

/** Add one indent unit to every line the selection touches. */
export function indentLines(
  text: string,
  selection: TextSelection,
  unit = INDENT_UNIT,
): EditResult {
  const { start, end } = ordered(selection, text.length);
  const from = lineStartAt(text, start);
  const to = lineEndAt(text, end);
  const body = text
    .slice(from, to)
    .split('\n')
    .map((line) => unit + line)
    .join('\n');
  return {
    text: text.slice(0, from) + body + text.slice(to),
    selection: { start: from, end: from + body.length },
  };
}

/** Remove one indent unit (or a single tab) from every line the selection touches. */
export function outdentLines(
  text: string,
  selection: TextSelection,
  unit = INDENT_UNIT,
): EditResult {
  const { start, end } = ordered(selection, text.length);
  const from = lineStartAt(text, start);
  const to = lineEndAt(text, end);
  const body = text
    .slice(from, to)
    .split('\n')
    .map((line) => {
      if (line.startsWith('\t')) return line.slice(1);
      let removed = 0;
      while (removed < unit.length && line.charAt(removed) === ' ') removed++;
      return line.slice(removed);
    })
    .join('\n');
  return {
    text: text.slice(0, from) + body + text.slice(to),
    selection: { start: from, end: from + body.length },
  };
}

/** Tab: indent a multi-line selection, otherwise insert the indent unit. */
export function insertTab(text: string, selection: TextSelection, unit = INDENT_UNIT): EditResult {
  const { start, end } = ordered(selection, text.length);
  if (text.slice(start, end).includes('\n')) return indentLines(text, selection, unit);
  return replaceRange(text, selection, unit);
}

/** Enter: break the line and repeat the indentation of the line above. */
export function newlineWithIndent(text: string, selection: TextSelection): EditResult {
  const { start } = ordered(selection, text.length);
  const indent = indentOf(text.slice(lineStartAt(text, start), start));
  return replaceRange(text, selection, `\n${indent}`);
}

// ── undo history ──────────────────────────────────────────────────────────

export interface Snapshot {
  text: string;
  selection: TextSelection;
}

export interface History {
  entries: Snapshot[];
  index: number;
  /** Timestamp of the last recorded edit, for coalescing. */
  lastAt: number;
}

/** Edits closer together than this fold into one undo step. */
export const COALESCE_MS = 400;
const HISTORY_LIMIT = 300;

export function createHistory(initial: Snapshot): History {
  return { entries: [initial], index: 0, lastAt: 0 };
}

export interface RecordOptions {
  coalesceMs?: number;
  limit?: number;
}

/**
 * Record a new state. Inside a typing burst the current entry is rewritten,
 * so one undo removes the whole burst; a selection-only change never adds a
 * step.
 */
export function recordSnapshot(
  history: History,
  snapshot: Snapshot,
  at: number,
  options: RecordOptions = {},
): History {
  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  const limit = options.limit ?? HISTORY_LIMIT;
  const entries = history.entries.slice(0, history.index + 1);
  const current = entries[history.index];
  if (current && current.text === snapshot.text) {
    entries[history.index] = snapshot;
    return { entries, index: history.index, lastAt: history.lastAt };
  }
  if (
    history.index > 0 &&
    at - history.lastAt < coalesceMs &&
    entries.length === history.entries.length
  ) {
    entries[history.index] = snapshot;
    return { entries, index: history.index, lastAt: at };
  }
  entries.push(snapshot);
  const overflow = Math.max(0, entries.length - limit);
  return { entries: entries.slice(overflow), index: entries.length - overflow - 1, lastAt: at };
}

export function canUndo(history: History): boolean {
  return history.index > 0;
}

export function canRedo(history: History): boolean {
  return history.index < history.entries.length - 1;
}

export function undoHistory(history: History): { history: History; snapshot: Snapshot | null } {
  if (!canUndo(history)) return { history, snapshot: null };
  const index = history.index - 1;
  return { history: { ...history, index, lastAt: 0 }, snapshot: history.entries[index] ?? null };
}

export function redoHistory(history: History): { history: History; snapshot: Snapshot | null } {
  if (!canRedo(history)) return { history, snapshot: null };
  const index = history.index + 1;
  return { history: { ...history, index, lastAt: 0 }, snapshot: history.entries[index] ?? null };
}

// ── find and replace ──────────────────────────────────────────────────────

export interface FindOptions {
  caseSensitive: boolean;
  regex: boolean;
}

export interface FindMatch {
  start: number;
  end: number;
  /** The matched substring, for `$&` in a replacement. */
  text: string;
  groups: readonly string[];
}

/** Matches past this count are not collected; the counter reads "500+". */
export const MAX_MATCHES = 5000;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The compiled query, or null when it is empty or malformed. */
export function buildMatcher(query: string, options: FindOptions): RegExp | null {
  if (!query) return null;
  const flags = options.caseSensitive ? 'gm' : 'gmi';
  try {
    return new RegExp(options.regex ? query : escapeRegExp(query), flags);
  } catch {
    return null;
  }
}

/** A message for the find field when a regular expression will not compile. */
export function findQueryError(query: string, options: FindOptions): string | null {
  if (!query || !options.regex) return null;
  try {
    new RegExp(query);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid expression';
  }
}

export function findMatches(
  text: string,
  query: string,
  options: FindOptions,
  limit = MAX_MATCHES,
): FindMatch[] {
  const matcher = buildMatcher(query, options);
  if (!matcher) return [];
  const found: FindMatch[] = [];
  matcher.lastIndex = 0;
  for (let m = matcher.exec(text); m !== null && found.length < limit; m = matcher.exec(text)) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1).map((g) => g ?? ''),
    });
    if (m[0].length === 0) matcher.lastIndex++;
  }
  return found;
}

/** Index of the match to select when searching from `caret`; wraps around. */
export function nextMatchFrom(
  matches: readonly FindMatch[],
  caretAt: number,
  forward: boolean,
): number {
  if (matches.length === 0) return -1;
  if (forward) {
    const at = matches.findIndex((m) => m.start >= caretAt);
    return at === -1 ? 0 : at;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (match && match.end <= caretAt) return i;
  }
  return matches.length - 1;
}

/** Step to the next or previous match, wrapping at both ends. */
export function stepMatch(count: number, current: number, forward: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return forward ? 0 : count - 1;
  return forward ? (current + 1) % count : (current - 1 + count) % count;
}

/** `$&` and `$1`…`$9` expand from the match in regular-expression mode. */
export function expandReplacement(
  template: string,
  match: FindMatch,
  options: FindOptions,
): string {
  if (!options.regex) return template;
  return template.replace(/\$(\$|&|\d)/g, (_all, token: string) => {
    if (token === '$') return '$';
    if (token === '&') return match.text;
    const group = match.groups[Number(token) - 1];
    return group ?? '';
  });
}

/** Replace one match; the caret lands after the inserted text. */
export function replaceMatch(
  text: string,
  match: FindMatch,
  template: string,
  options: FindOptions,
): EditResult {
  const value = expandReplacement(template, match, options);
  return replaceRange(text, { start: match.start, end: match.end }, value);
}

export function replaceAllMatches(
  text: string,
  query: string,
  template: string,
  options: FindOptions,
): { text: string; count: number } {
  const matches = findMatches(text, query, options);
  if (matches.length === 0) return { text, count: 0 };
  let out = '';
  let at = 0;
  for (const match of matches) {
    out += text.slice(at, match.start) + expandReplacement(template, match, options);
    at = match.end;
  }
  return { text: out + text.slice(at), count: matches.length };
}

// ── view helpers ──────────────────────────────────────────────────────────

/** "12" or "12:5" from the Go to Line prompt. */
export function parseGoToLine(
  input: string,
  lines: number,
): { line: number; column: number } | null {
  const match = /^\s*(\d+)(?:\s*[:,]\s*(\d+))?\s*$/.exec(input);
  if (!match) return null;
  const line = Number(match[1]);
  if (!Number.isFinite(line) || line < 1) return null;
  const column = match[2] === undefined ? 1 : Math.max(1, Number(match[2]));
  return { line: clamp(line, 1, Math.max(1, lines)), column };
}

/** The smallest scroll that brings a block of `height` into the viewport. */
export function scrollTopToReveal(
  top: number,
  height: number,
  viewHeight: number,
  currentTop: number,
): number {
  if (top < currentTop) return Math.max(0, top);
  if (top + height > currentTop + viewHeight) return Math.max(0, top + height - viewHeight);
  return currentTop;
}

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return clamp(Math.round(size), MIN_FONT_SIZE, MAX_FONT_SIZE);
}

/** Line box height for a font size; the gutter uses the same number. */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.6);
}

export interface EditorPrefs {
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
}

export const DEFAULT_PREFS: EditorPrefs = {
  fontSize: DEFAULT_FONT_SIZE,
  wordWrap: false,
  lineNumbers: true,
};

/** Preferences come from a file a user can edit, so nothing is trusted. */
export function normalizePrefs(raw: unknown): EditorPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const value = raw as Record<string, unknown>;
  return {
    fontSize: clampFontSize(
      typeof value.fontSize === 'number' ? value.fontSize : DEFAULT_FONT_SIZE,
    ),
    wordWrap: typeof value.wordWrap === 'boolean' ? value.wordWrap : DEFAULT_PREFS.wordWrap,
    lineNumbers:
      typeof value.lineNumbers === 'boolean' ? value.lineNumbers : DEFAULT_PREFS.lineNumbers,
  };
}
