/**
 * What the note list knows: how a note gets its title, its excerpt and its
 * tags, how the list is ordered and filtered, and how much of the window each
 * pane may have. All of it is pure, so the component only has to render.
 */
import {
  frontCreated,
  frontPinned,
  frontTitle,
  parseDocument,
  serializeDocument,
  setEntry,
} from './frontmatter';
import {
  blocksToText,
  collectTagTokens,
  inlineText,
  type MarkdownBlock,
  parseMarkdown,
} from './markdown';

export interface Note {
  path: string;
  /** File name including the extension. */
  name: string;
  /** The whole file, front matter included. */
  text: string;
  /** The file without its front matter. */
  body: string;
  /** Line the body starts on, so preview line numbers address the file. */
  bodyLine: number;
  title: string;
  excerpt: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  modifiedAt: number;
  words: number;
  characters: number;
}

export type SortKey = 'modified' | 'created' | 'title';

export const SORT_LABELS: Record<SortKey, string> = {
  modified: 'Date Modified',
  created: 'Date Created',
  title: 'Title',
};

export type ViewMode = 'edit' | 'preview' | 'split';

export const VIEW_LABELS: Record<ViewMode, string> = {
  edit: 'Edit',
  preview: 'Preview',
  split: 'Split',
};

export interface NotesPrefs {
  sort: SortKey;
  view: ViewMode;
  showTags: boolean;
  /** Note to reopen next time, if it is still there. */
  lastPath: string | null;
}

export const DEFAULT_PREFS: NotesPrefs = {
  sort: 'modified',
  view: 'edit',
  showTags: true,
  lastPath: null,
};

/** Settings come off disk as unknown JSON; keep only values we understand. */
export function normalizePrefs(value: unknown): NotesPrefs {
  const raw = (value ?? {}) as Partial<Record<keyof NotesPrefs, unknown>>;
  const sort = raw.sort;
  const view = raw.view;
  return {
    sort: sort === 'created' || sort === 'title' ? sort : 'modified',
    view: view === 'preview' || view === 'split' ? view : 'edit',
    showTags: typeof raw.showTags === 'boolean' ? raw.showTags : true,
    lastPath: typeof raw.lastPath === 'string' ? raw.lastPath : null,
  };
}

export const EXCERPT_LENGTH = 140;
/** Average adult reading speed, used for the status-bar estimate. */
export const WORDS_PER_MINUTE = 220;

// ── deriving a note ───────────────────────────────────────────────────────

/** The first heading of a body, ignoring `#` inside fenced code. */
export function firstHeading(body: string): string | null {
  for (const block of parseMarkdown(body)) {
    if (block.type === 'heading') {
      const text = inlineText(block.children).trim();
      if (text) return text;
    }
  }
  return null;
}

/** Front-matter `title`, else the first heading, else the file name. */
export function deriveTitle(input: { front?: string; body: string; name: string }): string {
  const declared = input.front?.trim();
  if (declared) return declared;
  const heading = firstHeading(input.body);
  if (heading) return heading;
  return input.name.replace(/\.(md|markdown|txt)$/i, '') || 'Untitled';
}

function flatten(blocks: readonly MarkdownBlock[]): string {
  return blocksToText(blocks).join(' ').replace(/\s+/g, ' ').trim();
}

/** One line of prose from the body, with the title heading left out. */
export function makeExcerpt(body: string, title: string, limit = EXCERPT_LENGTH): string {
  const blocks = parseMarkdown(body);
  const first = blocks[0];
  const rest =
    first?.type === 'heading' && inlineText(first.children).trim() === title
      ? blocks.slice(1)
      : blocks;
  return truncate(flatten(rest), limit);
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** `#tag` tokens in reading order, without duplicates and without code. */
export function extractTags(body: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of collectTagTokens(body)) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(raw);
  }
  return tags;
}

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function countCharacters(text: string): number {
  return [...text].length;
}

