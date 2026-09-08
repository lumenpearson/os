/**
 * The thin layer that reads the running system: the file system's own usage
 * figures, the browser's estimate for this origin, and the size of the Trash.
 *
 * Everything here returns plain data for the pure code in `usage.ts` to turn
 * into rows. Nothing is filled in when a call fails — the reason travels with
 * the result so the window can print it instead of a number.
 */

import { type ScanFs, type ScanOptions, scan } from './scan';
import { REASONS, type TrashTotal, type UsageSources } from './usage';

export interface UsageVfs {
  adapter: { id: string };
  usage(): Promise<{ used: number; quota: number | null }>;
}

export interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/** The browser's own view of this origin, or the reason there is none. */
export async function readBrowserEstimate(
  storage: StorageManagerLike | undefined,
): Promise<Pick<UsageSources, 'browser' | 'browserReason'>> {
  if (typeof storage?.estimate !== 'function') {
    return { browser: null, browserReason: REASONS.estimateMissing };
  }
  try {
    const estimate = await storage.estimate();
    return {
      browser: {
        usage: typeof estimate.usage === 'number' ? estimate.usage : null,
        quota: typeof estimate.quota === 'number' ? estimate.quota : null,
      },
    };
  } catch {
    return { browser: null, browserReason: REASONS.estimateFailed };
  }
}

/** `navigator.storage`, where there is a navigator at all. */
export function browserStorage(): StorageManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.storage as StorageManagerLike | undefined;
}

export async function readUsageSources(
  vfs: UsageVfs,
  storage: StorageManagerLike | undefined = browserStorage(),
): Promise<UsageSources> {
  const [adapter, browser] = await Promise.all([
    vfs.usage().catch(() => null),
    readBrowserEstimate(storage),
  ]);
  return { adapterId: vfs.adapter.id, adapter, ...browser };
}

export interface TrashVfs extends ScanFs {
  trashPath: string;
  exists(path: string): Promise<boolean>;
}

export interface TrashReading {
  path: string;
  /** Bytes and files in the Trash, or null when it could not be read. */
  total: TrashTotal | null;
  /** Why the Trash could not be measured. Set whenever `total` is null. */
  reason?: string;
}

/**
 * Measure the Trash by walking it, the same way the home folder is walked.
 * A Trash that has never been created is empty, not unknown; a Trash that
 * refuses to be read is unknown, and says so.
 */
export async function readTrash(vfs: TrashVfs, options: ScanOptions = {}): Promise<TrashReading> {
  const path = vfs.trashPath;
  if (!(await vfs.exists(path))) return { path, total: { bytes: 0, files: 0 } };
  const result = await scan(vfs, path, options);
  const rootError = result.errors.find((error) => error.path === path);
  if (rootError) return { path, total: null, reason: rootError.message };
  return { path, total: { bytes: result.bytes, files: result.files.length } };
}
