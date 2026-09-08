/**
 * Tab completion. The first word of a command completes against command
 * names and aliases; later words (and anything with a `/` or `~`) complete
 * against the file system, where directories gain a trailing `/`.
 */

import type { Vfs } from '@lumen/vfs';
import { commandNames, resolvePath, type ShellState } from './commands';

export interface Completion {
  /** Text to replace the fragment under the cursor with. */
  replacement: string;
  /** Names to display when the fragment is ambiguous. */
  candidates: string[];
  /** Where the replaced fragment starts in the input line. */
  start: number;
  /** Where it ends (the cursor). */
  end: number;
  /** Append a space after a unique, complete match. */
  trailingSpace: boolean;
}

/**
 * The word under the cursor: its start index and text. Quotes and escaped
 * spaces keep a word together; the separators are unquoted whitespace and
 * the operators `| ; & > <`.
 */
export function fragmentAt(
  line: string,
  cursor: number,
): { start: number; text: string; quote: '"' | "'" | null } {
  let start = 0;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cursor; i++) {
    const c = line.charAt(i);
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/[\s|;&><]/.test(c)) start = i + 1;
  }
  return { start, text: line.slice(start, cursor), quote };
}

/** True when the fragment is the command name of its pipeline segment. */
export function isCommandPosition(line: string, start: number): boolean {
  const before = line.slice(0, start);
  return /(^|[|;&]|&&|\|\|)\s*$/.test(before);
}

/** The longest string that every candidate begins with. */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0] as string;
  for (const v of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix.charAt(i) === v.charAt(i)) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

function unquote(text: string): string {
  return text.replace(/\\(.)/g, '$1').replace(/^["']/, '').replace(/["']$/, '');
}

/** Escape spaces and shell punctuation so the completed word survives re-parsing. */
function escapeWord(text: string): string {
  return text.replace(/([ \t"'\\|;&<>$*?()])/g, '\\$1');
}

export interface CompleteOptions {
  vfs: Vfs;
  state: ShellState;
  line: string;
  cursor: number;
}

export async function complete({ vfs, state, line, cursor }: CompleteOptions): Promise<Completion> {
  const { start, text } = fragmentAt(line, cursor);
  const fragment = unquote(text);
  const none: Completion = {
    replacement: text,
    candidates: [],
    start,
    end: cursor,
    trailingSpace: false,
  };

  const looksLikePath =
    fragment.includes('/') || fragment.startsWith('~') || fragment.startsWith('.');
  if (isCommandPosition(line, start) && !looksLikePath) {
    const names = [...new Set([...commandNames(), ...Object.keys(state.aliases)])].sort();
    const matches = names.filter((n) => n.startsWith(fragment));
    if (matches.length === 0) return none;
    if (matches.length === 1)
      return { ...none, replacement: matches[0] as string, trailingSpace: true };
    const prefix = commonPrefix(matches);
    return {
      ...none,
      replacement: prefix.length > fragment.length ? prefix : text,
      candidates: matches,
    };
  }

  return completePath(vfs, state, fragment, none);
}

async function completePath(
  vfs: Vfs,
  state: ShellState,
  fragment: string,
  none: Completion,
): Promise<Completion> {
  // Split into the directory to list and the partial name inside it.
  const slash = fragment.lastIndexOf('/');
  const dirText = slash < 0 ? '' : fragment.slice(0, slash + 1);
  const partial = slash < 0 ? fragment : fragment.slice(slash + 1);
  const dirPath = dirText === '' ? state.cwd : resolvePath(state, dirText === '/' ? '/' : dirText);

  let entries: Array<{ name: string; kind: 'file' | 'directory' }>;
  try {
    entries = await vfs.readDir(dirPath);
  } catch {
    return none;
  }
  const matches = entries
    .filter(
      (e) => e.name.startsWith(partial) && (partial.startsWith('.') || !e.name.startsWith('.')),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (matches.length === 0) return none;

  const decorate = (e: { name: string; kind: 'file' | 'directory' }) =>
    e.kind === 'directory' ? `${e.name}/` : e.name;
  if (matches.length === 1) {
    const only = matches[0] as (typeof matches)[number];
    return {
      ...none,
      replacement: escapeWord(dirText + only.name) + (only.kind === 'directory' ? '/' : ''),
      trailingSpace: only.kind !== 'directory',
    };
  }
  const prefix = commonPrefix(matches.map((e) => e.name));
  return {
    ...none,
    replacement: prefix.length > partial.length ? escapeWord(dirText + prefix) : none.replacement,
    candidates: matches.map(decorate),
  };
}

/** Apply a completion to a line, returning the new line and cursor. */
export function applyCompletion(
  line: string,
  completion: Completion,
): { line: string; cursor: number } {
  const insert = completion.replacement + (completion.trailingSpace ? ' ' : '');
  const next = line.slice(0, completion.start) + insert + line.slice(completion.end);
  return { line: next, cursor: completion.start + insert.length };
}
