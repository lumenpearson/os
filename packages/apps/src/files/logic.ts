/**
 * Pure logic for the Files app: views, navigation history, selection, the
 * card lane, the A–Z rail, drag-and-drop validity, name validation and
 * breadcrumbs. Filtering and sorting live next door in `filters.ts`.
 * No React, no VFS.
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

// ── views and sort keys ───────────────────────────────────────────────────

export type SortColumn = 'name' | 'date' | 'size' | 'kind';
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
/** `cards` is the card lane; the other three are the classic Finder views. */
export type ViewMode = 'list' | 'grid' | 'columns' | 'cards';

export const VIEW_MODES: ReadonlyArray<ViewMode> = ['list', 'grid', 'columns', 'cards'];

export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);
}

export const SORT_COLUMNS: ReadonlyArray<{ id: SortColumn; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date Modified' },
  { id: 'size', label: 'Size' },
  { id: 'kind', label: 'Kind' },
];

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
  /** Items before filtering; when it is larger, the count reads "3 of 12". */
  total = count,
): string {
  const noun = total === 1 ? 'item' : 'items';
  const parts = [total > count ? `${count} of ${total} ${noun}` : `${count} ${noun}`];
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

// ── card lane ─────────────────────────────────────────────────────────────

export type LaneAxis = 'horizontal' | 'vertical';

export interface WheelInput {
  deltaX: number;
  deltaY: number;
}

/**
 * How far a wheel notch moves the lane. A horizontal lane answers to a
 * vertical wheel too, which is the only way a plain mouse can drive it;
 * whichever axis the gesture is stronger on wins.
 */
export function laneWheelDelta(wheel: WheelInput, axis: LaneAxis): number {
  if (axis === 'vertical') return wheel.deltaY;
  return Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) ? wheel.deltaX : wheel.deltaY;
}

// ── A–Z rail ──────────────────────────────────────────────────────────────

/** The rail bucket a name falls in: its first letter, or "#" for the rest. */
export function indexLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** The buckets present in this folder, A–Z first and "#" last. */
export function railLetters(entries: readonly Pick<DirEntry, 'name'>[]): string[] {
  const present = new Set(entries.map((e) => indexLetter(e.name)));
  const letters = [...present].filter((l) => l !== '#').sort();
  if (present.has('#')) letters.push('#');
  return letters;
}

/** The path of the first entry in a bucket, in the order the view shows them. */
export function firstWithLetter(
  entries: readonly Pick<DirEntry, 'name' | 'path'>[],
  letter: string,
): string | null {
  return entries.find((e) => indexLetter(e.name) === letter)?.path ?? null;
}

/** A box along one axis, in the scroll content's own coordinates. */
export interface Span {
  start: number;
  size: number;
}

/** A scroll port along one axis. */
export interface Port {
  scroll: number;
  size: number;
  content: number;
}

/**
 * Where a scroll port should be so that an item is visible in it.
 *
 * This exists instead of `Element.scrollIntoView`, which scrolls *every*
 * scrollable ancestor of the element — the lane, then the window body, then
 * whatever is above that. Moving the cursor along a row of cards therefore
 * dragged the whole of Files around, which is the sort of thing that reads as
 * the application being broken rather than the list being scrolled. A port
 * that scrolls itself and nothing else cannot do that.
 *
 * `center` puts the item in the middle where there is room; `nearest` moves
 * by the least it can, and not at all when the item is already whole.
 */
export function revealOffset(item: Span, port: Port, align: 'nearest' | 'center'): number {
  const furthest = Math.max(0, port.content - port.size);
  if (align === 'center') {
    return clampScroll(item.start + item.size / 2 - port.size / 2, furthest);
  }
  // An item bigger than the port cannot be shown whole; show its start,
  // which is where its name and its icon are.
  if (item.size >= port.size) return clampScroll(item.start, furthest);
  if (item.start < port.scroll) return clampScroll(item.start, furthest);
  const overshoot = item.start + item.size - (port.scroll + port.size);
  if (overshoot > 0) return clampScroll(port.scroll + overshoot, furthest);
  return port.scroll;
}

function clampScroll(value: number, furthest: number): number {
  return Math.max(0, Math.min(furthest, value));
}
