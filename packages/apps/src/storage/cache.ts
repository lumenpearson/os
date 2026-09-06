/**
 * The last scan, kept under the user's home so reopening the window can show
 * the previous figures at once instead of walking the tree first.
 *
 * A cached result is always shown with the time it was taken. It is a record
 * of a past measurement, not a claim about the disk right now.
 */

import type { ScanFile, ScanResult } from './scan';

export const CACHE_VERSION = 1;

/** Above this the record is not worth keeping in a settings file. */
export const MAX_CACHED_FILES = 20_000;

export interface CacheRecord {
  version: number;
  result: ScanResult;
}

/** A record to write, or null when this result must not be cached. */
export function toCacheRecord(result: ScanResult): CacheRecord | null {
  if (!result.complete) return null;
  if (result.files.length > MAX_CACHED_FILES) return null;
  return { version: CACHE_VERSION, result };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toFile(value: unknown): ScanFile | null {
  if (!isObject(value) || typeof value.path !== 'string') return null;
  return { path: value.path, size: num(value.size), modifiedAt: num(value.modifiedAt) };
}

/**
 * Read a cache file back. Returns null for anything that is not a complete
 * record of a scan of `root` — a file written by an older version, a hand-
 * edited one, or one taken of a different folder.
 */
export function fromCacheRecord(value: unknown, root: string): ScanResult | null {
  if (!isObject(value) || value.version !== CACHE_VERSION) return null;
  const result = value.result;
  if (!isObject(result) || result.root !== root) return null;
  if (!Array.isArray(result.files)) return null;
  const files: ScanFile[] = [];
  for (const raw of result.files) {
    const file = toFile(raw);
    if (file) files.push(file);
  }
  const errors = Array.isArray(result.errors)
    ? result.errors.flatMap((raw) =>
        isObject(raw) && typeof raw.path === 'string' && typeof raw.message === 'string'
          ? [{ path: raw.path, message: raw.message }]
          : [],
      )
    : [];
  const finishedAt = num(result.finishedAt);
  if (finishedAt <= 0) return null;
  return {
    root,
    files,
    directories: num(result.directories),
    bytes: num(
      result.bytes,
      files.reduce((sum, f) => sum + f.size, 0),
    ),
    errors,
    startedAt: num(result.startedAt, finishedAt),
    finishedAt,
    complete: true,
    truncated: result.truncated === true,
  };
}
