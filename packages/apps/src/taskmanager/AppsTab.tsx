/**
 * Every app the kernel has registered: what it is, the window it opens with,
 * and whether it is running now. Launch or quit from the same row.
 */
import type { AppDefinition, AppId, Pid } from '@lumen/kernel';
import { Button, type Column, DataTable, useElementSize } from '@lumen/ui';
import { useMemo, useState } from 'react';
import { EM_DASH } from './format';
import { rankMap, type SortState, type SortValue, sortRows, toggleSort } from './sort';

export interface AppRow {
  app: AppDefinition;
  pids: Pid[];
}

export interface AppsTabProps {
  apps: readonly AppDefinition[];
  /** Running processes by app id, from the kernel's process table. */
  running: ReadonlyMap<AppId, Pid[]>;
  onLaunch: (appId: AppId) => void;
  onQuit: (pids: Pid[]) => void;
}

type AppColumnId = 'name' | 'id' | 'category' | 'window' | 'status';

const key = (row: AppRow) => row.app.id;
const ID_AT = 560;
const CATEGORY_AT = 460;
const WINDOW_AT = 680;

function sortValue(row: AppRow, column: AppColumnId): SortValue {
  switch (column) {
    case 'name':
      return row.app.name;
    case 'id':
      return row.app.id;
    case 'category':
      return row.app.category;
    case 'window':
      return row.app.window.width * row.app.window.height;
    case 'status':
      return row.pids.length;
  }
}

export function AppsTab({ apps, running, onLaunch, onQuit }: AppsTabProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [sort, setSort] = useState<SortState<AppColumnId>>({ column: 'name', direction: 'asc' });
  const width = size.width;

  const rows = useMemo(() => {
    const all = apps.map((app) => ({ app, pids: running.get(app.id) ?? [] }));
    return sortRows(all, (row) => sortValue(row, sort.column), sort.direction);
  }, [apps, running, sort]);

  const ranks = useMemo(() => rankMap(rows, key, sort.direction), [rows, sort.direction]);

  const columns = useMemo<Column<AppRow>[]>(() => {
    const rank = (row: AppRow) => ranks.get(key(row)) ?? 0;
    const cols: Column<AppRow>[] = [
      {
        id: 'name',
        header: 'Name',
        width: 'minmax(150px, 1fr)',
        sortable: true,
        accessor: rank,
        render: (row) => {
          const Icon = row.app.icon;
          return (
            <span className="flex h-full items-center gap-2">
              <Icon size={16} />
              <span className="truncate-1">{row.app.name}</span>
              {row.app.hidden && <span className="mono shrink-0 text-xs text-ink-3">hidden</span>}
            </span>
          );
        },
      },
    ];
    if (width === 0 || width >= ID_AT) {
      cols.push({
        id: 'id',
        header: 'Identifier',
        width: 'minmax(120px, 180px)',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => row.app.id,
      });
    }
    if (width === 0 || width >= CATEGORY_AT) {
      cols.push({
        id: 'category',
        header: 'Category',
        width: '104px',
        sortable: true,
        accessor: rank,
        render: (row) => row.app.category,
      });
    }
    if (width === 0 || width >= WINDOW_AT) {
      cols.push({
        id: 'window',
        header: 'Window',
        width: '104px',
        align: 'right',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => `${row.app.window.width}×${row.app.window.height}`,
      });
    }
    cols.push({
      id: 'status',
      header: 'Status',
      width: '96px',
      mono: true,
      sortable: true,
      accessor: rank,
      render: (row) =>
        row.pids.length === 0
          ? EM_DASH
          : row.pids.length === 1
            ? `pid ${row.pids[0]}`
            : `${row.pids.length} pids`,
    });
    cols.push({
      id: 'actions',
      header: '',
      width: '128px',
      align: 'right',
      accessor: () => '',
      render: (row) => (
        <span className="flex h-full items-center justify-end gap-1">
          <Button size="sm" onClick={() => onLaunch(row.app.id)}>
            {row.pids.length > 0 && row.app.singleton ? 'Show' : 'Launch'}
          </Button>
          {row.pids.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onQuit(row.pids)}>
              Quit
            </Button>
          )}
        </span>
      ),
    });
    return cols;
  }, [ranks, width, onLaunch, onQuit]);

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={key}
        rowHeight={30}
        onActivate={(row) => onLaunch(row.app.id)}
        sort={sort}
        onSortChange={(next) => {
          if (next) setSort(toggleSort(sort, next.column as AppColumnId));
        }}
      />
      <div className="shrink-0 border-t border-rule bg-canvas px-2 py-1.5">
        <p className="mono truncate-1 text-sm text-ink-3 tabular-nums">
          {apps.length} apps registered · {[...running.values()].flat().length} processes running
        </p>
      </div>
    </div>
  );
}
