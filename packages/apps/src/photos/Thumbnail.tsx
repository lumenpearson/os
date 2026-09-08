import { cx } from '@lumen/ui';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileTypeIcon, useObjectUrl } from '../_sdk';
import { CAPTION_HEIGHT } from './grid';
import type { Photo } from './library';

export interface ThumbnailProps {
  photo: Photo;
  cursor: boolean;
  /** The grid has keyboard focus, so the cursor is worth a ring. */
  focused: boolean;
  favourite: boolean;
  index: number;
  total: number;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * One picture in the grid. Clicking it opens the lightbox, which is what the
 * whole tile is for; the cursor and the selection are the same thing here
 * because only one picture is ever open.
 *
 * A tile owns exactly one object URL, for as long as it is mounted:
 * `useObjectUrl` creates it on the way in and revokes it on the way out. The
 * grid mounts only the rows near the scroll port, so scrolling away from a
 * picture is what gives its blob back — a library of two thousand
 * photographs never holds more than a screenful of them in memory.
 */
export function Thumbnail({
  photo,
  cursor,
  focused,
  favourite,
  index,
  total,
  onSelect,
  onOpen,
  onContextMenu,
}: ThumbnailProps) {
  const { url } = useObjectUrl(photo.path);
  const [broken, setBroken] = useState(false);

  // A different file in the same tile deserves its own chance to decode.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new path is the reason to reset
  useEffect(() => setBroken(false), [photo.path]);

  return (
    // The listbox around this tile owns the keyboard focus and points at the
    // current tile with aria-activedescendant, so an option here is never a
    // tab stop of its own — see PhotoGrid.
    // biome-ignore lint/a11y/useFocusableInteractive: the grid owns focus; the ring is drawn on the active option
    <div
      id={`photo-${index}`}
      role="option"
      aria-selected={cursor}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={favourite ? `${photo.name}, favourite` : photo.name}
      data-path={photo.path}
      title={photo.name}
      onClick={() => {
        onSelect();
        onOpen();
      }}
      onContextMenu={onContextMenu}
      className={cx(
        'flex h-full cursor-default flex-col overflow-hidden rounded-sm select-none',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        cursor ? 'bg-selection' : 'hover:bg-surface-2',
        // The grid itself holds the keyboard focus and points at this tile
        // with aria-activedescendant, so the ring has to be drawn here.
        cursor && focused && 'outline-2 -outline-offset-2 outline-accent',
      )}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {url && !broken ? (
          <img
            src={url}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          <FileTypeIcon entry={{ kind: 'file', path: photo.path }} size={24} />
        )}
      </div>
      <div
        className="flex shrink-0 items-center justify-center gap-1 px-1"
        style={{ height: CAPTION_HEIGHT }}
      >
        {favourite && (
          <Heart aria-hidden className="size-3 shrink-0 fill-current text-accent" strokeWidth={2} />
        )}
        <span className="truncate-1 text-2xs text-ink-2">{photo.name}</span>
      </div>
    </div>
  );
}
