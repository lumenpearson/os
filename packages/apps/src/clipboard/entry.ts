/**
 * The list model.
 *
 * The kernel keeps a ring of the last things Lumen copied, and until now
 * nothing displayed it. What the window shows is that ring folded down: the
 * same text copied five times is one row, at the newest of the five times.
 * Rows are identified by what they hold rather than by when they arrived, so
 * putting an item back on the clipboard moves it to the top of the list
 * instead of printing it twice.
 *
 * Pins are the app's own copies, kept in `clipboard.json`. The ring rolls on
 * regardless, so a pinned item can outlive the kernel's record of it;
 * `inHistory` says which of the two is true and the detail pane says so out
 * loud rather than implying the system kept it.
 */

import type { ClipboardItem } from '@lumen/kernel';
import { basename } from '@lumen/vfs';
import type { ClipboardData, PinnedClip } from './storage';

export type ClipKind = 'text' | 'files';

export interface FileClip {
  paths: string[];
  operation: 'copy' | 'cut';
}

/** What a clipboard item holds, with nothing about when it was copied. */
export interface ClipContent {
  kind: ClipKind;
  /** The text; empty for a file entry. */
  text: string;
  files: FileClip | null;
}

export interface ClipEntry extends ClipContent {
  /** Identity by content: two copies of the same thing share a key. */
  key: string;
  /** The most recent moment this content reached the clipboard. */
  copiedAt: number;
  pinned: boolean;
  /** When the pin was made, or null for an entry that is not pinned. */
  pinnedAt: number | null;
  /** The kernel's ring still holds this content. */
  inHistory: boolean;
}

/** How much of the first line a row is willing to show. */
const PREVIEW_LIMIT = 200;

/**
 * FNV-1a, 32 bits, base 36. The key goes into the JSON file once per removed
 * item, so it has to be short — a key that carried the text itself would
 * store a second copy of every item the user threw away. Length is kept
 * beside the digest because two strings that collide on both are rarer than
 * anything this app will see.
 */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The bytes a key is taken over: for files, the operation and the paths. */
function contentString(content: ClipContent): string {
  if (content.kind === 'files' && content.files) {
    return `${content.files.operation}\n${content.files.paths.join('\n')}`;
  }
  return content.text;
}

export function clipKey(content: ClipContent): string {
  const text = contentString(content);
  return `${content.kind}:${text.length}:${digest(text)}`;
}

/**
 * A kernel item as content, or null when there is nothing to show: an empty
 * string, a file operation with no paths, or a record whose kind and payload
 * disagree. The kernel's type makes both payloads optional, so this is the
 * only place that has to think about it.
 */
export function contentOfItem(item: ClipboardItem): ClipContent | null {
  if (item.kind === 'text') {
    if (typeof item.text !== 'string' || item.text === '') return null;
    return { kind: 'text', text: item.text, files: null };
  }
  const files = item.files;
  if (!files || !Array.isArray(files.paths) || files.paths.length === 0) return null;
  return {
    kind: 'files',
    text: '',
    files: { paths: [...files.paths], operation: files.operation === 'cut' ? 'cut' : 'copy' },
  };
}

/**
 * The ring as entries, newest first, one per distinct content. Ties keep the
 * order the ring was in, which is newest first already.
 */
export function mergeHistory(history: readonly ClipboardItem[]): ClipEntry[] {
  const byKey = new Map<string, ClipEntry>();
  for (const item of history) {
    const content = contentOfItem(item);
    if (!content) continue;
    const key = clipKey(content);
    const copiedAt = Number.isFinite(item.copiedAt) ? item.copiedAt : 0;
    const seen = byKey.get(key);
    if (seen) {
      if (copiedAt > seen.copiedAt) seen.copiedAt = copiedAt;
      continue;
    }
    byKey.set(key, { ...content, key, copiedAt, pinned: false, pinnedAt: null, inHistory: true });
  }
  return [...byKey.values()].sort((a, b) => b.copiedAt - a.copiedAt);
}

export function entryOfPin(pin: PinnedClip): ClipEntry {
  return {
    key: pin.key,
    kind: pin.kind,
    text: pin.text,
    files: pin.files ? { paths: [...pin.files.paths], operation: pin.files.operation } : null,
    copiedAt: pin.copiedAt,
    pinned: true,
    pinnedAt: pin.pinnedAt,
    inHistory: false,
  };
}

export interface EntryLists {
  /** The app's own copies, newest pin first. */
  pinned: ClipEntry[];
  /** What the ring holds and the user has not removed, newest first. */
  recent: ClipEntry[];
}

/**
 * The two groups the window draws.
 *
 * A removal is recorded as "hide this content up to this moment" rather than
 * as a deleted row, because the kernel's ring is not ours to edit: the item is
 * still in it, and the same text copied again afterwards is a new event that
 * has to come back. Clear All is the same rule with one timestamp for
 * everything. Pins are the app's own copies and neither rule touches them.
 */
