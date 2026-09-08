/**
 * The biggest files the scan found, with the two things worth doing to one:
 * open the folder it is in, or move it to the Trash. Paths are shown relative
 * to the scanned folder so the column reads as a location rather than a wall
 * of repeated prefix.
 */

import { usePlural, useT } from '@lumen/kernel/react';
import { Button, type Column, DataTable, EmptyState, Toolbar, ToolbarSpacer } from '@lumen/ui';
import { formatBytes, relative } from '@lumen/vfs';
import { FolderOpen, HardDrive, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateTime } from '../_sdk';
import type { ScanFile } from './scan';

export interface LargestFilesProps {
  files: readonly ScanFile[];
  /** The folder the scan started from; paths are shown relative to it. */
  root: string;
  onReveal: (path: string) => void;
  onTrash: (paths: string[]) => void;
  busy: boolean;
}

interface FileRow extends ScanFile {
  location: string;
}

export function LargestFiles({ files, root, onReveal, onTrash, busy }: LargestFilesProps) {
  const t = useT();
  const plural = usePlural();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>({
    column: 'size',
    direction: 'desc',
  });
  const rows = useMemo<FileRow[]>(
    () => files.map((file) => ({ ...file, location: relative(root, file.path) })),
    [files, root],
  );
  const chosen = useMemo(() => rows.filter((row) => selected.has(row.path)), [rows, selected]);

  const columns = useMemo<Column<FileRow>[]>(
    () => [
      {
        id: 'location',
        header: t('storageApp.path'),
        width: 'minmax(160px,1fr)',
        sortable: true,
        mono: true,
        accessor: (row) => row.location,
      },
      {
        id: 'size',
        header: t('storageApp.size'),
        width: '110px',
        align: 'right',
        sortable: true,
        mono: true,
        accessor: (row) => row.size,
        render: (row) => formatBytes(row.size),
      },
      {
        id: 'modified',
        header: t('storageApp.modified'),
        width: '170px',
        sortable: true,
        mono: true,
        accessor: (row) => row.modifiedAt,
        render: (row) => (row.modifiedAt > 0 ? formatDateTime(row.modifiedAt) : '—'),
      },
    ],
    [t],
  );

  const first = chosen[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar dense>
        <span className="mono text-xs tabular-nums text-ink-2">
          {plural('count.largestFiles', rows.length)}
        </span>
        <ToolbarSpacer />
        <Button
          size="sm"
          icon={<FolderOpen className="size-3.5" />}
          disabled={chosen.length !== 1 || !first}
          onClick={() => first && onReveal(first.path)}
        >
          {t('menu.revealInFiles')}
        </Button>
        <Button
          size="sm"
          icon={<Trash2 className="size-3.5" />}
          disabled={chosen.length === 0 || busy}
          onClick={() => onTrash(chosen.map((row) => row.path))}
        >
          {t('desktop.moveToTrash')}
        </Button>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.path}
        selected={selected}
        onSelect={(keys) => setSelected(keys)}
        onActivate={(row) => onReveal(row.path)}
        sort={sort}
        onSortChange={setSort}
        emptyState={
          <EmptyState
            icon={<HardDrive />}
            title={t('storageApp.noFilesFound')}
            description={t('storageApp.scanFoundNothing')}
          />
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
