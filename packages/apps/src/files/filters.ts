/**
 * Pure filtering and multi-level sorting for the Files list. No React, no
 * VFS calls: everything here takes entries and a description of what the
 * user asked for and returns a new array.
 */
import { type DirEntry, type FileCategory, fileCategory, typeInfo } from '@lumen/vfs';
import type { SortColumn, SortDirection, SortState } from './logic';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** "Folder" for directories, otherwise the type label ("PNG Image", "Markdown"). */
export function kindLabel(entry: Pick<DirEntry, 'kind' | 'path'>): string {
  return entry.kind === 'directory' ? 'Folder' : typeInfo(entry.path).label;
}

// ── filters ───────────────────────────────────────────────────────────────

export type KindFilter =
  | 'any'
  | 'folders'
  | 'documents'
  | 'images'
  | 'audio'
  | 'video'
  | 'code'
  | 'archives';

/** Which file categories each kind bucket accepts. Folders are handled apart. */
const KIND_CATEGORIES: Record<
  Exclude<KindFilter, 'any' | 'folders'>,
  ReadonlyArray<FileCategory>
> = {
  documents: ['text', 'markdown', 'document', 'pdf', 'spreadsheet', 'presentation'],
  images: ['image'],
  audio: ['audio'],
  video: ['video'],
  code: ['code', 'script', 'data'],
  archives: ['archive'],
};

export const KIND_FILTERS: ReadonlyArray<{ id: KindFilter; label: string }> = [
  { id: 'any', label: 'Any Kind' },
  { id: 'folders', label: 'Folders' },
  { id: 'documents', label: 'Documents' },
  { id: 'images', label: 'Images' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'code', label: 'Code' },
  { id: 'archives', label: 'Archives' },
];

export type SizeFilter = 'any' | 'small' | 'medium' | 'large';

const MB = 1024 * 1024;
/** Upper bound of each bucket, in bytes; the last one is open-ended. */
const SIZE_BOUNDS: Record<Exclude<SizeFilter, 'any'>, { min: number; max: number }> = {
  small: { min: 0, max: MB },
  medium: { min: MB, max: 100 * MB },
  large: { min: 100 * MB, max: Number.POSITIVE_INFINITY },
};

export const SIZE_FILTERS: ReadonlyArray<{ id: SizeFilter; label: string }> = [
  { id: 'any', label: 'Any Size' },
  { id: 'small', label: 'Under 1 MB' },
  { id: 'medium', label: '1 MB to 100 MB' },
  { id: 'large', label: 'Over 100 MB' },
];

export type DateFilter = 'any' | 'today' | 'week' | 'month' | 'year';

