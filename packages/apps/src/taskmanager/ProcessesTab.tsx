/**
 * The live process table. Rows arrive already sorted; the uptime column
 * updates itself through a ref so the second hand costs no re-render.
 */
import type { AppDefinition, AppId, Pid } from '@lumen/kernel';
import {
  AnchoredMenu,
  Button,
  type Column,
  DataTable,
  EmptyState,
  useContextMenu,
  useElementSize,
} from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { Box } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { EM_DASH, formatUptime } from './format';
import { PROCESS_STATE_LABEL, type ProcessColumnId, type ProcessRow } from './processes';
import { rankMap, type SortState } from './sort';
import { useTick } from './tick';

export interface ProcessesTabProps {
  /** Ordered exactly as the table shows them. */
  rows: ProcessRow[];
  apps: ReadonlyMap<AppId, AppDefinition>;
  sort: SortState<ProcessColumnId>;
  onSortChange: (sort: SortState<ProcessColumnId>) => void;
  selection: ReadonlySet<Pid>;
  onSelectionChange: (pids: Set<Pid>) => void;
  /** Note explaining the em-dashes in the memory column, if any. */
  memoryNote: string | null;
  onFocusWindow: (row: ProcessRow) => void;
  onEndProcess: (pids: Pid[]) => void;
  onQuitApp: (pids: Pid[]) => void;
}

const key = (row: ProcessRow) => String(row.pid);

/** Column widths add up to 540px; narrower windows drop the optional ones. */
const STATE_AT = 460;
const WINDOWS_AT = 540;
const MEMORY_AT = 620;

export function ProcessesTab({
  rows,
  apps,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  memoryNote,
  onFocusWindow,
  onEndProcess,
  onQuitApp,
}: ProcessesTabProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const menu = useContextMenu();
  const [menuPid, setMenuPid] = useState<Pid | null>(null);

  const ranks = useMemo(() => rankMap(rows, key, sort.direction), [rows, sort.direction]);
  const selectedKeys = useMemo(
    () => new Set([...selection].map((pid) => String(pid))),
    [selection],
  );
  const selectedRows = useMemo(() => rows.filter((r) => selection.has(r.pid)), [rows, selection]);
  const single = selectedRows.length === 1 ? selectedRows[0] : null;
  const width = size.width;

  const columns = useMemo<Column<ProcessRow>[]>(() => {
    const rank = (row: ProcessRow) => ranks.get(key(row)) ?? 0;
    const cols: Column<ProcessRow>[] = [
      {
        id: 'name',
        header: 'Name',
        width: 'minmax(140px, 1fr)',
        sortable: true,
        accessor: rank,
        render: (row) => {
          const Icon = apps.get(row.appId)?.icon;
          return (
            <span className="flex h-full items-center gap-2">
              {Icon ? (
                <Icon size={16} />
              ) : (
                <Box className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
              )}
              <span className="truncate-1">{row.name}</span>
              {row.unsaved && <span className="mono shrink-0 text-xs text-ink-3">unsaved</span>}
            </span>
          );
        },
      },
      {
        id: 'pid',
        header: 'PID',
        width: '64px',
        align: 'right',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => row.pid,
      },
    ];
    if (width === 0 || width >= STATE_AT) {
      cols.push({
        id: 'state',
        header: 'State',
        width: '104px',
        sortable: true,
        accessor: rank,
        render: (row) => PROCESS_STATE_LABEL[row.state],
      });
    }
    if (width === 0 || width >= WINDOWS_AT) {
      cols.push({
        id: 'windows',
        header: 'Windows',
        width: '80px',
        align: 'right',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => row.windowIds.length,
      });
    }
    cols.push({
      id: 'uptime',
      header: 'Uptime',
      width: '88px',
      align: 'right',
      mono: true,
      sortable: true,
      accessor: rank,
      render: (row) => <Uptime startedAt={row.startedAt} />,
    });
    if (width === 0 || width >= MEMORY_AT) {
      cols.push({
        id: 'memory',
        header: 'Memory',
        width: '88px',
        align: 'right',
        mono: true,
        sortable: true,
        accessor: rank,
        render: (row) => (row.memory === null ? EM_DASH : formatBytes(row.memory)),
      });
    }
    return cols;
  }, [ranks, apps, width]);

  const contextRow = rows.find((r) => r.pid === menuPid) ?? null;

  return (
    <div
      ref={ref}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key !== 'Delete' || selection.size === 0) return;
        // Claims the key so the menubar's Delete shortcut does not repeat it.
        e.preventDefault();
        onEndProcess([...selection]);
      }}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={key}
        selected={selectedKeys}
        onSelect={(keys) => onSelectionChange(new Set([...keys].map(Number)))}
        onActivate={onFocusWindow}
        onContextMenu={(row, e) => {
          setMenuPid(row.pid);
          menu.openAt(e);
        }}
        sort={sort}
        onSortChange={(next) => {
          if (next) {
            onSortChange({ column: next.column as ProcessColumnId, direction: next.direction });
          }
        }}
        emptyState={<EmptyState title="No processes" description="Nothing is running." />}
      />
      <div className="flex shrink-0 items-center gap-3 border-t border-rule bg-canvas px-2 py-1.5">
        <p className="mono min-w-0 truncate-1 text-sm text-ink-3 tabular-nums">
          {rows.length} processes
          {memoryNote ? ` · ${memoryNote}` : ''}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            disabled={!single?.windowIds.length}
            onClick={() => single && onFocusWindow(single)}
          >
            Focus Window
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={selection.size === 0}
            onClick={() => onEndProcess([...selection])}
          >
            End Process
          </Button>
        </div>
      </div>
      <AnchoredMenu
        open={menu.open && contextRow !== null}
        at={menu.at}
        onClose={() => {
          menu.close();
          setMenuPid(null);
        }}
        items={
          contextRow
            ? [
                {
                  id: 'focus',
                  label: 'Focus Window',
                  enabled: contextRow.windowIds.length > 0,
                  onSelect: () => onFocusWindow(contextRow),
                },
                { id: 'quit', label: 'Quit App', onSelect: () => onQuitApp([contextRow.pid]) },
                { type: 'separator' },
                {
                  id: 'end',
                  label: 'End Process',
                  danger: true,
                  onSelect: () => onEndProcess([contextRow.pid]),
                },
              ]
            : []
        }
      />
    </div>
  );
}

/** Ticks once a second by writing text, so the table does not re-render. */
function Uptime({ startedAt }: { startedAt: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useTick((now) => {
    const el = ref.current;
    if (el) el.textContent = formatUptime(now - startedAt);
  });
  return <span ref={ref}>{formatUptime(Date.now() - startedAt)}</span>;
}
