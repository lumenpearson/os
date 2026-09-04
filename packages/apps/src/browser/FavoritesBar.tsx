import { Globe } from 'lucide-react';
import type { Bookmark } from './data';

export interface FavoritesBarProps {
  bookmarks: readonly Bookmark[];
  onOpen: (url: string) => void;
  onShowAll: () => void;
}

/** One quiet row of starred pages, shown or hidden by the user's own choice. */
export function FavoritesBar({ bookmarks, onOpen, onShowAll }: FavoritesBarProps) {
  return (
    <div className="lumen-scroll flex h-8 shrink-0 items-center gap-1 overflow-y-hidden border-b border-rule bg-canvas px-2">
      {bookmarks.length === 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          className="rounded-xs px-1.5 py-0.5 text-sm text-ink-3 hover:text-ink lumen-focus"
        >
          No bookmarks yet — star a page to keep it here
        </button>
      ) : (
        bookmarks.map((b) => (
          <button
            key={b.id}
            type="button"
            title={b.url}
            onClick={() => onOpen(b.url)}
            className="flex max-w-40 shrink-0 items-center gap-1.5 rounded-xs px-1.5 py-0.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink lumen-focus"
          >
            <Globe aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <span className="truncate-1">{b.title || b.url}</span>
          </button>
        ))
      )}
    </div>
  );
}
