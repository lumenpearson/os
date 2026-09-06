import { cx, isContextMenuKey, useElementSize } from '@lumen/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  CAPTION_HEIGHT,
  columnsFor,
  EMPTY_RANGE,
  GRID_GAP,
  GRID_PAD,
  moveCursor,
  type Range,
  rowCount,
  rowHeight,
  rowsPerPage,
  scrollTopFor,
  type ThumbSize,
  TILE_HEIGHT,
  visibleRange,
} from './grid';
import type { Photo } from './library';
import { Thumbnail } from './Thumbnail';

export interface PhotoGridProps {
  photos: readonly Photo[];
  /** The picture the cursor is on, by path. */
  cursor: string | null;
  favourites: ReadonlySet<string>;
  size: ThumbSize;
  onCursorChange: (path: string) => void;
  onOpen: (path: string) => void;
  /**
   * A menu for one picture, at a point in the viewport. The point rather than
   * the event, because the Menu key and Shift+F10 ask for the same menu with
   * no pointer to put it under.
   */
  onContextMenu: (path: string, at: { x: number; y: number }) => void;
  /** Shown in place of the grid when there is nothing to show. */
  empty: ReactNode;
}

/**
 * The library as a grid.
 *
 * Only the rows near the scroll port are in the DOM; the ones above and below
 * are replaced by padding of exactly their height, so the scrollbar is the
 * true length of the library and the arithmetic in `grid.ts` is the only
 * thing that decides which tiles exist. That matters more here than in most
 * lists: a tile that exists holds a blob URL of a whole picture, and a tile
 * that stops existing gives it back.
 *
 * Scrolling is a pointer-rate event, so it is coalesced into one frame and
 * only reaches React when the range of rows actually changes — a few times a
 * second at most, rather than once per wheel notch.
 */
export function PhotoGrid({
  photos,
  cursor,
  favourites,
  size,
  onCursorChange,
  onOpen,
  onContextMenu,
  empty,
}: PhotoGridProps) {
  const [port, viewport] = useElementSize<HTMLDivElement>();
  const frame = useRef(0);
  const [range, setRange] = useState<Range>(EMPTY_RANGE);
  const [focused, setFocused] = useState(false);

  const total = photos.length;
  const height = rowHeight(size);
  const columns = columnsFor(viewport.width, size);
  const rows = rowCount(total, columns);
  const index = cursor === null ? -1 : photos.findIndex((photo) => photo.path === cursor);

  const recompute = useCallback(() => {
    const el = port.current;
    if (!el) return;
    const next = visibleRange({
      scrollTop: el.scrollTop,
      viewportHeight: el.clientHeight,
      rowHeight: height,
      columns,
      total,
    });
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [port, height, columns, total]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      recompute();
    });
  };

  // Bring the cursor into view. `scrollIntoView` is no use here: the row may
  // not be in the DOM yet, so the position is worked out and written.
  useEffect(() => {
    const el = port.current;
    if (!el || index < 0) return;
    const next = scrollTopFor(index, columns, height, el.scrollTop, el.clientHeight);
    if (next !== el.scrollTop) {
      el.scrollTop = next;
      recompute();
    }
  }, [port, index, columns, height, recompute]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = port.current;
    const page = rowsPerPage(el?.clientHeight ?? 0, height);
    if (event.key === 'Enter' || event.key === ' ') {
      if (cursor === null) return;
      event.preventDefault();
      onOpen(cursor);
      return;
    }
    if (isContextMenuKey(event) && cursor !== null) {
      event.preventDefault();
      const tile = el?.querySelector<HTMLElement>('[aria-selected="true"]');
      const box = tile?.getBoundingClientRect();
      onContextMenu(cursor, { x: box?.left ?? 0, y: box?.bottom ?? 0 });
      return;
    }
    const next = moveCursor(index, event.key, columns, total, page);
    if (next === null) return;
    event.preventDefault();
    const photo = photos[next];
    if (photo) onCursorChange(photo.path);
  };

  const firstRow = columns > 0 ? Math.floor(range.start / columns) : 0;
  const lastRow = columns > 0 ? Math.ceil(range.end / columns) : 0;

  if (total === 0) return <>{empty}</>;

  return (
    <div
      ref={port}
      role="listbox"
      aria-label="Pictures"
      aria-activedescendant={index >= 0 ? `photo-${index}` : undefined}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cx(
        'lumen-scroll grid min-h-0 min-w-0 flex-1 content-start outline-none',
        // The ring belongs on the picture the cursor is on, not around the
        // whole library; the tile draws it while this element has focus.
        'focus-visible:outline-none',
      )}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${TILE_HEIGHT[size] + CAPTION_HEIGHT}px`,
        gap: GRID_GAP,
        paddingLeft: GRID_PAD,
        paddingRight: GRID_PAD,
        paddingTop: GRID_PAD + firstRow * height,
        paddingBottom: GRID_PAD + Math.max(0, rows - lastRow) * height,
      }}
    >
      {photos.slice(range.start, range.end).map((photo, at) => {
        const position = range.start + at;
        return (
          <Thumbnail
            key={photo.path}
            photo={photo}
            cursor={position === index}
            focused={focused}
            favourite={favourites.has(photo.path)}
            index={position}
            total={total}
            onSelect={() => onCursorChange(photo.path)}
            onOpen={() => onOpen(photo.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(photo.path, { x: event.clientX, y: event.clientY });
            }}
          />
        );
      })}
    </div>
  );
}