/** Whole minutes, never below one for a note with any words in it. */
export function readingMinutes(words: number): number {
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export interface NoteSource {
  path: string;
  name: string;
  text: string;
  createdAt: number;
  modifiedAt: number;
}

/** Everything the list and the status bar need, computed once per file. */
export function buildNote(source: NoteSource): Note {
  const doc = parseDocument(source.text);
  const title = deriveTitle({ front: frontTitle(doc.front), body: doc.body, name: source.name });
  return {
    path: source.path,
    name: source.name,
    text: source.text,
    body: doc.body,
    bodyLine: doc.bodyLine,
    title,
    excerpt: makeExcerpt(doc.body, title),
    tags: extractTags(doc.body),
    pinned: frontPinned(doc.front),
    createdAt: frontCreated(doc.front) ?? source.createdAt,
    modifiedAt: source.modifiedAt,
    words: countWords(doc.body),
    characters: countCharacters(doc.body),
  };
}

// ── searching ─────────────────────────────────────────────────────────────

export interface Range {
  start: number;
  end: number;
}

/** Every case-insensitive occurrence of `query` in `text`. */
export function matchRanges(text: string, query: string): Range[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hay = text.toLowerCase();
  const ranges: Range[] = [];
  let at = hay.indexOf(needle);
  while (at !== -1) {
    ranges.push({ start: at, end: at + needle.length });
    at = hay.indexOf(needle, at + needle.length);
  }
  return ranges;
}

/** Split `text` into runs, marking the ones inside `ranges`. */
export function highlightParts(
  text: string,
  ranges: readonly Range[],
): Array<{ text: string; match: boolean }> {
  if (ranges.length === 0) return text ? [{ text, match: false }] : [];
  const parts: Array<{ text: string; match: boolean }> = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start > at) parts.push({ text: text.slice(at, range.start), match: false });
    parts.push({ text: text.slice(range.start, range.end), match: true });
    at = range.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}

/** A window of `text` centred on the first hit, plus the hits inside it. */
export function excerptAround(
  text: string,
  query: string,
  limit = EXCERPT_LENGTH,
): { text: string; ranges: Range[] } {
  const first = matchRanges(text, query)[0];
  if (!first) return { text: truncate(text, limit), ranges: [] };
  const lead = Math.max(0, first.start - Math.floor(limit / 3));
  const head = lead > 0 ? '…' : '';
  const sliced = text.slice(lead, lead + limit);
  const tail = lead + limit < text.length ? '…' : '';
  const ranges = matchRanges(sliced, query).map((r) => ({
    start: r.start + head.length,
    end: r.end + head.length,
  }));
  return { text: head + sliced + tail, ranges };
}

export interface NoteRow {
  note: Note;
  /** Occurrences of the query in the title and the body. */
  matches: number;
  score: number;
  excerpt: string;
  excerptRanges: Range[];
  titleRanges: Range[];
}

/** Title hits count for much more than body hits, and a tag hit sits between. */
export function scoreNote(note: Note, query: string): { score: number; matches: number } {
  const titleHits = matchRanges(note.title, query).length;
  const bodyHits = matchRanges(note.body, query).length;
  const tagHits = note.tags.filter((t) => matchRanges(t, query).length > 0).length;
  return { score: titleHits * 100 + tagHits * 20 + bodyHits, matches: titleHits + bodyHits };
}

function compare(a: Note, b: Note, sort: SortKey): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  switch (sort) {
    case 'title':
      return a.title.localeCompare(b.title) || a.name.localeCompare(b.name);
    case 'created':
      return b.createdAt - a.createdAt || a.name.localeCompare(b.name);
    case 'modified':
      return b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name);
  }
}

export interface ListOptions {
  query?: string;
  tag?: string | null;
  sort: SortKey;
}

/**
 * The rows of the note list: filtered by tag, then by query, then ordered.
 * Without a query, pinned notes lead and the chosen sort decides the rest.
 * With one, the best match leads and the chosen sort breaks ties.
 */
