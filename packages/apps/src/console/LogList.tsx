/**
 * The virtualised list. Only the rows the viewport covers exist in the DOM,
 * placed by absolute offset, so the list scrolls at the same speed with five
 * thousand records as with five. Scrolling is read once a frame, never per
 * event, and it is also what decides whether the tail is still being
 * followed: a list pinned to the bottom stays followed, and the moment the
 * user is anywhere else, following stops.
 */
import { EmptyState, useElementSize } from '@lumen/ui';
import { ScrollText } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Query } from './filter';
import { flattenPayload, type PayloadLine } from './format';
import { LogRow } from './LogRow';
import type { LogRecord } from './types';
import { rowHeight, rowOffsets, totalHeight, windowFor } from './virtual';

/** Distance from the bottom, in pixels, that still counts as the tail. */
const FOLLOW_SLACK = 4;
/** Below this width the source has to give up its column to the message. */
const SOURCE_AT = 520;
/** Lines of payload one row may show before the rest is summarised. */
const MAX_DETAIL_LINES = 200;

export interface LogListProps {
  /** Already filtered, oldest first. */
  rows: readonly LogRecord[];
  query: Query;
  expanded: ReadonlySet<number>;
  onToggleExpanded: (id: number) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Why the list is empty: nothing captured, or nothing matching. */
  emptyTitle: string;
  emptyDescription: string;
}

export function LogList({
  rows,
  query,
  expanded,
  onToggleExpanded,
  selectedId,
  onSelect,
  follow,
  onFollowChange,
  emptyTitle,
  emptyDescription,
}: LogListProps) {
  const [scroller, size] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);
  const frame = useRef(0);

  const details = useMemo(() => {
    const map = new Map<number, PayloadLine[]>();
    for (const record of rows) {
      if (record.data !== undefined && expanded.has(record.id)) {
        map.set(record.id, flattenPayload(record.data, { maxLines: MAX_DETAIL_LINES }));
      }
    }
    return map;
  }, [rows, expanded]);

  const offsets = useMemo(
    () => rowOffsets(rows.map((record) => rowHeight(details.get(record.id)?.length ?? 0))),
    [rows, details],
  );
  const total = totalHeight(offsets);
  const range = useMemo(
    () => windowFor(offsets, scrollTop, size.height),
    [offsets, scrollTop, size.height],
  );

  // Scroll fires far faster than a frame; the window and the follow state are
  // both read once per frame from the element itself.
  const onScroll = useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      onFollowChange(el.scrollHeight - el.clientHeight - el.scrollTop <= FOLLOW_SLACK);
    });
  }, [scroller, onFollowChange]);

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // Pinning happens before paint, so a new record never shows up half-scrolled.
  // `total` and `rows.length` are not read in the body, which is why the rule
  // calls them unnecessary — but a new record arriving is the whole reason to
  // re-pin. Drop them and following the tail stops following.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the row count is the trigger, not an input
  useLayoutEffect(() => {
    if (!follow) return;
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setScrollTop(el.scrollTop);
  }, [follow, total, rows.length, scroller]);

  const reveal = useCallback(
    (index: number) => {
      const el = scroller.current;
      if (!el) return;
      const top = offsets[index] ?? 0;
      const bottom = offsets[index + 1] ?? top;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [offsets, scroller],
  );

  const selectedIndex = useMemo(
    () => (selectedId === null ? -1 : rows.findIndex((record) => record.id === selectedId)),
    [rows, selectedId],
  );

  const move = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(rows.length - 1, index));
      const record = rows[clamped];
      if (!record) return;
      onSelect(record.id);
      reveal(clamped);
    },
    [rows, onSelect, reveal],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (rows.length === 0) return;
      const current = rows[selectedIndex];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          move(selectedIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          move(0);
          break;
        case 'End':
          event.preventDefault();
          move(rows.length - 1);
          break;
        case 'Enter':
        case ' ':
          if (current && current.data !== undefined) {
            event.preventDefault();
            onToggleExpanded(current.id);
          }
          break;
        case 'ArrowRight':
          if (current && current.data !== undefined && !expanded.has(current.id)) {
            event.preventDefault();
            onToggleExpanded(current.id);
          }
          break;
        case 'ArrowLeft':
          if (current && expanded.has(current.id)) {
            event.preventDefault();
            onToggleExpanded(current.id);
          }
          break;
      }
    },
    [rows, selectedIndex, move, onToggleExpanded, expanded],
  );

  const showSource = size.width === 0 || size.width >= SOURCE_AT;
  const columns = showSource ? '14px 84px 44px 96px minmax(0,1fr)' : '14px 84px 44px minmax(0,1fr)';

  const visible = [];
  for (let index = range.start; index < range.end; index++) {
    const record = rows[index];
    if (!record) continue;
    visible.push(
      <LogRow
        key={record.id}
        domId={`console-row-${record.id}`}
        record={record}
        rowIndex={index + 1}
        columns={columns}
        showSource={showSource}
        selected={record.id === selectedId}
        detail={details.get(record.id) ?? null}
        query={query}
        top={offsets[index] ?? 0}
        height={(offsets[index + 1] ?? 0) - (offsets[index] ?? 0)}
        onSelect={() => {
          onSelect(record.id);
          if (record.data !== undefined) onToggleExpanded(record.id);
        }}
      />,
    );
  }

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      role="grid"
      aria-label="Captured events"
      aria-rowcount={rows.length}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid owns the keyboard: it scrolls and it moves the selection
      tabIndex={0}
      className="lumen-scroll min-h-0 flex-1 lumen-focus focus-visible:-outline-offset-2"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={emptyTitle}
          description={emptyDescription}
          className="min-h-40"
        />
      ) : (
        <div className="relative" style={{ height: total }}>
          {visible}
        </div>
      )}
    </div>
  );
}
