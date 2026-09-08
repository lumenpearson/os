/**
 * The recursive scan behind every view.
 *
 * Three things make it usable rather than correct-but-hostile: it hands the
 * event loop back between batches so the window keeps painting, it reports
 * what it has counted so far, and it can be stopped. A directory the sandbox
 * refuses is collected as one error and the walk carries on — one unreadable
 * folder must not cost you the other nine hundred.
 */

import { type DirEntry, VfsError } from '@lumen/vfs';

export interface ScanFile {
  path: string;
  size: number;
  modifiedAt: number;
}

export interface ScanError {
  path: string;
  message: string;
}

export interface ScanProgress {
  /** Files counted so far. */
  files: number;
  /** Directories read so far. */
  directories: number;
  bytes: number;
  /** The directory being read, for the status line. */
  path: string;
}

export interface ScanResult {
  root: string;
  files: ScanFile[];
  directories: number;
  bytes: number;
  errors: ScanError[];
  startedAt: number;
  finishedAt: number;
  /** False when the scan was cancelled or hit the entry ceiling. */
  complete: boolean;
  /** True when the ceiling stopped the walk before the tree ran out. */
  truncated: boolean;
}

/** The one method the scan needs; `Vfs` satisfies it. */
export interface ScanFs {
  readDir(path: string): Promise<DirEntry[]>;
}

export interface ScanOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  /** Entries between two yields to the event loop. */
  batch?: number;
  /** How the scan yields; tests pass a resolved promise. */
  yieldTo?: () => Promise<void>;
  now?: () => number;
  /** Hard ceiling on entries, so a pathological tree cannot hang the window. */
  maxEntries?: number;
}

export const DEFAULT_BATCH = 250;
export const DEFAULT_MAX_ENTRIES = 200_000;

/** Yield through a task, not a microtask: a microtask never lets paint in. */
function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function describe(error: unknown): string {
  if (VfsError.is(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Walk `root` breadth-first, counting every file below it. */
export async function scan(
  fs: ScanFs,
  root: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const batch = Math.max(1, options.batch ?? DEFAULT_BATCH);
  const yieldTo = options.yieldTo ?? macrotask;
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const result: ScanResult = {
    root,
    files: [],
    directories: 0,
    bytes: 0,
    errors: [],
    startedAt: now(),
    finishedAt: now(),
    complete: true,
    truncated: false,
  };

  const queue: string[] = [root];
  const seen = new Set<string>([root]);
  let sinceYield = 0;
  let entries = 0;

  while (queue.length > 0) {
    const dir = queue.shift();
    if (dir === undefined) break;
    if (options.signal?.aborted) {
      result.complete = false;
      break;
    }
    let listing: DirEntry[];
    try {
      listing = await fs.readDir(dir);
    } catch (error) {
      result.errors.push({ path: dir, message: describe(error) });
      continue;
    }
    result.directories++;
    options.onProgress?.({
      files: result.files.length,
      directories: result.directories,
      bytes: result.bytes,
      path: dir,
    });
    for (const entry of listing) {
      entries++;
      if (entries > maxEntries) {
        result.truncated = true;
        result.complete = false;
        break;
      }
      if (entry.kind === 'directory') {
        // The VFS has no links, so a repeat here means a listing that changed
        // under the walk. Visiting it twice would double-count it.
        if (seen.has(entry.path)) continue;
        seen.add(entry.path);
        queue.push(entry.path);
      } else {
        result.files.push({
          path: entry.path,
          size: Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 0,
          modifiedAt: entry.modifiedAt,
        });
        result.bytes += Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 0;
      }
      sinceYield++;
      if (sinceYield >= batch) {
        sinceYield = 0;
        await yieldTo();
        if (options.signal?.aborted) {
          result.complete = false;
          break;
        }
      }
    }
    if (!result.complete) break;
  }

  result.finishedAt = now();
  return result;
}

/** "1,204 files in 87 folders" — what the status line prints while scanning. */
export function progressLabel(progress: ScanProgress): string {
  const files = progress.files.toLocaleString();
  const dirs = progress.directories.toLocaleString();
  return `${files} ${progress.files === 1 ? 'file' : 'files'} in ${dirs} ${
    progress.directories === 1 ? 'folder' : 'folders'
  }`;
}
