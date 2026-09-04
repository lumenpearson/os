import { cx, EmptyState, Select } from '@lumen/ui';
import { Pin, Search } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
} from 'react';
import { formatRelative } from '../_sdk';
import { highlightParts, type NoteRow, type Range, SORT_LABELS, type SortKey } from './notes';

const SORT_OPTIONS = (['modified', 'created', 'title'] as SortKey[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

/** The matched runs of a string, marked with the selection wash. */
function Highlight({ text, ranges }: { text: string; ranges: readonly Range[] }) {
  if (ranges.length === 0) return text;
  let offset = 0;
  return highlightParts(text, ranges).map((part) => {
    const key = offset;
    offset += part.text.length;
    return part.match ? (
      // A search hit shown where it was found: the one job the mark element has,
      // and the accent goes no further than the letters the reader typed.
      // deslop-ignore-next-line 09 13
      <mark key={key} className="rounded-xs bg-selection text-ink">
        {part.text}
      </mark>
    ) : (
      <span key={key}>{part.text}</span>
    );
  });
}

export interface NoteListProps {
  rows: readonly NoteRow[];
  selectedPath: string | null;
  sort: SortKey;
  searching: boolean;
  /** Printed in the empty state; comes formatted for the user's modifier. */
  newShortcut: string;
  onSort: (sort: SortKey) => void;
  onSelect: (path: string) => void;
  /** Enter or a double click: on a narrow window this hands over to the editor. */
  onActivate: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent) => void;
  className?: string;
  /** Only the measured width of the pane; everything else is a class. */
  style?: CSSProperties;
}

/** The middle pane: one row per note, ordered by the current sort. */
export function NoteList({
  rows,
  selectedPath,
  sort,
  searching,
  newShortcut,
  onSort,
  onSelect,
  onActivate,
  onContextMenu,
  className,
  style,
}: NoteListProps) {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const index = rows.findIndex((r) => r.note.path === selectedPath);
  const rowId = (i: number) => `${listId}-${i}`;

  // Keep the selected row in view when the selection moves from elsewhere
  // (a new note, a filter change, the keyboard).
  useEffect(() => {
    if (index < 0) return;
    const row = boxRef.current?.children.item(index);
    if (row instanceof HTMLElement) row.scrollIntoView?.({ block: 'nearest' });
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const step = (to: number) => {
      e.preventDefault();
      const clamped = Math.max(0, Math.min(rows.length - 1, to));
      const row = rows[clamped];
      if (row) onSelect(row.note.path);
    };
    switch (e.key) {
      case 'ArrowDown':
        step(index + 1);
        break;
      case 'ArrowUp':
        step(index < 0 ? 0 : index - 1);
        break;
      case 'Home':
        step(0);
        break;
      case 'End':
        step(rows.length - 1);
        break;
      case 'Enter': {
        const row = rows[index];
        if (row) {
          e.preventDefault();
          onActivate(row.note.path);
        }
        break;
      }
    }
  };

  return (
    <div
      style={style}
      className={cx('flex min-w-0 flex-col border-r border-rule bg-canvas', className)}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-rule px-2">
        <span className="mono text-2xs tabular-nums text-ink-3">
          {rows.length} {rows.length === 1 ? 'note' : 'notes'}
        </span>
        <div className="flex-1" />
        <Select
          size="sm"
          aria-label="Sort notes by"
          options={SORT_OPTIONS}
          value={sort}
          onChange={onSort}
          className="shrink-0"
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={searching ? <Search /> : undefined}
          title={searching ? 'No matches' : 'No notes'}
          description={
            searching
              ? 'Try a shorter search term.'
              : `Press ${newShortcut} to write the first one.`
          }
        />
      ) : (
        <div
          ref={boxRef}
          role="listbox"
          tabIndex={0}
          aria-label="Notes"
          aria-activedescendant={index >= 0 ? rowId(index) : undefined}
          onKeyDown={onKeyDown}
          className="lumen-scroll min-h-0 flex-1 p-1 outline-none"
        >
          {rows.map((row, i) => {
            const selected = row.note.path === selectedPath;
            return (
              <div
                key={row.note.path}
                id={rowId(i)}
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                onPointerDown={() => onSelect(row.note.path)}
                onDoubleClick={() => onActivate(row.note.path)}
                onContextMenu={(e) => onContextMenu(row.note.path, e)}
                className={cx(
                  'flex cursor-default flex-col gap-0.5 rounded-sm px-2 py-1.5 select-none',
                  'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                  selected ? 'bg-selection' : 'hover:bg-surface-2',
                )}
              >
                <div className="flex items-baseline gap-1.5">
                  {row.note.pinned && (
                    <Pin aria-label="Pinned" className="size-3 shrink-0 self-center text-ink-3" />
                  )}
                  <span className="truncate-1 min-w-0 flex-1 text-base font-medium text-ink">
                    <Highlight text={row.note.title} ranges={row.titleRanges} />
                  </span>
                  <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                    {formatRelative(row.note.modifiedAt)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate-1 min-w-0 flex-1 text-sm text-ink-2">
                    {row.excerpt ? (
                      <Highlight text={row.excerpt} ranges={row.excerptRanges} />
                    ) : (
                      <span className="text-ink-3">Empty note</span>
                    )}
                  </span>
                  {row.matches > 0 && (
                    <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                      {row.matches}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