export function listNotes(notes: readonly Note[], options: ListOptions): NoteRow[] {
  const tag = options.tag?.toLowerCase() ?? null;
  const query = options.query?.trim() ?? '';
  const filtered = tag
    ? notes.filter((n) => n.tags.some((t) => t.toLowerCase() === tag))
    : [...notes];

  if (!query) {
    return filtered
      .sort((a, b) => compare(a, b, options.sort))
      .map((note) => ({
        note,
        matches: 0,
        score: 0,
        excerpt: note.excerpt,
        excerptRanges: [],
        titleRanges: [],
      }));
  }

  const rows: NoteRow[] = [];
  for (const note of filtered) {
    const { score, matches } = scoreNote(note, query);
    if (score === 0) continue;
    const around = excerptAround(flatten(parseMarkdown(note.body)), query);
    rows.push({
      note,
      score,
      matches,
      excerpt: around.text || note.excerpt,
      excerptRanges: around.ranges,
      titleRanges: matchRanges(note.title, query),
    });
  }
  return rows.sort((a, b) => b.score - a.score || compare(a.note, b.note, options.sort));
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Tags across every note, most used first, then alphabetical. */
export function tagCounts(notes: readonly Note[]): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// ── writing back ──────────────────────────────────────────────────────────

/** Characters no common file system takes in a name. */
const UNSAFE_IN_NAME = /[/\\:*?"<>|]+/g;

/** A file name for a title: safe characters, a sensible length, `.md`. */
export function fileNameForTitle(title: string): string {
  const stem = [...title]
    // Control characters have no width and no business in a file name, so they
    // go before anything else is measured.
    .filter((char) => char >= ' ')
    .join('')
    .replace(UNSAFE_IN_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '');
  return `${stem || 'Untitled'}.md`;
}

/**
 * Give a document a new title: rewrite the leading heading when that is where
 * the title came from, otherwise record it in the front matter.
 */
export function retitle(text: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return text;
  const doc = parseDocument(text);
  if (frontTitle(doc.front) === undefined) {
    const first = parseMarkdown(doc.body)[0];
    if (first?.type === 'heading') {
      const lines = doc.body.split('\n');
      if (lines[first.line] !== undefined) {
        lines[first.line] = `${'#'.repeat(first.level)} ${trimmed}`;
        return serializeDocument(doc.front, lines.join('\n'));
      }
    }
  }
  return serializeDocument(setEntry(doc.front, 'title', trimmed), doc.body);
}

// ── layout ────────────────────────────────────────────────────────────────

/** Below this the tag rail folds away. */
export const RAIL_BREAKPOINT = 700;
/** Below this the list and the editor take turns. */
export const LIST_BREAKPOINT = 520;
/** Below this the list gives some of its width to the editor beside it. */
export const COMPACT_BREAKPOINT = 640;

export const LIST_WIDTH = 256;
export const LIST_WIDTH_COMPACT = 208;

/** How wide the list is while the editor sits next to it. */
export function listWidthFor(width: number): number {
  return width > 0 && width < COMPACT_BREAKPOINT ? LIST_WIDTH_COMPACT : LIST_WIDTH;
}

export type Pane = 'list' | 'editor';

export interface Layout {
  rail: boolean;
  list: boolean;
  editor: boolean;
  /** The editor is alone and needs a way back to the list. */
  back: boolean;
}

/**
 * Which panes fit. Width 0 means "not measured yet" and is treated as roomy,
 * so the first paint is the full layout rather than a flicker.
 */
export function layoutFor(
  width: number,
  options: { showRail: boolean; pane: Pane; hasSelection: boolean },
): Layout {
  const w = width > 0 ? width : RAIL_BREAKPOINT;
  if (w >= RAIL_BREAKPOINT) {
    return { rail: options.showRail, list: true, editor: true, back: false };
  }
  if (w >= LIST_BREAKPOINT) return { rail: false, list: true, editor: true, back: false };
  const editorOnly = options.pane === 'editor' && options.hasSelection;
  return { rail: false, list: !editorOnly, editor: editorOnly, back: editorOnly };
}
