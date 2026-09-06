/**
 * Takes one snapshot of the machine. This is the only file that touches the
 * running system; everything it gathers goes into a plain `Snapshot` that the
 * pure code in sections.ts and report.ts turns into rows and text.
 */

import { type PersistedState, STATE_FILE } from '@lumen/kernel';
import type { Platform } from '@lumen/platform';
import type { Vfs } from '@lumen/vfs';
import { readEnv, readFeatures, readGpu, readUaHints } from './probe';
import {
  estimateRefreshRate,
  type FrameSampler,
  type RefreshEstimate,
  sampleFrames,
  windowSampler,
} from './refresh';
import type { Snapshot, StorageReading } from './sections';

/** Long enough for a stable median at 60 Hz, short enough not to be noticed. */
export const SAMPLE_MS = 600;

interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/**
 * Storage figures. In a browser the Storage API is the authority for the
 * origin; the desktop build asks the adapter, which measures the Lumen OS
 * directory and the volume it sits on.
 */
export async function readStorage(
  vfs: Vfs,
  kind: Platform['kind'],
): Promise<StorageReading | null> {
  if (kind !== 'tauri') {
    const storage =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator.storage as StorageManagerLike | undefined);
    if (typeof storage?.estimate === 'function') {
      try {
        const estimate = await storage.estimate();
        if (typeof estimate.usage === 'number') {
          return {
            source: 'storage-api',
            used: estimate.usage,
            quota: typeof estimate.quota === 'number' ? estimate.quota : null,
          };
        }
      } catch {
        /* fall through to the adapter */
      }
    }
  }
  try {
    const usage = await vfs.usage();
    return { source: 'adapter', used: usage.used, quota: usage.quota };
  } catch {
    return null;
  }
}

/** Bytes of files in the VFS, or null if the walk failed. */
export async function readVfsBytes(vfs: Vfs): Promise<number | null> {
  try {
    return await vfs.du('/');
  } catch {
    return null;
  }
}

/** Uptime the kernel recorded for earlier sessions. */
export async function readPreviousUptime(vfs: Vfs): Promise<number | null> {
  try {
    const state = await vfs.readJson<Partial<PersistedState>>(STATE_FILE);
    const total = state.totalUptimeMs;
    return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
  } catch {
    return null;
  }
}

export interface CollectOptions {
  platform: Platform;
  vfs: Vfs;
  /** Epoch ms when the kernel booted this session. */
  bootedAt: number;
  sampler?: FrameSampler;
  sampleMs?: number;
  signal?: AbortSignal;
}

async function measureRefreshRate(options: CollectOptions): Promise<RefreshEstimate> {
  const sampler = options.sampler ?? windowSampler();
  const sample = sampleFrames(options.sampleMs ?? SAMPLE_MS, sampler);
  const abort = () => sample.cancel();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    return estimateRefreshRate(await sample.timestamps);
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function collectSnapshot(options: CollectOptions): Promise<Snapshot> {
  const { platform, vfs } = options;
  const [info, hints, storage, vfsBytes, previousUptimeMs, refresh] = await Promise.all([
    platform.system.info().catch(() => null),
    readUaHints(),
    readStorage(vfs, platform.kind),
    readVfsBytes(vfs),
    readPreviousUptime(vfs),
    measureRefreshRate(options),
  ]);
  return {
    collectedAt: Date.now(),
    kind: platform.kind,
    info,
    adapterId: vfs.adapter.id,
    hints,
    gpu: readGpu(),
    refresh,
    storage,
    vfsBytes,
    features: readFeatures(),
    bootedAt: options.bootedAt,
    previousUptimeMs,
    env: readEnv(),
  };
}
