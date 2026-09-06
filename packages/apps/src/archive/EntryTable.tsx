// biome-ignore-all lint/a11y/useFocusableInteractive: the grid container is the tab stop and moves the cursor with the arrow keys; rows and cells are not focusable
/**
 * The list of entries: a tree drawn as a table.
 *
 * The container is the single tab stop and owns the keyboard, the way a grid
 * does — arrows move the cursor, Left and Right shut and open a folder, Space
 * adds to the selection. Rows are a CSS grid so the columns line up without a
 * `<table>`, and the whole thing scrolls inside its own box: below the width
 * the columns need, this scrolls sideways rather than pushing the window out.
 */

import { cx } from '@lumen/ui';
import { ChevronDown, ChevronRight, ChevronUp, File, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatDateTime } from '../_sdk';
import { formatRatio, formatSize } from './format';
import { columnTemplate } from './layout';
import type { ArchiveRow, SortColumn, SortState } from './tree';
import { SORT_LABELS } from './tree';

export interface EntryTableProps {
  rows: ArchiveRow[];
  columns: SortColumn[];
  minWidth: number;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  selected: ReadonlySet<string>;
  onSelect: (ids: Set<string>, cursor: string) => void;
  cursor: string | null;
  onCursor: (id: string) => void;
  onToggle: (id: string) => void;
  exactBytes: boolean;
  /** The window has focus, so a selection is drawn in the accent. */
  focused: boolean;
  empty: string;
}

const INDENT = 14;

function cellValue(row: ArchiveRow, column: SortColumn, exactBytes: boolean): string {
  const { node } = row;
  switch (column) {
    case 'name':
      return row.label;
    case 'size':
      return node.isDirectory && node.files === 0 ? '—' : formatSize(node.size, exactBytes);
    case 'packed':
      return node.isDirectory && node.files === 0 ? '—' : formatSize(node.packed, exactBytes);
    case 'ratio':
      return formatRatio(node.size, node.packed);
    case 'modified':
      return node.modifiedAt > 0 ? formatDateTime(node.modifiedAt) : '—';
  }
}

