import { useSetting } from '@lumen/kernel/react';
import { cx, useLatest } from '@lumen/ui';
import { type DirEntry, formatBytes } from '@lumen/vfs';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { FileTypeIcon, formatRelative, useObjectUrl } from '../_sdk';
import { EntryListBox } from './EntryListBox';
import { FolderPeek } from './FolderPeek';
import { kindLabel } from './filters';
import { ListView } from './ListView';
import type { SortState } from './logic';
import { type LaneAxis, laneWheelDelta, previewKind } from './logic';
import { CARD_EXTENT, CARD_GROWTH, CARD_LANE, ICON_PIXELS, type IconSize } from './settings';
import type { EntryHandlers, EntryViewState } from './types';

export interface CardViewProps extends EntryHandlers, EntryViewState {
  entries: readonly DirEntry[];
  /** Which way the lane runs. */
  axis: LaneAxis;
  iconSize: IconSize;
  emptyState?: ReactNode;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Content width, so the table below can drop columns when it is narrow. */
  width: number;
}

/** The image behind the card the cursor is on; other cards show their glyph. */
function CardImage({ path, size }: { path: string; size: number }) {
  const { url } = useObjectUrl(path);
  if (!url) return <FileTypeIcon entry={{ kind: 'file', path }} size={size} />;
  return (
    <img
      src={url}
      alt=""
      className="max-h-full max-w-full rounded-xs border border-rule object-contain"
    />
  );
}

/**
 * A lane of cards with the same folder as a table beside it.
 *
 * The lane is for looking — a folder shows the first few things inside it, so
 * a folder of photographs looks like photographs — and the table is for
 * reading: name, date, size and kind, sortable. They are one selection and
 * one cursor, so a card and its row are never out of step.
 *
 * The lane takes the height its cards need and no more than a third of the
 * window; the table takes everything left, which is at least the two thirds
 * it needs to be a table rather than a strip, and more on a tall window.
 *
 * The card under the cursor grows to make room for a larger preview, and the
 * wheel drives the lane rather than the window. Growing and shrinking is a
 * width transition, so its neighbours shift with it — and stand still when
 * the system asks for less motion.
 */
export function CardView({
  entries,
  axis,
  iconSize,
  emptyState,
  sort,
  onSortChange,
  width,
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
}: CardViewProps) {
  const [appearance] = useSetting('appearance');
  const laneRef = useRef<HTMLDivElement>(null);
  const pending = useRef(0);
  const frame = useRef(0);
  const horizontal = axis === 'horizontal';

  /**
   * The wheel moves the lane, not the page, and on a horizontal lane a plain
   * vertical wheel has to work too. Deltas land at pointer rate, so they are
   * summed in a ref and written to the element once per frame.
   */
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = laneWheelDelta(e, axis);
      if (delta === 0) return;
      e.preventDefault();
      pending.current += delta;
      if (frame.current !== 0) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const move = pending.current;
        pending.current = 0;
        if (horizontal) el.scrollLeft += move;
        else el.scrollTop += move;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [axis, horizontal]);

  /**
   * The lane always has one card the keyboard would act on, from the moment
   * it is drawn: it is the card wearing the accent, and a lane where nothing
   * is marked leaves a person guessing what an arrow key would move. The
   * cursor is set without selecting, so opening the view does not act as a
   * click on the first file.
   */
  const first = entries[0]?.path ?? null;
  const cursorRef = useLatest({ selection, onSelectionChange });
  useEffect(() => {
    const { selection: current, onSelectionChange: change } = cursorRef.current;
    if (current.cursor !== null || first === null) return;
    change({ ...current, cursor: first });
  }, [first, cursorRef]);

  const cursor = selection.cursor;
  const extent = CARD_EXTENT[iconSize];
  const glyph = ICON_PIXELS[iconSize];
  const reveal = useMemo(
    () => ({ align: 'center' as const, smooth: !appearance.reduceMotion }),
    [appearance.reduceMotion],
  );

  const cardStyle = (entry: DirEntry): CSSProperties => {
    const size = entry.path === cursor ? extent + CARD_GROWTH : extent;
    return horizontal ? { width: size } : { height: size };
  };

  const lane = (
    <EntryListBox
      entries={entries}
      selection={selection}
      layout="grid"
      label="Files"
      orientation={axis}
      containerRef={laneRef}
      reveal={reveal}
      className={cx(
        'lumen-scroll flex h-full',
        horizontal
          ? 'flex-row items-stretch gap-3 overflow-x-auto overflow-y-hidden px-3 py-3'
          : 'flex-col items-stretch gap-3 overflow-y-auto px-3 py-3',
        entries.length === 0 && 'items-stretch justify-center',
      )}
      onSelectionChange={onSelectionChange}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      itemStyle={cardStyle}
      itemClassName={(entry, s) =>
        cx(
          'flex shrink-0 flex-col items-center gap-1.5 rounded-md border border-rule bg-surface p-2 text-ink',
          'transition-[width,height,background-color] duration-(--duration-base) ease-(--ease-standard)',
          horizontal ? 'h-full' : 'w-full',
          s.selected && (focused ? 'bg-selection' : 'bg-surface-2'),
          // The cursor is the thing the keyboard will act on, so it is the
          // one card wearing the accent — a ring rather than a tint, so it
          // still reads as the cursor on top of a selection. Without the
          // keyboard it keeps a hairline in the neutral ramp: still marked,
          // no longer claiming the accent.
          s.cursor && 'outline-2 -outline-offset-2 outline-accent',
          !s.cursor && s.atCursor && 'outline-1 -outline-offset-1 outline-rule-strong',
          entry.path === dropTarget && 'bg-selection outline-2 -outline-offset-2 outline-accent',
          cutPaths.has(entry.path) && 'opacity-50',
        )
      }
      renderItem={(entry) => (
        <>
          {/* A fixed block, so every glyph in the lane sits on one line
              however long the names underneath them turn out to be. */}
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ height: glyph + 12 }}
          >
            {entry.kind === 'directory' ? (
              <FolderPeek entry={entry} size={glyph} enabled />
            ) : previewKind(entry) === 'image' ? (
              <CardImage path={entry.path} size={glyph} />
            ) : (
              <FileTypeIcon entry={entry} size={glyph} />
            )}
          </span>
          <span className="line-clamp-2 w-full break-words text-center text-sm leading-4">
            {entry.name}
          </span>
          <span className="mono w-full truncate-1 text-center text-2xs text-ink-3 tabular-nums">
            {entry.kind === 'directory'
              ? kindLabel(entry)
              : `${formatBytes(entry.size)} · ${formatRelative(entry.modifiedAt)}`}
          </span>
        </>
      )}
    >
      {entries.length === 0 && emptyState}
    </EntryListBox>
  );

  return (
    <div className={cx('flex h-full min-h-0', horizontal ? 'flex-col' : 'flex-row')}>
      <div
        className={cx(
          'shrink-0 border-rule',
          horizontal ? 'max-h-[34%] border-b' : 'max-w-[34%] border-r',
        )}
        style={horizontal ? { height: CARD_LANE[iconSize] } : { width: CARD_EXTENT[iconSize] + 40 }}
      >
        {lane}
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <ListView
          entries={entries}
          sort={sort}
          onSortChange={onSortChange}
          width={width}
          selection={selection}
          // The lane shows a name; the table edits one. Two rename fields for
          // the same file would both take focus and both commit.
          renaming={renaming}
          cutPaths={cutPaths}
          dropTarget={dropTarget}
          focused={focused}
          onSelectionChange={onSelectionChange}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
        />
      </div>
    </div>
  );
}
