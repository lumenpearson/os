/**
 * Pure logic for the Files app: sorting, navigation history, selection,
 * drag-and-drop validity, name validation and breadcrumbs. No React, no VFS.
 */
import {
  type DirEntry,
  dirname,
  formatBytes,
  isInside,
  isTextLike,
  isValidName,
  join,
  normalize,
  typeInfo,
} from '@lumen/vfs';

// ── sorting ───────────────────────────────────────────────────────────────

export type SortColumn = 'name' | 'date' | 'size' | 'kind';
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
export type ViewMode = 'list' | 'grid' | 'columns';

export const SORT_COLUMNS: ReadonlyArray<{ id: SortColumn; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date Modified' },
  { id: 'size', label: 'Size' },
  { id: 'kind', label: 'Kind' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** "Folder" for directories, otherwise the type label ("PNG Image", "Markdown"). */
export function kindLabel(entry: Pick<DirEntry, 'kind' | 'path'>): string {
  return entry.kind === 'directory' ? 'Folder' : typeInfo(entry.path).label;
}

/**
 * Folders always come first. Within each group the chosen column decides,
 * in the chosen direction; equal values fall back to ascending name order.
 */
export function compareBy(sort: SortState): (a: DirEntry, b: DirEntry) => number {
  const dir = sort.direction === 'asc' ? 1 : -1;
  return (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    let cmp: number;
    switch (sort.column) {
      case 'date':
        cmp = a.modifiedAt - b.modifiedAt;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'kind':
        cmp = collator.compare(kindLabel(a), kindLabel(b));
        break;
      default:
        cmp = collator.compare(a.name, b.name);
    }
    return cmp !== 0 ? cmp * dir : collator.compare(a.name, b.name);
  };
}

export function sortEntries(entries: readonly DirEntry[], sort: SortState): DirEntry[] {
  return [...entries].sort(compareBy(sort));
}

/**
 * DataTable sorts rows by a numeric accessor and applies the direction itself.
 * Feeding it `direction * position` for rows we already ordered keeps its
 * header state and our folders-first order in agreement.
 */
export function rankMap(
  sorted: readonly DirEntry[],
  direction: SortDirection,
): Map<string, number> {
  const sign = direction === 'asc' ? 1 : -1;
  const out = new Map<string, number>();
  for (const [i, e] of sorted.entries()) out.set(e.path, sign * i);
  return out;
}

// ── history ───────────────────────────────────────────────────────────────

export interface History {
  readonly entries: readonly string[];
  readonly index: number;
}

const HISTORY_LIMIT = 100;

export function createHistory(initial: string): History {
  return { entries: [normalize(initial)], index: 0 };
}

export function currentPath(h: History): string {
  return h.entries[h.index] ?? '/';
}

/** Navigate to a path: drops the forward stack. Same path twice is a no-op. */
export function pushHistory(h: History, path: string): History {
  const n = normalize(path);
  if (currentPath(h) === n) return h;
  const entries = [...h.entries.slice(0, h.index + 1), n].slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

export function canGoBack(h: History): boolean {
  return h.index > 0;
}

export function canGoForward(h: History): boolean {
  return h.index < h.entries.length - 1;
}

export function goBack(h: History): History {
  return canGoBack(h) ? { entries: h.entries, index: h.index - 1 } : h;
}

export function goForward(h: History): History {
  return canGoForward(h) ? { entries: h.entries, index: h.index + 1 } : h;
}

// ── selection ─────────────────────────────────────────────────────────────

/**
 * `keys` is the selected set; `anchor` is where a Shift range starts;
 * `cursor` is the item keyboard navigation moves from. Treat as immutable.
 */
export interface Selection {
  readonly keys: Set<string>;
  readonly anchor: string | null;
  readonly cursor: string | null;
}

export const EMPTY_SELECTION: Selection = { keys: new Set(), anchor: null, cursor: null };

export interface ClickModifiers {
  shift?: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  toggle?: boolean;
}

export function selectOnly(key: string): Selection {
  return { keys: new Set([key]), anchor: key, cursor: key };
}

export function selectAll(order: readonly string[]): Selection {
  return {
    keys: new Set(order),
    anchor: order[0] ?? null,
    cursor: order[order.length - 1] ?? null,
  };
}

/** Plain click selects one; Shift extends from the anchor; Ctrl/Cmd toggles. */
export function selectClick(
  sel: Selection,
  order: readonly string[],
  key: string,
  mods: ClickModifiers = {},
): Selection {
  if (!order.includes(key)) return sel;
  if (mods.shift && sel.anchor !== null && order.includes(sel.anchor)) {
    const a = order.indexOf(sel.anchor);
    const b = order.indexOf(key);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const keys = new Set(mods.toggle ? sel.keys : []);
    for (let i = lo; i <= hi; i++) keys.add(order[i] as string);
    return { keys, anchor: sel.anchor, cursor: key };
  }
  if (mods.toggle) {
    const keys = new Set(sel.keys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    return { keys, anchor: key, cursor: key };
  }
  return selectOnly(key);
}

export type SelectionStep = number | 'home' | 'end';

/**
 * Move the cursor by `step` items (or to the ends). With `extend` the range
 * from the anchor to the new cursor is selected, like Shift+Arrow.
 */
export function moveSelection(
  sel: Selection,
  order: readonly string[],
  step: SelectionStep,
  extend = false,
): Selection {
  if (order.length === 0) return sel;
  const last = order.length - 1;
  const from = sel.cursor !== null ? order.indexOf(sel.cursor) : -1;
  let to: number;
  if (step === 'home') to = 0;
  else if (step === 'end') to = last;
  else if (from < 0) to = step < 0 ? last : 0;
  else to = Math.max(0, Math.min(last, from + step));
  const key = order[to] as string;
  if (!extend) return selectOnly(key);
  const anchor = sel.anchor !== null && order.includes(sel.anchor) ? sel.anchor : key;
  const a = order.indexOf(anchor);
  const [lo, hi] = a < to ? [a, to] : [to, a];
  const keys = new Set<string>();
  for (let i = lo; i <= hi; i++) keys.add(order[i] as string);
  return { keys, anchor, cursor: key };
}

/** Drop keys that no longer exist. Returns the same object when nothing changed. */
export function pruneSelection(sel: Selection, existing: ReadonlySet<string>): Selection {
  const keys = new Set([...sel.keys].filter((k) => existing.has(k)));
  const anchor = sel.anchor !== null && existing.has(sel.anchor) ? sel.anchor : null;
  const cursor = sel.cursor !== null && existing.has(sel.cursor) ? sel.cursor : null;
  if (keys.size === sel.keys.size && anchor === sel.anchor && cursor === sel.cursor) return sel;
  return { keys, anchor, cursor };
}

/** Remove every key equal to `path` or inside it (after a remove/rename event). */
export function dropUnder(sel: Selection, path: string): Selection {
  const keep = new Set([...sel.keys].filter((k) => !isInside(path, k, true)));
  if (keep.size === sel.keys.size) return sel;
  return pruneSelection(sel, keep);
}

/** Next index for arrow keys in a wrapped grid with `columns` cells per row. */
export function gridStep(index: number, count: number, columns: number, key: string): number {
  if (count === 0) return -1;
  const last = count - 1;
  const cols = Math.max(1, columns);
  if (index < 0) return key === 'ArrowUp' || key === 'ArrowLeft' || key === 'End' ? last : 0;
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'ArrowRight':
      return Math.min(last, index + 1);
    case 'ArrowUp':
      return index - cols >= 0 ? index - cols : index;
    case 'ArrowDown':
      return index + cols <= last ? index + cols : index;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return index;
  }
}

// ── drag and drop ─────────────────────────────────────────────────────────

export const DRAG_MIME = 'application/x-lumen-paths';
export type TransferOperation = 'move' | 'copy';

/**
 * A folder cannot receive itself or one of its ancestors, and a move to the
 * folder the items already live in is pointless.
 */
export function canDrop(
  sources: readonly string[],
  targetDir: string,
  operation: TransferOperation = 'move',
): boolean {
  if (sources.length === 0) return false;
  const target = normalize(targetDir);
  for (const s of sources) {
    if (isInside(s, target, true)) return false;
  }
  if (operation === 'move' && sources.every((s) => dirname(s) === target)) return false;
  return true;
}

export function parseDragPaths(data: string | null | undefined): string[] {
  if (!data) return [];
  try {
    const value: unknown = JSON.parse(data);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.startsWith('/'));
  } catch {
    return [];
  }
}

// ── names ─────────────────────────────────────────────────────────────────

/** Case-insensitive collision check; `self` (the item being renamed) never collides. */
export function nameTaken(name: string, siblings: readonly string[], self?: string): boolean {
  const n = name.toLowerCase();
  return siblings.some((s) => s !== self && s.toLowerCase() === n);
}

/** Null when the name is usable, otherwise a short reason to show inline. */
export function validateName(
  name: string,
  siblings: readonly string[],
  self?: string,
): string | null {
  if (name.length === 0) return 'Enter a name.';
  if (name.trim() !== name) return 'Names cannot start or end with a space.';
  if (!isValidName(name)) return 'Names cannot contain / \\ : * ? " < > | or end with a dot.';
  if (nameTaken(name, siblings, self)) return 'Something else here already has this name.';
  return null;
}

// ── breadcrumbs ───────────────────────────────────────────────────────────

export interface Crumb {
  label: string;
  path: string;
}

/** Inside the home directory the trail starts at "Home"; elsewhere at "This Computer". */
export function crumbsFor(path: string, home: string): Crumb[] {
  const p = normalize(path);
  const h = normalize(home);
  const inHome = h !== '/' && isInside(h, p, true);
  const start = inHome ? h : '/';
  const out: Crumb[] = [{ label: inHome ? 'Home' : 'This Computer', path: start }];
  if (p === start) return out;
  const rest = p.slice(start === '/' ? 1 : start.length + 1).split('/');
  let cur = start;
  for (const seg of rest) {
    cur = join(cur, seg);
    out.push({ label: seg, path: cur });
  }
  return out;
}

/** Keep the first and the last `max - 2` crumbs; `null` marks the collapsed middle. */
export function collapseCrumbs(crumbs: readonly Crumb[], max = 4): Array<Crumb | null> {
  if (crumbs.length <= max || max < 3) return [...crumbs];
  return [crumbs[0] as Crumb, null, ...crumbs.slice(-(max - 2))];
}

// ── misc ──────────────────────────────────────────────────────────────────

export const TEXT_PREVIEW_LIMIT = 64 * 1024;

export type PreviewKind = 'image' | 'text' | 'none';

export function previewKind(entry: Pick<DirEntry, 'kind' | 'path' | 'size'>): PreviewKind {
  if (entry.kind === 'directory') return 'none';
  if (typeInfo(entry.path).category === 'image') return 'image';
  if (isTextLike(entry.path) && entry.size <= TEXT_PREVIEW_LIMIT) return 'text';
  return 'none';
}

export function statusText(
  count: number,
  selected: number,
  usage: { used: number; quota: number | null } | null,
): string {
  const parts = [`${count} ${count === 1 ? 'item' : 'items'}`];
  if (selected > 0) parts.push(`${selected} selected`);
  if (usage) {
    parts.push(
      usage.quota !== null && usage.quota > 0
        ? `${formatBytes(Math.max(0, usage.quota - usage.used))} free`
        : `${formatBytes(usage.used)} used`,
    );
  }
  return parts.join(' · ');
}

/** True for inputs, textareas and contenteditable hosts: keys belong to them. */
export function isEditableTarget(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
