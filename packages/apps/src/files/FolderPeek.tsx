/**
 * What is inside a folder, shown on the folder.
 *
 * A row of identical folder glyphs tells you nothing you did not already know
 * from the names underneath them. macOS puts the first few things in the
 * folder on its icon, and it is genuinely useful: a folder of photographs
 * looks like photographs. This does the same from what is actually there —
 * the first entries the file system returns, images drawn as images and
 * everything else as the icon for its kind. Nothing is invented: a folder
 * that cannot be read, or has nothing in it, keeps the plain glyph.
 *
 * Reads are cached by path for the life of the window, because a lane of
 * cards re-renders on every cursor move and a folder's contents do not change
 * between two frames.
 */

import { useVfs } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import { useEffect, useState } from 'react';
import { FileTypeIcon, useObjectUrl } from '../_sdk';
import { previewKind } from './logic';

/** At most this many, so a card is a hint of the contents and not a contact sheet. */
export const PEEK_LIMIT = 4;

const cache = new Map<string, DirEntry[]>();
const inFlight = new Map<string, Promise<DirEntry[]>>();

/** For tests, and for a window that has just been told the disk changed. */
export function forgetPeeks(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * The first few entries of a folder. Directories come after files, so a
 * folder of pictures shows pictures rather than its subfolders.
 */
export function peekOrder(entries: readonly DirEntry[], limit = PEEK_LIMIT): DirEntry[] {
  const files = entries.filter((e) => e.kind === 'file');
  const folders = entries.filter((e) => e.kind !== 'file');
  return [...files, ...folders].slice(0, limit);
}

export function useFolderPeek(path: string, enabled: boolean): DirEntry[] | null {
  const vfs = useVfs();
  const [entries, setEntries] = useState<DirEntry[] | null>(() => cache.get(path) ?? null);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(path);
    if (cached) {
      setEntries(cached);
      return;
    }
    let live = true;
    // One read per folder even when several cards ask at once.
    const pending =
      inFlight.get(path) ??
      vfs
        .readDir(path)
        .then((found) => {
          const peek = peekOrder(found);
          cache.set(path, peek);
          return peek;
        })
        .catch(() => {
          // A folder that cannot be read has nothing to show, and saying so
          // once is better than retrying on every render.
          cache.set(path, []);
          return [];
        })
        .finally(() => inFlight.delete(path));
    inFlight.set(path, pending);
    void pending.then((found) => {
      if (live) setEntries(found);
    });
    return () => {
      live = false;
    };
  }, [path, enabled, vfs]);

  return entries;
}

function PeekTile({ entry, size }: { entry: DirEntry; size: number }) {
  const isImage = entry.kind === 'file' && previewKind(entry) === 'image';
  const { url } = useObjectUrl(isImage ? entry.path : null);
  if (isImage && url) {
    return (
      <img
        src={url}
        alt=""
        className="size-full rounded-[2px] border border-rule object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className="flex items-center justify-center" style={{ width: size, height: size }}>
      <FileTypeIcon entry={entry} size={Math.round(size * 0.86)} />
    </span>
  );
}

/**
 * The folder, with the first few things in it laid on top. The glyph stays
 * underneath: the point is still that this is a folder.
 */
export function FolderPeek({
  entry,
  size,
  enabled,
}: {
  entry: DirEntry;
  size: number;
  enabled: boolean;
}) {
  const peek = useFolderPeek(entry.path, enabled);
  if (!peek || peek.length === 0) return <FileTypeIcon entry={entry} size={size} />;

  const tile = Math.round((size * 0.82) / 2);
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <FileTypeIcon entry={entry} size={size} />
      <span
        className={cx(
          'absolute inset-x-0 bottom-0 top-[22%] mx-auto grid place-content-center',
          'grid-cols-2 gap-[2px]',
        )}
        style={{ width: tile * 2 + 2 }}
      >
        {peek.map((child) => (
          <PeekTile key={child.path} entry={child} size={tile} />
        ))}
      </span>
    </span>
  );
}
