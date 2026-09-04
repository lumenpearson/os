import { type Column, cx, DataTable } from '@lumen/ui';
import { type DirEntry, formatBytes } from '@lumen/vfs';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { FileTypeIcon, formatRelative } from '../_sdk';
import { kindLabel, rankMap, type SortState } from './logic';
import { RenameInput } from './RenameInput';
import type { EntryHandlers, EntryViewState } from './types';

export interface ListViewProps extends EntryHandlers, EntryViewState {
  entries: readonly DirEntry[];
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Content width, to drop columns when the pane is narrow. */
  width: number;
  emptyState?: ReactNode;
}

const rowKey = (row: DirEntry) => row.path;

/** The list: a sortable DataTable of Name, Date Modified, Size and Kind. */
export function ListView({
  entries,
  sort,
  onSortChange,
  width,
  emptyState,
  selection,
  renaming,
  cutPaths,
  dropTarget,
  focused,
  onSelectionChange,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onRenameCommit,
  onRenameCancel,
}: ListViewProps) {
  const ranks = useMemo(() => rankMap(entries, sort.direction), [entries, sort.direction]);

  const columns = useMemo<Column<DirEntry>[]>(() => {
    const rank = (row: DirEntry) => ranks.get(row.path) ?? 0;
    const cols: Column<DirEntry>[] = [
      {
        id: 'name',
        header: 'Name',
        width: 'minmax(140px, 1fr)',
        sortable: true,
        accessor: rank,
        render: (row) => (
          <span data-path={row.path} className="flex h-full items-center gap-2 truncate-1">
            <FileTypeIcon entry={row} size={16} className={cx(cutPaths.has(row.path) && 'opacity-50')} />
            {renaming === row.path ? (
              <RenameInput path={row.path} onCommit={(name) => onRenameCommit(row.path, name)} onCancel={onRenameCancel} />
            ) : (
              <span className={cx('truncate-1', cutPaths.has(row.path) && 'opacity-50')}>{row.name}</span>
            )}
          </span>
        ),
      },
    ];
    if (width >= 400) {
      cols.push({
        id: 'date',
        header: 'Date Modified',
        width: 'minmax(96px, 150px)',
        sortable: true,
        mono: true,
        accessor: rank,
        render: (row) => (
          <span data-path={row.path} className="block truncate-1">
            {formatRelative(row.modifiedAt)}
          </span>
        ),
      });
    }
    cols.push({
      id: 'size',
      header: 'Size',
      width: '84px',
      align: 'right',
      sortable: true,
      mono: true,
      accessor: rank,
      render: (row) => (
        <span data-path={row.path} className="block truncate-1">
          {row.kind === 'directory' ? '—' : formatBytes(row.size)}
        </span>
      ),
    });
    if (width >= 520) {
      cols.push({
        id: 'kind',
        header: 'Kind',
        width: 'minmax(80px, 150px)',
        sortable: true,
        accessor: rank,
        render: (row) => (
          <span data-path={row.path} className="block truncate-1 text-ink-2">
            {kindLabel(row)}
          </span>
        ),
      });
    }
    return cols;
  }, [ranks, width, renaming, cutPaths, onRenameCommit, onRenameCancel]);

  return (
    <DataTable
      columns={columns}
      rows={entries as DirEntry[]}
      rowKey={rowKey}
      selected={selection.keys}
      onSelect={(keys, anchor) => onSelectionChange({ keys, anchor, cursor: anchor })}
      onActivate={onOpen}
      onContextMenu={(row, e) => onContextMenu(row, e)}
      sort={sort}
      onSortChange={(s) => {
        if (s) onSortChange({ column: s.column as SortState['column'], direction: s.direction });
      }}
      focused={focused}
      draggable
      onDragStart={onDragStart}
      onDragOverRow={onDragOver}
      onDropRow={onDrop}
      rowClassName={(row) =>
        row.path === dropTarget ? 'bg-selection outline-2 -outline-offset-2 outline-accent' : undefined
      }
      emptyState={emptyState}
    />
  );
}
