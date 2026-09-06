/**
 * What the window remembers between sessions, in `~/.config/archive.json`:
 * how the table is sorted, whether sizes read as exact byte counts, and
 * whether the details panel is open. The file is text a user can edit, so
 * nothing read out of it is trusted.
 */

import { DEFAULT_SORT, SORT_COLUMNS, type SortColumn, type SortState } from './tree';

export interface ArchivePrefs {
  sort: SortState;
  /** Print sizes as exact byte counts rather than rounded. */
  exactBytes: boolean;
  showDetails: boolean;
}

export const DEFAULT_PREFS: ArchivePrefs = {
  sort: DEFAULT_SORT,
  exactBytes: false,
  showDetails: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readSort(value: unknown): SortState {
  if (!isRecord(value)) return DEFAULT_SORT;
  const column = SORT_COLUMNS.includes(value.column as SortColumn)
    ? (value.column as SortColumn)
    : DEFAULT_SORT.column;
  const direction = value.direction === 'desc' ? 'desc' : 'asc';
  return { column, direction };
}

export function normalizePrefs(raw: unknown): ArchivePrefs {
  if (!isRecord(raw)) return DEFAULT_PREFS;
  return {
    sort: readSort(raw.sort),
    exactBytes: raw.exactBytes === true,
    showDetails: raw.showDetails !== false,
  };
}
