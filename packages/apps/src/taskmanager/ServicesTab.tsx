/**
 * The services the system runs that are not applications.
 *
 * The Kind column is the one to read first. A service marked "system" is code
 * in this repository doing the job the row describes; one marked "declared" is
 * a job the machine plainly has to do, named and pointed at the settings that
 * configure it, and not pretending to be running. Both are listed because both
 * are true, and the table says which is which rather than letting the reader
 * assume.
 */

import {
  SERVICES,
  type ServiceCategory,
  type ServiceDefinition,
  type ServiceState,
  useServiceStore,
} from '@lumen/kernel';
import { type Column, DataTable, RowAction, Select, useElementSize } from '@lumen/ui';
import { useMemo, useState } from 'react';
import { rankMap, type SortState, type SortValue, sortRows, toggleSort } from './sort';

export interface ServiceRow {
  service: ServiceDefinition;
  state: ServiceState;
  startedAt: number | null;
  essential: boolean;
}

type ServiceColumnId = 'name' | 'id' | 'category' | 'state' | 'kind' | 'startup';

const key = (row: ServiceRow) => row.service.id;
const ID_AT = 640;
const CATEGORY_AT = 520;
const STARTUP_AT = 780;

/** Most active first, so what is running is at the top when sorted by state. */
const STATE_RANK: Record<ServiceState, number> = { running: 0, 'on-demand': 1, stopped: 2 };

const STATE_LABEL: Record<ServiceState, string> = {
  running: 'Running',
  'on-demand': 'On demand',
  stopped: 'Stopped',
};

export function sortValue(row: ServiceRow, column: ServiceColumnId): SortValue {
  switch (column) {
    case 'name':
      return row.service.name;
    case 'id':
      return row.service.id;
    case 'category':
      return row.service.category;
    case 'state':
      return STATE_RANK[row.state];
    case 'kind':
      return row.service.implemented ? 0 : 1;
    case 'startup':
      return row.service.startup;
  }
}

/** Categories that have at least one service, plus "all". */
export function categoryOptions(): Array<{ value: string; label: string }> {
  const seen = new Set<ServiceCategory>(SERVICES.map((s) => s.category));
  return [
    { value: 'all', label: 'All categories' },
    ...[...seen].sort().map((category) => ({
      value: category,
      label: category.charAt(0).toUpperCase() + category.slice(1),
    })),
  ];
}

export function ServicesTab() {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const statuses = useServiceStore((s) => s.statuses);
  const essential = useServiceStore((s) => s.isEssential);
  const [sort, setSort] = useState<SortState<ServiceColumnId>>({
    column: 'name',
    direction: 'asc',
  });
  const [category, setCategory] = useState('all');
  const width = size.width;

  const rows = useMemo(() => {
    const all: ServiceRow[] = SERVICES.filter(
      (service) => category === 'all' || service.category === category,
    ).map((service) => ({
      service,
      state: statuses[service.id]?.state ?? 'stopped',
      startedAt: statuses[service.id]?.startedAt ?? null,
      essential: essential(service.id),
    }));
    return sortRows(all, (row) => sortValue(row, sort.column), sort.direction);
  }, [statuses, essential, sort, category]);

  const ranks = useMemo(() => rankMap(rows, key, sort.direction), [rows, sort.direction]);

  const columns = useMemo<Column<ServiceRow>[]>(() => {
    const rank = (row: ServiceRow) => ranks.get(key(row)) ?? 0;
    const cols: Column<ServiceRow>[] = [
      {
        id: 'name',
        header: 'Name',
        width: 'minmax(160px, 1fr)',
        sortable: true,
        accessor: rank,
        render: (row) => (
          <span className="flex h-full min-w-0 flex-col justify-center">
            <span className="truncate-1">{row.service.name}</span>
            <span className="truncate-1 text-xs text-ink-3">{row.service.description}</span>
          </span>
        ),
      },
    ];
    if (width === 0 || width >= ID_AT) {
      cols.push({
        id: 'id',
        header: 'Identifier',
        width: 'minmax(150px, 230px)',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => row.service.id,
      });
    }
    if (width === 0 || width >= CATEGORY_AT) {
      cols.push({
        id: 'category',
        header: 'Category',
        width: '112px',
        sortable: true,
        accessor: rank,
        render: (row) => row.service.category,
      });
    }
    if (width === 0 || width >= STARTUP_AT) {
      cols.push({
        id: 'startup',
        header: 'Starts',
        width: '96px',
        sortable: true,
        accessor: rank,
        render: (row) => row.service.startup,
      });
    }
    cols.push({
      id: 'kind',
      header: 'Kind',
      width: '96px',
      mono: true,
      sortable: true,
      accessor: rank,
      render: (row) => (row.service.implemented ? 'system' : 'declared'),
    });
    cols.push({
      id: 'state',
      header: 'State',
      width: '104px',
      mono: true,
      sortable: true,
      accessor: rank,
      render: (row) => STATE_LABEL[row.state],
    });
    cols.push({
      id: 'actions',
      header: '',
      width: '88px',
      align: 'right',
      accessor: () => '',
      render: (row) =>
        row.state === 'running' ? (
          <RowAction
            danger
            disabled={row.essential}
            title={row.essential ? 'The system requires this service' : undefined}
            onClick={() => useServiceStore.getState().stop(row.service.id)}
          >
            Stop
          </RowAction>
        ) : (
          <RowAction onClick={() => useServiceStore.getState().start(row.service.id, Date.now())}>
            Start
          </RowAction>
        ),
    });
    return cols;
  }, [ranks, width]);

  const running = rows.filter((row) => row.state === 'running').length;

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-canvas px-2 py-1.5">
        <Select
          size="sm"
          aria-label="Category"
          options={categoryOptions()}
          value={category}
          onChange={setCategory}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={key}
        rowHeight={38}
        sort={sort}
        onSortChange={(next) => {
          if (next) setSort(toggleSort(sort, next.column as ServiceColumnId));
        }}
      />
      <div className="shrink-0 border-t border-rule bg-canvas px-2 py-1.5">
        <p className="mono truncate-1 text-sm text-ink-3 tabular-nums">
          {rows.length} services · {running} running ·{' '}
          {rows.filter((row) => row.service.implemented).length} implemented here
        </p>
      </div>
    </div>
  );
}