export function EntryTable({
  rows,
  columns,
  minWidth,
  sort,
  onSort,
  selected,
  onSelect,
  cursor,
  onCursor,
  onToggle,
  exactBytes,
  focused,
  empty,
}: EntryTableProps) {
  const template = columnTemplate(columns);
  const bodyRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  // Keep the cursor row in view when the keyboard moves it.
  useEffect(() => {
    if (!cursor) return;
    const row = bodyRef.current?.querySelector(`[data-row-id="${CSS.escape(cursor)}"]`);
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const index = cursor === null ? -1 : rows.findIndex((row) => row.node.id === cursor);

  const move = (to: number, extend: boolean) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (!row) return;
    const id = row.node.id;
    if (!extend) {
      anchor.current = id;
      onSelect(new Set([id]), id);
      return;
    }
    const from = rows.findIndex((r) => r.node.id === (anchor.current ?? id));
    const target = rows.findIndex((r) => r.node.id === id);
    const [lo, hi] = from < target ? [from, target] : [target, from];
    onSelect(new Set(rows.slice(lo, hi + 1).map((r) => r.node.id)), id);
  };

  const click = (row: ArchiveRow, e: React.PointerEvent) => {
    const id = row.node.id;
    if (e.shiftKey && anchor.current) {
      move(rows.indexOf(row), true);
      onCursor(id);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      anchor.current = id;
      onSelect(next, id);
      return;
    }
    anchor.current = id;
    onSelect(new Set([id]), id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    const row = index >= 0 ? rows[index] : undefined;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(index + 1, e.shiftKey);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(index <= 0 ? 0 : index - 1, e.shiftKey);
        break;
      case 'Home':
        e.preventDefault();
        move(0, e.shiftKey);
        break;
      case 'End':
        e.preventDefault();
        move(rows.length - 1, e.shiftKey);
        break;
      case 'ArrowRight':
        if (row?.node.isDirectory && !row.expanded) {
          e.preventDefault();
          onToggle(row.node.id);
        }
        break;
      case 'ArrowLeft':
        if (row?.node.isDirectory && row.expanded) {
          e.preventDefault();
          onToggle(row.node.id);
        }
        break;
      case 'Enter':
      case ' ':
        if (row?.node.isDirectory) {
          e.preventDefault();
          onToggle(row.node.id);
        }
        break;
      case 'a':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onSelect(new Set(rows.map((r) => r.node.id)), cursor ?? rows[0]?.node.id ?? '');
        }
        break;
    }
  };

  return (
    <div
      role="grid"
      aria-label="Archive contents"
      aria-multiselectable
      aria-rowcount={rows.length}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="lumen-focus flex h-full min-h-0 flex-col outline-none"
    >
      <div className="lumen-scroll min-h-0 flex-1">
        <div style={{ minWidth }}>
          <div
            role="row"
            className="sticky top-0 z-10 grid shrink-0 border-b border-rule bg-canvas text-sm text-ink-2 select-none"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((column) => {
              const active = sort.column === column;
              return (
                <button
                  key={column}
                  type="button"
                  role="columnheader"
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  onClick={() => onSort(column)}
                  className={cx(
                    'flex h-6 items-center gap-1 border-r border-rule px-2 text-left last:border-r-0 lumen-focus hover:bg-surface-2',
                    column !== 'name' && 'justify-end',
                    active && 'text-ink',
                  )}
                >
                  <span className="truncate-1">{SORT_LABELS[column]}</span>
                  {active &&
                    (sort.direction === 'asc' ? (
                      <ChevronUp aria-hidden className="size-3 shrink-0" />
                    ) : (
                      <ChevronDown aria-hidden className="size-3 shrink-0" />
                    ))}
                </button>
              );
            })}
          </div>

          {/* Vertical only. A horizontal padding here would inset every row
              from the header above it, and the lanes would stop lining up —
              a little at the first column, more at every one after it. */}
          <div ref={bodyRef} className="py-1">
            {rows.length === 0 && <p className="p-6 text-center text-sm text-ink-3">{empty}</p>}
            {rows.map((row, index) => {
              const { node } = row;
              const isSelected = selected.has(node.id);
              return (
                <div
                  key={node.id}
                  role="row"
                  data-row-id={node.id}
                  aria-selected={isSelected}
                  aria-expanded={node.isDirectory ? row.expanded : undefined}
                  data-focused={focused || undefined}
                  onPointerDown={(e) => click(row, e)}
                  onDoubleClick={() => node.isDirectory && onToggle(node.id)}
                  className={cx(
                    'lumen-list-row cursor-default px-0',
                    // Every other row takes a faint wash. Selection and the
                    // cursor are stronger and paint over it.
                    index % 2 === 1 && !isSelected && 'bg-surface-2/40',
                    node.id === cursor && !isSelected && 'bg-surface-2',
                  )}
                  style={{ gridTemplateColumns: template }}
                >
                  {columns.map((column) =>
                    column === 'name' ? (
                      <span
                        key={column}
                        role="gridcell"
                        className="flex min-w-0 items-center gap-1.5 pr-2"
                        style={{ paddingLeft: 4 + row.depth * INDENT }}
                      >
                        {node.isDirectory ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={
                              row.expanded ? `Collapse ${node.name}` : `Expand ${node.name}`
                            }
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => onToggle(node.id)}
                            className="lumen-focus -m-0.5 rounded-xs p-0.5"
                          >
                            <ChevronRight
                              className={cx(
                                'size-3 transition-transform duration-(--duration-fast) ease-(--ease-standard) motion-reduce:transition-none',
                                row.expanded && 'rotate-90',
                              )}
                            />
                          </button>
                        ) : (
                          <span aria-hidden className="w-3 shrink-0" />
                        )}
                        {node.isDirectory ? (
                          row.expanded ? (
                            <FolderOpen aria-hidden className="size-3.5 shrink-0 opacity-70" />
                          ) : (
                            <Folder aria-hidden className="size-3.5 shrink-0 opacity-70" />
                          )
                        ) : (
                          <File aria-hidden className="size-3.5 shrink-0 opacity-70" />
                        )}
                        <span className="truncate-1">{row.label}</span>
                      </span>
                    ) : (
                      <span
                        key={column}
                        role="gridcell"
                        className="mono truncate-1 px-2 text-right text-sm tabular-nums"
                      >
                        {cellValue(row, column, exactBytes)}
                      </span>
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
