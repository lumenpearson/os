/**
 * How the numbers in an archive are printed. Every figure here is measured
 * from the file on disk: a size, a packed size, the saving between them.
 */

import { formatBytes } from '@lumen/vfs';
import { METHOD_DEFLATE, METHOD_STORED, type ZipEntry } from './zip';

export function methodLabel(method: number): string {
  if (method === METHOD_STORED) return 'Stored';
  if (method === METHOD_DEFLATE) return 'Deflate';
  return `Method ${method}`;
}

/** How much of the original the packing saved, or null when there is nothing to save. */
export function savingRatio(size: number, packed: number): number | null {
  if (!Number.isFinite(size) || !Number.isFinite(packed) || size <= 0) return null;
  return 1 - packed / size;
}

/** The saving as a whole percent; "—" when the entry has no bytes to speak of. */
export function formatRatio(size: number, packed: number): string {
  const ratio = savingRatio(size, packed);
  if (ratio === null) return '—';
  return `${Math.round(ratio * 100)}%`;
}

/** 1234567 → "1,234,567". Grouped by hand so the result does not move with the locale. */
export function groupDigits(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${digits}` : digits;
}

/** Either the rounded human size or the exact byte count, per the View menu. */
export function formatSize(bytes: number, exact: boolean): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  return exact ? `${groupDigits(bytes)} B` : formatBytes(bytes);
}

export interface ArchiveTotals {
  files: number;
  folders: number;
  size: number;
  packed: number;
}

export function totalsOf(entries: readonly ZipEntry[]): ArchiveTotals {
  const totals: ArchiveTotals = { files: 0, folders: 0, size: 0, packed: 0 };
  for (const entry of entries) {
    if (entry.isDirectory) {
      totals.folders += 1;
      continue;
    }
    totals.files += 1;
    totals.size += entry.uncompressedSize;
    totals.packed += entry.compressedSize;
  }
  return totals;
}

const plural = (count: number, word: string) =>
  `${groupDigits(count)} ${word}${count === 1 ? '' : 's'}`;

/** The one line under the table: what is in the archive and how tightly it is packed. */
export function summarize(totals: ArchiveTotals, exact = false): string {
  const parts = [plural(totals.files, 'file')];
  if (totals.folders > 0) parts.push(plural(totals.folders, 'folder'));
  if (totals.files === 0) return parts.join(', ');
  const sizes = `${formatSize(totals.size, exact)} → ${formatSize(totals.packed, exact)}`;
  const ratio = savingRatio(totals.size, totals.packed);
  const saving = ratio === null || ratio <= 0 ? '' : ` (${Math.round(ratio * 100)}% smaller)`;
  return `${parts.join(', ')} · ${sizes}${saving}`;
}
