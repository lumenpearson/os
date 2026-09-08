/** Persisted view state: which tab, how often it samples, how it is sorted. */
import type { ProcessColumnId } from './processes';
import type { SortDirection, SortState } from './sort';

export const TAB_IDS = ['processes', 'performance', 'services', 'apps'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** Sampling intervals offered in View → Refresh Rate. */
export const REFRESH_RATES = [1000, 2000, 5000] as const;

/** Samples kept per chart; at 1 s that is the last minute. */
export const SERIES_CAPACITY = 60;

const COLUMNS: readonly ProcessColumnId[] = ['name', 'pid', 'windows', 'state', 'uptime', 'memory'];

export interface TaskManagerConfig {
  tab: TabId;
  refreshMs: number;
  sort: SortState<ProcessColumnId>;
}

export const DEFAULT_CONFIG: TaskManagerConfig = {
  tab: 'processes',
  refreshMs: 1000,
  sort: { column: 'name', direction: 'asc' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The config file is user-editable, so every field is checked on the way in. */
export function normalizeConfig(value: unknown): TaskManagerConfig {
  if (!isRecord(value)) return DEFAULT_CONFIG;
  const tab = TAB_IDS.find((t) => t === value.tab) ?? DEFAULT_CONFIG.tab;
  const refreshMs = REFRESH_RATES.find((r) => r === value.refreshMs) ?? DEFAULT_CONFIG.refreshMs;
  const raw = isRecord(value.sort) ? value.sort : {};
  const column = COLUMNS.find((c) => c === raw.column) ?? DEFAULT_CONFIG.sort.column;
  const direction: SortDirection = raw.direction === 'desc' ? 'desc' : 'asc';
  return { tab, refreshMs, sort: { column, direction } };
}
