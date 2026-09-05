/**
 * The Files window's own preferences: which view, how big the icons are,
 * which toolbar controls are shown, whether the sidebar and the A–Z rail
 * appear, the sort and the filters. They live in a JSON file under the
 * user's home (`~/.config/files.json`), read and written with `useJsonFile`
 * like every other app's preferences. Nothing here trusts the file: a hand
 * edited or half-written document falls back to the defaults, field by field.
 */
import { join } from '@lumen/vfs';
import {
  DATE_FILTERS,
  type DateFilter,
  type FilterState,
  KIND_FILTERS,
  type KindFilter,
  NO_FILTER,
  SIZE_FILTERS,
  type SizeFilter,
} from './filters';
import {
  isViewMode,
  type LaneAxis,
  SORT_COLUMNS,
  type SortColumn,
  type SortDirection,
  type SortState,
  type ViewMode,
} from './logic';

export type IconSize = 'small' | 'medium' | 'large';

export const ICON_SIZES: ReadonlyArray<{ id: IconSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/** Glyph size in pixels for the grid and the card lane. */
export const ICON_PIXELS: Record<IconSize, number> = { small: 32, medium: 48, large: 72 };

/** Card size along the lane's axis, in pixels; the focused card adds `CARD_GROWTH`. */
export const CARD_EXTENT: Record<IconSize, number> = { small: 120, medium: 156, large: 208 };
export const CARD_GROWTH = 40;

export const LANE_AXES: ReadonlyArray<{ id: LaneAxis; label: string }> = [
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'vertical', label: 'Vertical' },
];

/** Toolbar controls the user can show or hide, in the order they appear. */
export interface ToolbarParts {
  navigation: boolean;
  view: boolean;
  sort: boolean;
  filter: boolean;
  newFolder: boolean;
  sidebar: boolean;
  search: boolean;
}

export type ToolbarPart = keyof ToolbarParts;

export const TOOLBAR_PARTS: ReadonlyArray<{ id: ToolbarPart; label: string }> = [
  { id: 'navigation', label: 'Back, Forward, Up' },
  { id: 'view', label: 'View Switcher' },
  { id: 'sort', label: 'Sort' },
  { id: 'filter', label: 'Filter' },
  { id: 'newFolder', label: 'New Folder' },
  { id: 'sidebar', label: 'Sidebar Button' },
  { id: 'search', label: 'Search' },
];

export interface FilesPrefs {
  view: ViewMode;
  /** Which way the card lane runs. */
  cardAxis: LaneAxis;
  iconSize: IconSize;
  sidebar: boolean;
  /** The A–Z rail beside the file list. */
  indexRail: boolean;
  toolbar: ToolbarParts;
  sort: SortState;
  filter: FilterState;
}

export const DEFAULT_TOOLBAR: ToolbarParts = {
  navigation: true,
  view: true,
  sort: true,
  filter: true,
  newFolder: true,
  sidebar: true,
  search: true,
};

export const DEFAULT_PREFS: FilesPrefs = {
  view: 'list',
  cardAxis: 'horizontal',
  iconSize: 'medium',
  sidebar: true,
  indexRail: false,
  toolbar: DEFAULT_TOOLBAR,
  sort: { column: 'name', direction: 'asc' },
  filter: NO_FILTER,
};

/** `~/.config/files.json`. */
export function prefsPath(home: string): string {
  return join(home, '.config', 'files.json');
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

function oneOf<T extends string>(
  value: unknown,
  options: ReadonlyArray<{ id: T }>,
  fallback: T,
): T {
  return options.some((o) => o.id === value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSort(raw: unknown): SortState {
  const value = record(raw);
  const column = oneOf<SortColumn>(value.column, SORT_COLUMNS, DEFAULT_PREFS.sort.column);
  const direction: SortDirection = value.direction === 'desc' ? 'desc' : 'asc';
  return { column, direction };
}

function normalizeFilter(raw: unknown): FilterState {
  const value = record(raw);
  return {
    kind: oneOf<KindFilter>(value.kind, KIND_FILTERS, NO_FILTER.kind),
    size: oneOf<SizeFilter>(value.size, SIZE_FILTERS, NO_FILTER.size),
    modified: oneOf<DateFilter>(value.modified, DATE_FILTERS, NO_FILTER.modified),
    pattern: typeof value.pattern === 'string' ? value.pattern.slice(0, 200) : '',
  };
}

function normalizeToolbar(raw: unknown): ToolbarParts {
  const value = record(raw);
  const out = { ...DEFAULT_TOOLBAR };
  for (const part of TOOLBAR_PARTS) out[part.id] = bool(value[part.id], DEFAULT_TOOLBAR[part.id]);
  return out;
}

/**
 * `fallbackView` is the view chosen in Settings → Files, used until this
 * window's own file says otherwise.
 */
export function normalizePrefs(
  raw: unknown,
  fallbackView: ViewMode = DEFAULT_PREFS.view,
): FilesPrefs {
  const value = record(raw);
  return {
    view: isViewMode(value.view) ? value.view : fallbackView,
    cardAxis: oneOf<LaneAxis>(value.cardAxis, LANE_AXES, DEFAULT_PREFS.cardAxis),
    iconSize: oneOf<IconSize>(value.iconSize, ICON_SIZES, DEFAULT_PREFS.iconSize),
    sidebar: bool(value.sidebar, DEFAULT_PREFS.sidebar),
    indexRail: bool(value.indexRail, DEFAULT_PREFS.indexRail),
    toolbar: normalizeToolbar(value.toolbar),
    sort: normalizeSort(value.sort),
    filter: normalizeFilter(value.filter),
  };
}
