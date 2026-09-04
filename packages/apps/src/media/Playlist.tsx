import { cx, EmptyState, IconButton, Label } from '@lumen/ui';
import { Film, FolderPlus, GripVertical, ListMusic, Music, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { dropTarget, type Track } from './queue';

/** Row height in pixels; the drag maths counts rows, so it is fixed. */
const ROW_HEIGHT = 28;

export interface PlaylistProps {
  tracks: Track[];
  /** Index of the track that is loaded, or -1. */
  index: number;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * The queue: add files or a folder, drag to reorder, remove, clear.
 *
 * A drag moves the row by writing a transform inside `requestAnimationFrame`;
 * the reorder itself is dispatched once, on pointer-up. Alt with the arrow
 * keys does the same thing from the keyboard.
 */
export function Playlist({
  tracks,
  index,
  onSelect,
  onRemove,
  onReorder,
  onAddFiles,
  onAddFolder,
  onClear,
  className,
}: PlaylistProps) {
  const rows = useRef<Array<HTMLLIElement | null>>([]);
  const indicator = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, from: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const row = rows.current[from];
    const startY = event.clientY;
    let offset = 0;
    let to = from;
    handle.setPointerCapture(event.pointerId);
    setDragging(from);

    const paint = () => {
      frame.current = 0;
      if (row) row.style.transform = `translateY(${offset}px)`;
      const line = indicator.current;
      if (line) {
        line.style.display = to === from ? 'none' : 'block';
        line.style.top = `${(to > from ? to + 1 : to) * ROW_HEIGHT}px`;
      }
    };
    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    };
    const onMove = (moved: PointerEvent) => {
      offset = moved.clientY - startY;
      to = dropTarget(from, offset, ROW_HEIGHT, tracks.length);
      schedule();
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (row) row.style.transform = '';
      if (indicator.current) indicator.current.style.display = 'none';
      setDragging(null);
      if (commit && to !== from) onReorder(from, to);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  };

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const to = at + (event.key === 'ArrowUp' ? -1 : 1);
      if (to >= 0 && to < tracks.length) onReorder(at, to);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(at);
    }
  };

  return (
    <div className={cx('flex min-h-0 min-w-0 flex-col bg-surface', className)}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-rule px-2">
        <Label>Playlist</Label>
        <span className="mono text-xs text-ink-3 tabular-nums">{tracks.length}</span>
        <span className="flex-1" />
        <IconButton size="sm" label="Add Files…" onClick={onAddFiles}>
          <Plus />
        </IconButton>
        <IconButton size="sm" label="Add Folder…" onClick={onAddFolder}>
          <FolderPlus />
        </IconButton>
        <IconButton
          size="sm"
          label="Clear Playlist"
          onClick={onClear}
          disabled={tracks.length === 0}
        >
          <Trash2 />
        </IconButton>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<ListMusic />}
          title="Empty playlist"
          description="Add files or a folder to build a queue."
        />
      ) : (
        <div className="lumen-scroll min-h-0 flex-1">
          <div className="relative">
            <div
              ref={indicator}
              aria-hidden
              className="pointer-events-none absolute inset-x-1 hidden h-0.5 bg-accent"
            />
            <ul>
              {tracks.map((track, at) => {
                const current = at === index;
                const Glyph = track.kind === 'video' ? Film : Music;
                return (
                  <li
                    key={track.path}
                    ref={(node) => {
                      rows.current[at] = node;
                    }}
                    style={{ height: ROW_HEIGHT }}
                    className={cx(
                      'group flex items-center gap-1 px-1',
                      dragging === at && 'relative z-10 bg-surface shadow-sm',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`Reorder ${track.name}`}
                      onPointerDown={(event) => startDrag(event, at)}
                      className={cx(
                        'flex size-5 shrink-0 cursor-grab items-center justify-center rounded-xs text-ink-3',
                        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 lumen-focus',
                      )}
                    >
                      <GripVertical className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => onSelect(at)}
                      onKeyDown={(event) => onRowKeyDown(event, at)}
                      className={cx(
                        'flex h-6 min-w-0 flex-1 items-center gap-2 rounded-xs px-1.5 text-left lumen-focus',
                        current ? 'bg-selection text-ink' : 'text-ink-2 hover:bg-surface-2',
                      )}
                    >
                      <Glyph
                        aria-hidden
                        className={cx('size-3.5 shrink-0', current ? 'text-accent' : 'text-ink-3')}
                      />
                      <span className="truncate-1 text-base">{track.name}</span>
                    </button>
                    <IconButton
                      size="sm"
                      label={`Remove ${track.name}`}
                      onClick={() => onRemove(at)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <X />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