export function visibleEntries(history: readonly ClipboardItem[], data: ClipboardData): EntryLists {
  const merged = mergeHistory(history);
  const inRing = new Map(merged.map((entry) => [entry.key, entry]));
  const hiddenUpTo = new Map(data.dismissed.map((d) => [d.key, d.at]));

  const pinned = [...data.pins]
    .sort((a, b) => b.pinnedAt - a.pinnedAt)
    .map((pin) => {
      const live = inRing.get(pin.key);
      return {
        ...entryOfPin(pin),
        copiedAt: Math.max(pin.copiedAt, live?.copiedAt ?? 0),
        inHistory: live !== undefined,
      };
    });

  const pinnedKeys = new Set(pinned.map((entry) => entry.key));
  const recent = merged.filter((entry) => {
    if (pinnedKeys.has(entry.key)) return false;
    if (entry.copiedAt <= data.clearedBefore) return false;
    const at = hiddenUpTo.get(entry.key);
    return at === undefined || entry.copiedAt > at;
  });

  return { pinned, recent };
}

/**
 * Text is matched on its content and a file entry on its paths, so typing a
 * file name finds the copy that carried it rather than hiding it.
 */
export function matchesQuery(entry: ClipEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  if (entry.kind === 'text') return entry.text.toLowerCase().includes(needle);
  return (entry.files?.paths ?? []).some((path) => path.toLowerCase().includes(needle));
}

export function searchEntries(entries: readonly ClipEntry[], query: string): ClipEntry[] {
  if (query.trim() === '') return [...entries];
  return entries.filter((entry) => matchesQuery(entry, query));
}

/** The first line with something on it, trimmed and capped for one row. */
export function previewLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    return trimmed.length > PREVIEW_LIMIT ? `${trimmed.slice(0, PREVIEW_LIMIT)}…` : trimmed;
  }
  return '';
}

/** Counted, not estimated: what the detail pane prints beside the time. */
export function textShape(text: string): { characters: number; lines: number } {
  return { characters: text.length, lines: text === '' ? 0 : text.split('\n').length };
}

export function operationLabel(files: FileClip): string {
  return files.operation === 'cut' ? 'Cut' : 'Copied';
}

/** The name a file entry goes by: the file itself, or the first and a count. */
export function filesTitle(files: FileClip): string {
  const first = files.paths[0];
  if (first === undefined) return 'No paths';
  if (files.paths.length === 1) return basename(first);
  return `${basename(first)} and ${files.paths.length - 1} more`;
}

export function entryTitle(entry: ClipEntry): string {
  if (entry.kind === 'files' && entry.files) return filesTitle(entry.files);
  return previewLine(entry.text);
}

/** What the kind is called in the detail pane's heading. */
export function kindLabel(entry: ClipEntry): string {
  if (entry.kind === 'text') return 'Text';
  const count = entry.files?.paths.length ?? 0;
  const noun = count === 1 ? 'file' : 'files';
  return entry.files?.operation === 'cut' ? `${count} ${noun} cut` : `${count} ${noun} copied`;
}

/**
 * The sentence under a pinned item. A pin is this app's copy and nothing
 * else, and the note has to say which of the two records still exists.
 */
export function pinNote(entry: ClipEntry): string | null {
  if (!entry.pinned) return null;
  return entry.inHistory
    ? 'Pinned. Clipboard holds its own copy of this; the system clipboard still has it too.'
    : 'Pinned. Clipboard holds its own copy; the system clipboard has rolled past it.';
}

export interface EmptyMessage {
  title: string;
  description: string;
}

/**
 * What an empty list says. The limit of the whole app goes here, once, where
 * someone is looking at nothing and wondering why: Lumen sees its own copies
 * and no others.
 */
export function emptyMessage(state: { searching: boolean; nothingCopied: boolean }): EmptyMessage {
  if (state.searching) {
    return { title: 'No matches', description: 'Nothing in the list matches what you typed.' };
  }
  if (state.nothingCopied) {
    return {
      title: 'Nothing copied yet',
      description:
        'Clipboard lists what Lumen copies; it cannot read what you copy in another application, so only copies made here appear.',
    };
  }
  return {
    title: 'The list is empty',
    description: 'Copy something in Lumen and it turns up here.',
  };
}

/** The count in the status bar: what is in the list, and how much is pinned. */
export function listSummary(counts: { shown: number; total: number; pinned: number }): string {
  const items = counts.total === 1 ? '1 item' : `${counts.total} items`;
  const head = counts.shown === counts.total ? items : `${counts.shown} of ${items}`;
  return counts.pinned === 0 ? head : `${head} · ${counts.pinned} pinned`;
}
