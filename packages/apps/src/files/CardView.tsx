import { useSetting } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { type DirEntry, formatBytes } from '@lumen/vfs';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { FileTypeIcon, formatRelative, useObjectUrl } from '../_sdk';
import { EntryListBox } from './EntryListBox';
import { kindLabel } from './filters';
import { type LaneAxis, laneWheelDelta, previewKind } from './logic';
import { RenameInput } from './RenameInput';
import { CARD_EXTENT, CARD_GROWTH, ICON_PIXELS, type IconSize } from './settings';
import type { EntryHandlers, EntryViewState } from './types';

export interface CardViewProps extends EntryHandlers, EntryViewState {
  entries: readonly DirEntry[];
  /** Which way the lane runs. */
  axis: LaneAxis;
  iconSize: IconSize;
  emptyState?: ReactNode;
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
 * Cards in a lane, horizontal or vertical, with the card under the cursor
 * grown to make room for a larger preview. The wheel drives the lane rather
 * than the window, the arrow keys walk it, and selection follows the cursor.
 * Growing and shrinking is a width (or height) transition, so its neighbours
 * shift with it — and stand still when the system asks for less motion.
 */
export function CardView({
  entries,
  axis,
  iconSize,
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
}: CardViewProps) {
  const [appearance] = useSetting('appearance');
  const lane = useRef<HTMLDivElement>(null);
  const pending = useRef(0);
  const frame = useRef(0);
  const horizontal = axis === 'horizontal';

  /**
   * The wheel moves the lane, not the page, and on a horizontal lane a plain
   * vertical wheel has to work too. Deltas land at pointer rate, so they are
   * summed in a ref and written to the element once per frame.
   */
  useEffect(() => {
    const el = lane.current;
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

  const cursor = selection.cursor;
  const extent = CARD_EXTENT[iconSize];
  const glyph = ICON_PIXELS[iconSize];
  const reveal = useMemo<ScrollIntoViewOptions>(
    () => ({
      block: 'center',
      inline: 'center',
      behavior: appearance.reduceMotion ? 'auto' : 'smooth',
    }),
    [appearance.reduceMotion],
  );

  const cardStyle = (entry: DirEntry): CSSProperties => {
    const size = entry.path === cursor ? extent + CARD_GROWTH : extent;
    return horizontal ? { width: size } : { height: size };
  };

  return (
    <EntryListBox
      entries={entries}
      selection={selection}
      layout="grid"
      label="Files"
      orientation={axis}
      containerRef={lane}
      reveal={reveal}
      className={cx(
        'lumen-scroll flex h-full',
        horizontal
          ? 'flex-row items-center gap-3 overflow-x-auto overflow-y-hidden px-4'
          : 'flex-col items-stretch gap-3 overflow-y-auto px-4 py-4',
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
          'flex shrink-0 flex-col items-center gap-2 rounded-md border border-rule bg-surface p-3 text-ink',
          'transition-[width,height,background-color] duration-(--duration-base) ease-(--ease-standard)',
          horizontal ? 'h-[86%]' : 'w-full',
          s.selected && (focused ? 'bg-selection' : 'bg-surface-2'),
          s.cursor && 'outline-2 -outline-offset-2 outline-accent',
          entry.path === dropTarget && 'bg-selection outline-2 -outline-offset-2 outline-accent',
          cutPaths.has(entry.path) && 'opacity-50',
        )
      }
      renderItem={(entry) => (
        <>
          <span
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ minHeight: glyph }}
          >
            {entry.path === cursor && previewKind(entry) === 'image' ? (
              <CardImage path={entry.path} size={glyph} />
            ) : (
              <FileTypeIcon entry={entry} size={glyph} />
            )}
          </span>
          {renaming === entry.path ? (
            <RenameInput
              path={entry.path}
              align="center"
              className="w-full"
              onCommit={(name) => onRenameCommit(entry.path, name)}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="line-clamp-2 w-full break-words text-center text-sm leading-4">
              {entry.name}
            </span>
          )}
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
}
