/**
 * The library: what is actually under Pictures, and how the window narrows it
 * down. Nothing here reads a picture's bytes — a Photo is only what the file
 * system already knows (name, folder, size, modified time), so the whole list
 * can be built from one walk and re-sorted without touching the disk again.
 * Dimensions come from decoding the picture, and only where one is drawn.
 *
 * The albums are the folders. A folder that directly holds a picture is an
 * album; there are no others, because there is nothing else on disk to make
 * one out of.
 */
import type { AppDefinition } from '@lumen/kernel';
import { type DirEntry, dirname, extname, fileCategory, relative } from '@lumen/vfs';

export interface Photo {
  path: string;
  name: string;
  /** Folder holding the picture, relative to Pictures; '' is Pictures itself. */
  album: string;
  /** Bytes on disk. */
  size: number;
  /** Epoch milliseconds. */
  modifiedAt: number;
}

export type SortKey = 'name' | 'date' | 'size';
export type SortOrder = 'ascending' | 'descending';

export const SORT_KEYS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date' },
  { id: 'size', label: 'Size' },
];

/** Natural, case-insensitive order, the same one the file list uses. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The minimal slice of the VFS the scan needs, so a test can hand in its own. */
export interface PhotoSource {
  walk(
    path: string,
    visit: (entry: DirEntry) => boolean | undefined | Promise<boolean | undefined>,
  ): Promise<void>;
}

/** True for the files Photos shows: whatever the VFS calls an image. */
export function isPicture(entry: DirEntry): boolean {
  return entry.kind === 'file' && fileCategory(entry.path) === 'image';
}

export function photoFrom(entry: DirEntry, root: string): Photo {
  // `relative` spells "the same folder" as ".", which is not a folder name.
  const folder = relative(root, dirname(entry.path));
  return {
    path: entry.path,
    name: entry.name,
    album: folder === '.' ? '' : folder,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
  };
}

/**
 * Every picture under `root`, in no particular order — the window sorts them.
 * Dot-folders and dot-files are skipped: a thumbnail cache or a `.config`
 * directory is not part of anybody's library.
 */
export async function scanPictures(source: PhotoSource, root: string): Promise<Photo[]> {
  const photos: Photo[] = [];
  await source.walk(root, (entry) => {
    if (entry.name.startsWith('.')) return false;
    if (isPicture(entry)) photos.push(photoFrom(entry, root));
    return true;
  });
  return photos;
}

export interface Album {
  /** Folder path relative to Pictures; '' is Pictures itself. */
  id: string;
  /** The folder's own name, or 'Pictures' for the root. */
  label: string;
  count: number;
}

/** The folders that hold pictures, in name order, with how many each holds. */
export function albumsOf(photos: readonly Photo[]): Album[] {
  const counts = new Map<string, number>();
  for (const photo of photos) counts.set(photo.album, (counts.get(photo.album) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: albumLabel(id), count }))
    .sort((a, b) => collator.compare(a.id, b.id));
}

/** Nested albums keep their path, so two folders called "2024" stay apart. */
export function albumLabel(album: string): string {
  return album === '' ? 'Pictures' : album;
}

// ── what the window is showing ───────────────────────────────────────────

export type Scope = { kind: 'all' } | { kind: 'favourites' } | { kind: 'album'; album: string };

export const ALL_SCOPE: Scope = { kind: 'all' };

const ALBUM_PREFIX = 'album:';

/** A scope as a string, for the sidebar's selected row. */
export function scopeId(scope: Scope): string {
  return scope.kind === 'album' ? `${ALBUM_PREFIX}${scope.album}` : scope.kind;
}

export function parseScopeId(id: string): Scope {
  if (id === 'favourites') return { kind: 'favourites' };
  if (id.startsWith(ALBUM_PREFIX)) return { kind: 'album', album: id.slice(ALBUM_PREFIX.length) };
  return ALL_SCOPE;
}

export interface Selection {
  scope: Scope;
  /** Substring of the file name, case-insensitive; blank matches everything. */
  query: string;
  favourites: ReadonlySet<string>;
  sort: SortKey;
  order: SortOrder;
}

function matchesScope(photo: Photo, scope: Scope, favourites: ReadonlySet<string>): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'favourites':
      return favourites.has(photo.path);
    case 'album':
      return photo.album === scope.album;
  }
}

/**
 * Compare on the chosen key, then always on the path. The second step is what
 * makes the order total: two pictures with the same size, or taken in the same
 * millisecond, still have exactly one place each, so the grid does not shuffle
 * when the list is rebuilt.
 */
export function comparePhotos(a: Photo, b: Photo, key: SortKey, order: SortOrder): number {
  const sign = order === 'descending' ? -1 : 1;
  let first = 0;
  if (key === 'name') first = collator.compare(a.name, b.name);
  else if (key === 'date') first = a.modifiedAt - b.modifiedAt;
  else first = a.size - b.size;
  if (first !== 0) return sign * first;
  return collator.compare(a.path, b.path);
}

export function sortPhotos(photos: readonly Photo[], key: SortKey, order: SortOrder): Photo[] {
  return [...photos].sort((a, b) => comparePhotos(a, b, key, order));
}

/** The pictures on screen: scope, then search, then the sort. */
export function selectPhotos(photos: readonly Photo[], selection: Selection): Photo[] {
  const query = selection.query.trim().toLowerCase();
  const kept = photos.filter(
    (photo) =>
      matchesScope(photo, selection.scope, selection.favourites) &&
      (query === '' || photo.name.toLowerCase().includes(query)),
  );
  return sortPhotos(kept, selection.sort, selection.order);
}

// ── labels ───────────────────────────────────────────────────────────────

/**
 * Pixel dimensions, measured from the decoded picture. Preview writes the same
 * line, but its module also parses spreadsheets; three lines here are cheaper
 * than that import.
 */
export function formatDimensions(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '—';
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/**
 * Whether another app will actually edit this file, asked of that app's own
 * declaration rather than of a list kept here. Paint edits bitmaps and not
 * SVG, and the command that opens a picture in it should say so.
 */
export function canEditWith(app: AppDefinition | undefined, path: string): boolean {
  if (!app) return false;
  const ext = extname(path);
  return (app.fileAssociations ?? []).some(
    (association) => association.role === 'editor' && association.extensions.includes(ext),
  );
}

/** "3 of 12", or empty where there is nothing to step through. */
export function positionLabel(index: number, total: number): string {
  if (total <= 0 || index < 0) return '';
  return `${index + 1} of ${total}`;
}

export function countLabel(count: number, noun = 'picture'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The next index in a list that does not wrap, or null at either end. */
export function stepIndex(index: number, total: number, delta: number): number | null {
  if (total <= 0) return null;
  if (index < 0) return delta > 0 ? 0 : total - 1;
  const next = index + delta;
  if (next < 0 || next >= total) return null;
  return next;
}

/**
 * Where the cursor lands after a list changes under it — a picture trashed, a
 * search narrowed. The same path if it survived, otherwise whatever took its
 * place, otherwise nothing.
 */
export function cursorAfterChange(
  previous: string | null,
  previousIndex: number,
  next: readonly Photo[],
): string | null {
  if (previous !== null && next.some((photo) => photo.path === previous)) return previous;
  if (next.length === 0) return null;
  const at = Math.min(Math.max(0, previousIndex), next.length - 1);
  return next[at]?.path ?? null;
}
