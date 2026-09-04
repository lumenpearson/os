// biome-ignore-all lint/a11y/useFocusableInteractive: the grid container is the tab stop and moves selection with the arrow keys; rows and cells are not focusable
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { cx } from '../cx';

export interface Column<T> {
  id: string;
  header: string;
  /** CSS grid track: "1fr", "120px", "minmax(80px,1fr)". */
  width?: string;
  align?: 'left' | 'right';
  mono?: boolean;
  sortable?: boolean;
  accessor: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selected?: Set<string>;
  onSelect?: (keys: Set<string>, anchor: string | null) => void;
  onActivate?: (row: T) => void;
  onContextMenu?: (row: T, e: React.MouseEvent) => void;
  sort?: { column: string; direction: 'asc' | 'desc' } | null;
  onSortChange?: (sort: { column: string; direction: 'asc' | 'desc' } | null) => void;
  focused?: boolean;
  rowHeight?: number;
  className?: string;
  emptyState?: ReactNode;
  /** Row-level drag support. */
  draggable?: boolean;
  onDragStart?: (row: T, e: React.DragEvent) => void;
  onDragOverRow?: (row: T, e: React.DragEvent) => void;
  onDropRow?: (row: T, e: React.DragEvent) => void;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * A sortable, keyboard-navigable list view (Files list mode, Task Manager,
 * Storage). Rows are a CSS grid so columns line up without a <table>.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selected,
  onSelect,
  onActivate,
  onContextMenu,
  sort,
  onSortChange,
  focused = true,
  rowHeight = 24,
  className,
  emptyState,
  draggable,
  onDragStart,
  onDragOverRow,
  onDropRow,
  rowClassName,
}: DataTableProps<T>) {
  const [anchor, setAnchor] = useState<string | null>(null);
  const template = columns.map((c) => c.width ?? '1fr').join(' ');

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.column);
    if (!col) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...rows].sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return collator.compare(String(av), String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  const keys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);

  const select = (key: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (!onSelect) return;
    const next = new Set(selected ?? []);
    if (e.shiftKey && anchor) {
      const a = keys.indexOf(anchor);
      const b = keys.indexOf(key);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) next.add(keys[i] as string);
      onSelect(next, anchor);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      if (next.has(key)) next.delete(key);
      else next.add(key);
    } else {
      next.clear();
      next.add(key);
    }
    setAnchor(key);
    onSelect(next, key);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!onSelect || keys.length === 0) return;
    const current = anchor ?? [...(selected ?? [])].pop() ?? null;
    const idx = current ? keys.indexOf(current) : -1;
    const go = (i: number) => {
      const k = keys[Math.max(0, Math.min(keys.length - 1, i))] as string;
      if (e.shiftKey) select(k, { shiftKey: true, metaKey: false, ctrlKey: false });
      else {
        setAnchor(k);
        onSelect(new Set([k]), k);
      }
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        go(idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        go(idx - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(keys.length - 1);
        break;
      case 'Enter': {
        const row = sorted[idx];
        if (row && onActivate) {
          e.preventDefault();
          onActivate(row);
        }
        break;
      }
      case 'a':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onSelect(new Set(keys), anchor);
        }
        break;
    }
  };

  return (
    <div
      role="grid"
      aria-multiselectable={Boolean(onSelect)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cx('flex h-full min-h-0 flex-col outline-none', className)}
    >
      <div
        role="row"
        className="grid shrink-0 border-b border-rule bg-canvas text-sm text-ink-2 select-none"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => {
          const active = sort?.column === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="columnheader"
              aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              disabled={!c.sortable || !onSortChange}
              onClick={() =>
                onSortChange?.(
                  active && sort?.direction === 'asc'
                    ? { column: c.id, direction: 'desc' }
                    : { column: c.id, direction: 'asc' },
                )
              }
              className={cx(
                'flex h-6 items-center gap-1 px-2 text-left lumen-focus border-r border-rule last:border-r-0',
                c.align === 'right' && 'justify-end',
                c.sortable && 'hover:bg-surface-2',
                active && 'text-ink',
              )}
            >
              <span className="truncate-1">{c.header}</span>
              {active &&
                (sort?.direction === 'asc' ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                ))}
            </button>
          );
        })}
      </div>
      <div className="lumen-scroll flex-1 p-1">
        {sorted.length === 0 && emptyState}
        {sorted.map((row, i) => {
          const key = keys[i] as string;
          const isSelected = selected?.has(key) ?? false;
          return (
            <div
              key={key}
              role="row"
              aria-selected={isSelected}
              data-focused={focused || undefined}
              draggable={draggable}
              onDragStart={(e) => onDragStart?.(row, e)}
              onDragOver={(e) => onDragOverRow?.(row, e)}
              onDrop={(e) => onDropRow?.(row, e)}
              onPointerDown={(e) => {
                if (e.button === 2 && isSelected) return;
                select(key, e);
              }}
              onDoubleClick={() => onActivate?.(row)}
              onContextMenu={(e) => onContextMenu?.(row, e)}
              className={cx(
                'lumen-list-row',
                i % 2 === 1 && !isSelected && 'bg-surface-2/40',
                rowClassName?.(row),
              )}
              style={{ gridTemplateColumns: template, height: rowHeight }}
            >
              {columns.map((c) => (
                <div
                  key={c.id}
                  role="gridcell"
                  className={cx(
                    'truncate-1 px-1',
                    c.align === 'right' && 'text-right',
                    c.mono && 'mono text-sm tabular-nums',
                  )}
                >
                  {c.render ? c.render(row) : c.accessor(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