export const DATE_FILTERS: ReadonlyArray<{ id: DateFilter; label: string }> = [
  { id: 'any', label: 'Any Date' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Past 7 Days' },
  { id: 'month', label: 'Past 30 Days' },
  { id: 'year', label: 'Past Year' },
];

const DAY = 24 * 60 * 60 * 1000;

/** The earliest modification time a `DateFilter` accepts, given "now". */
export function dateFloor(filter: DateFilter, now: number): number {
  switch (filter) {
    case 'today': {
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      return midnight.getTime();
    }
    case 'week':
      return now - 7 * DAY;
    case 'month':
      return now - 30 * DAY;
    case 'year':
      return now - 365 * DAY;
    default:
      return Number.NEGATIVE_INFINITY;
  }
}

export interface FilterState {
  kind: KindFilter;
  size: SizeFilter;
  modified: DateFilter;
  /** Glob (`*`, `?`) when it has a wildcard, otherwise a plain substring. */
  pattern: string;
}

export const NO_FILTER: FilterState = { kind: 'any', size: 'any', modified: 'any', pattern: '' };

export function isFiltering(filter: FilterState): boolean {
  return (
    filter.kind !== 'any' ||
    filter.size !== 'any' ||
    filter.modified !== 'any' ||
    filter.pattern.trim() !== ''
  );
}

const SPECIAL = /[.+^${}()|[\]\\]/g;

/** `*` matches any run of characters, `?` exactly one; everything else is literal. */
export function globToRegExp(pattern: string): RegExp {
  const body = pattern.replace(SPECIAL, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${body}$`, 'i');
}

/**
 * A pattern with `*` or `?` is matched as a glob against the whole name;
 * one without is matched as a substring, which is what people type first.
 */
export function matchesPattern(name: string, pattern: string): boolean {
  const p = pattern.trim();
  if (p === '') return true;
  if (/[*?]/.test(p)) return globToRegExp(p).test(name);
  return name.toLowerCase().includes(p.toLowerCase());
}

export function matchesKind(entry: DirEntry, kind: KindFilter): boolean {
  if (kind === 'any') return true;
  if (kind === 'folders') return entry.kind === 'directory';
  if (entry.kind === 'directory') return false;
  return KIND_CATEGORIES[kind].includes(fileCategory(entry.path));
}

/** Folders carry no meaningful size, so any size bucket drops them. */
export function matchesSize(entry: DirEntry, size: SizeFilter): boolean {
  if (size === 'any') return true;
  if (entry.kind === 'directory') return false;
  const { min, max } = SIZE_BOUNDS[size];
  return entry.size >= min && entry.size < max;
}

export function matchesFilter(entry: DirEntry, filter: FilterState, now: number): boolean {
  return (
    matchesKind(entry, filter.kind) &&
    matchesSize(entry, filter.size) &&
    entry.modifiedAt >= dateFloor(filter.modified, now) &&
    matchesPattern(entry.name, filter.pattern)
  );
}

/** Keeps the incoming order; sorting is a separate step. */
export function applyFilter(
  entries: readonly DirEntry[],
  filter: FilterState,
  now: number = Date.now(),
): DirEntry[] {
  if (!isFiltering(filter)) return [...entries];
  return entries.filter((e) => matchesFilter(e, filter, now));
}

const labelOf = <T extends string>(list: ReadonlyArray<{ id: T; label: string }>, id: T): string =>
  list.find((o) => o.id === id)?.label ?? id;

/** One line naming every active filter, for the status bar. Empty when none is. */
export function filterSummary(filter: FilterState): string {
  const parts: string[] = [];
  if (filter.kind !== 'any') parts.push(labelOf(KIND_FILTERS, filter.kind));
  if (filter.size !== 'any') parts.push(labelOf(SIZE_FILTERS, filter.size));
  if (filter.modified !== 'any') parts.push(labelOf(DATE_FILTERS, filter.modified));
  const pattern = filter.pattern.trim();
  if (pattern !== '') parts.push(`Name ${pattern}`);
  return parts.join(' · ');
}

// ── multi-level sorting ───────────────────────────────────────────────────

export interface SortRule {
  key: SortColumn;
  direction: SortDirection;
}

/**
 * A comparison read top to bottom: folders before files when asked, then each
 * rule in turn until one of them separates the two entries.
 */
export interface SortPlan {
  foldersFirst: boolean;
  rules: readonly SortRule[];
}

/** The plan a single toolbar choice means: the chosen key, then name. */
export function sortPlanFor(sort: SortState, foldersFirst = true): SortPlan {
  const first: SortRule = { key: sort.column, direction: sort.direction };
  return {
    foldersFirst,
    rules: sort.column === 'name' ? [first] : [first, { key: 'name', direction: 'asc' }],
  };
}

function compareKey(key: SortColumn, a: DirEntry, b: DirEntry): number {
  switch (key) {
    case 'date':
      return a.modifiedAt - b.modifiedAt;
    case 'size':
      return a.size - b.size;
    case 'kind':
      return collator.compare(kindLabel(a), kindLabel(b));
    default:
      return collator.compare(a.name, b.name);
  }
}

export function comparePlan(plan: SortPlan): (a: DirEntry, b: DirEntry) => number {
  return (a, b) => {
    if (plan.foldersFirst && a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    for (const rule of plan.rules) {
      const cmp = compareKey(rule.key, a, b);
      if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}

export function sortWithPlan(entries: readonly DirEntry[], plan: SortPlan): DirEntry[] {
  return [...entries].sort(comparePlan(plan));
}
