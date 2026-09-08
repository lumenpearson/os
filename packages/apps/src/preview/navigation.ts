/**
 * Stepping through a folder. A file opened from Files has neighbours; the
 * ones Preview can actually show become the sequence the arrows walk.
 */
import { basename, compareEntries, type DirEntry } from '@lumen/vfs';
import { canPreview, viewerKind } from './kind';

export interface Neighbourhood {
  /** Sibling paths Preview can open, in the order Files shows them. */
  items: string[];
  /** Where the open file sits, or −1 if it is not among them. */
  index: number;
}

export const EMPTY_NEIGHBOURHOOD: Neighbourhood = { items: [], index: -1 };

/** Previewable files in a folder, sorted the way the file list sorts them. */
export function previewableSiblings(
  entries: readonly DirEntry[],
  current: string | null,
): Neighbourhood {
  const items = entries
    .filter((entry) => entry.kind === 'file' && !basename(entry.path).startsWith('.'))
    .filter((entry) => canPreview(entry.path))
    .slice()
    .sort(compareEntries)
    .map((entry) => entry.path);
  return { items, index: current === null ? -1 : items.indexOf(current) };
}

/** Images only: the filmstrip shows what it can draw a thumbnail of. */
export function imageSiblings(items: readonly string[]): string[] {
  return items.filter((path) => {
    const kind = viewerKind(path);
    return kind === 'image' || kind === 'svg';
  });
}

/** The next position, or null at the end: the sequence does not wrap. */
export function stepIndex(index: number, total: number, delta: number): number | null {
  if (total <= 0) return null;
  if (index < 0) return delta > 0 ? 0 : total - 1;
  const next = index + delta;
  if (next < 0 || next >= total) return null;
  return next;
}

export function hasStep(place: Neighbourhood, delta: number): boolean {
  return stepIndex(place.index, place.items.length, delta) !== null;
}

/**
 * The stretch of the filmstrip that reads its file. Every thumbnail is a blob
 * of the whole picture, so a folder of five hundred photos only decodes the
 * ones around the open one; the rest keep their place and draw a glyph.
 */
export function thumbnailWindow(
  index: number,
  total: number,
  radius: number,
): { start: number; end: number } {
  if (total <= 0 || radius < 0) return { start: 0, end: 0 };
  const span = radius * 2 + 1;
  if (span >= total) return { start: 0, end: total };
  const centre = Math.max(0, Math.min(total - 1, index));
  const start = Math.max(0, Math.min(total - span, centre - radius));
  return { start, end: start + span };
}

/** "3 of 12", or empty when there is nothing to step through. */
export function positionLabel(index: number, total: number): string {
  if (total <= 1 || index < 0) return '';
  return `${index + 1} of ${total}`;
}
