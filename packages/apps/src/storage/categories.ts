/**
 * The seven buckets the overview bar is divided into.
 *
 * The VFS already classifies a path (`fileCategory`), and that classification
 * is the one Files and Preview use. This file does not restate it: it maps
 * every one of the VFS categories onto the coarser bucket the bar shows, so a
 * file can never land in one category here and another one there.
 */

import { type FileCategory, fileCategory } from '@lumen/vfs';

export type StorageCategory =
  | 'documents'
  | 'pictures'
  | 'audio'
  | 'video'
  | 'code'
  | 'archives'
  | 'other';

/** Bar and legend order before sizes are known. */
export const CATEGORIES: readonly StorageCategory[] = [
  'documents',
  'pictures',
  'audio',
  'video',
  'code',
  'archives',
  'other',
];

export const CATEGORY_LABELS: Record<StorageCategory, string> = {
  documents: 'Documents',
  pictures: 'Pictures',
  audio: 'Audio',
  video: 'Video',
  code: 'Code',
  archives: 'Archives',
  other: 'Other',
};

/**
 * Every `FileCategory` the VFS can return, mapped onto a bucket. Written out
 * in full rather than with a default arm: when the VFS gains a category, this
 * record stops type checking and someone decides where it belongs.
 */
const BUCKET: Record<FileCategory, StorageCategory> = {
  text: 'documents',
  markdown: 'documents',
  document: 'documents',
  spreadsheet: 'documents',
  presentation: 'documents',
  pdf: 'documents',
  image: 'pictures',
  audio: 'audio',
  video: 'video',
  code: 'code',
  script: 'code',
  data: 'code',
  archive: 'archives',
  app: 'other',
  font: 'other',
  binary: 'other',
};

/** The bucket a path falls in, decided by the VFS's own classification. */
export function storageCategory(path: string): StorageCategory {
  return BUCKET[fileCategory(path)];
}

export interface CategoryTotal {
  category: StorageCategory;
  label: string;
  bytes: number;
  files: number;
}

export interface SizedFile {
  path: string;
  size: number;
}

/**
 * Bytes and file counts per bucket, in `CATEGORIES` order. Buckets with
 * nothing in them are kept at zero; the caller decides whether to draw them.
 */
export function categoryTotals(files: Iterable<SizedFile>): CategoryTotal[] {
  const bytes = new Map<StorageCategory, number>();
  const counts = new Map<StorageCategory, number>();
  for (const file of files) {
    const category = storageCategory(file.path);
    const size = Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
    bytes.set(category, (bytes.get(category) ?? 0) + size);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    bytes: bytes.get(category) ?? 0,
    files: counts.get(category) ?? 0,
  }));
}
