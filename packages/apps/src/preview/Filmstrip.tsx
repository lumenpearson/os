import { cx } from '@lumen/ui';
import { basename } from '@lumen/vfs';
import { useEffect, useRef } from 'react';
import { FileTypeIcon, useObjectUrl } from '../_sdk';
import { thumbnailWindow } from './navigation';

export interface FilmstripProps {
  /** Pictures in the folder, in the order the arrows walk them. */
  items: readonly string[];
  /** The picture on the stage. */
  selected: string | null;
  onSelect: (path: string) => void;
}

/** Thumbnails either side of the open picture that read their file. */
const RADIUS = 12;

/**
 * The strip of pictures in the folder. Selection follows the arrow keys, and
 * only the thumbnails near the open one decode their file — a folder of five
 * hundred photos would otherwise hold five hundred blobs in memory.
 */
export function Filmstrip({ items, selected, onSelect }: FilmstripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const index = selected === null ? -1 : items.indexOf(selected);
  const loaded = thumbnailWindow(index, items.length, RADIUS);

  // Keep the open picture in view, and let the keyboard follow the selection
  // when it was the keyboard that moved it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new selection is the reason to scroll; the row itself is read from the DOM
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[data-current="true"]');
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
    const active = document.activeElement;
    if (active !== el && active instanceof HTMLElement && strip.current?.contains(active))
      el.focus({ preventScroll: true });
  }, [selected]);

  const move = (delta: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, index + delta))];
    if (next && next !== selected) onSelect(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const jumps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    const jump = jumps[event.key];
    if (jump !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      move(jump);
      return;
    }
    if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.key === 'Home' ? items[0] : items[items.length - 1];
    if (target) onSelect(target);
  };

  return (
    <div
      ref={strip}
      role="listbox"
      aria-label="Pictures in this folder"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="lumen-scroll flex shrink-0 items-center gap-1.5 border-t border-rule bg-canvas px-2 py-2"
    >
      {items.map((path, at) => (
        <Thumbnail
          key={path}
          path={path}
          selected={path === selected}
          load={at >= loaded.start && at < loaded.end}
          onSelect={() => onSelect(path)}
        />
      ))}
    </div>
  );
}

function Thumbnail({
  path,
  selected,
  load,
  onSelect,
}: {
  path: string;
  selected: boolean;
  load: boolean;
  onSelect: () => void;
}) {
  const { url } = useObjectUrl(load ? path : null);
  const name = basename(path);
  return (
    <div
      role="option"
      aria-selected={selected}
      data-current={selected || undefined}
      tabIndex={selected ? 0 : -1}
      title={name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      className={cx(
        'flex size-13 shrink-0 cursor-default items-center justify-center overflow-hidden',
        'rounded-sm border bg-surface lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        selected ? 'border-accent' : 'border-rule hover:border-rule-strong',
      )}
    >
      {url ? (
        <img src={url} alt={name} className="size-full object-cover" draggable={false} />
      ) : (
        <FileTypeIcon entry={{ kind: 'file', path }} size={18} />
      )}
    </div>
  );
}
