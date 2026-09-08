/**
 * What this platform can honestly measure, and what it cannot. Every reading
 * the Task Manager shows comes from a real source:
 *
 * - frame rate: requestAnimationFrame timestamps in this document
 * - JS heap: `performance.memory` (Chromium only)
 * - storage: the VFS adapter's `usage()` (navigator.storage.estimate on the
 *   web, the sandboxed home directory on the desktop)
 * - processes: the kernel's process store
 * - host CPU / host memory: the desktop bridge (`platform.system.metrics`)
 *
 * Where a source is missing the UI prints an em-dash and the note from
 * `metricSupport`. It never substitutes a plausible number.
 */
import type { PlatformKind } from '@lumen/platform';

export type MetricId =
  | 'frameRate'
  | 'heap'
  | 'storage'
  | 'processes'
  | 'hostCpu'
  | 'hostMemory'
  | 'appMemory';

export interface MetricEnv {
  host: PlatformKind;
  /** platform.capabilities.realMetrics: the host reports its own load. */
  realMetrics: boolean;
  /** `performance.memory` exists in this engine. */
  heap: boolean;
  /** The storage adapter implements `usage()`. */
  storage: boolean;
}

export type MetricSupport = { available: true } | { available: false; note: string };

const AVAILABLE: MetricSupport = { available: true };

export function metricSupport(id: MetricId, env: MetricEnv): MetricSupport {
  switch (id) {
    case 'frameRate':
    case 'processes':
      return AVAILABLE;
    case 'heap':
      return env.heap
        ? AVAILABLE
        : {
            available: false,
            note: 'performance.memory is Chromium-only and this engine hides it.',
          };
    case 'storage':
      return env.storage
        ? AVAILABLE
        : { available: false, note: 'This file system reports no usage figure.' };
    case 'hostCpu':
      return env.realMetrics
        ? AVAILABLE
        : { available: false, note: 'A browser cannot read host CPU load. The desktop build can.' };
    case 'hostMemory':
      return env.realMetrics
        ? AVAILABLE
        : { available: false, note: 'A browser cannot read host memory. The desktop build can.' };
    case 'appMemory':
      return {
        available: false,
        note:
          env.host === 'tauri'
            ? 'Every app runs inside one host process, so memory is not split per app.'
            : 'A browser cannot attribute heap to a single window.',
      };
  }
}

/**
 * Shortest span that can carry a frame rate. A display delivers a frame every
 * ~8–17 ms, so counting for less than this says nothing: zero frames over two
 * milliseconds is not "0 fps", it is no measurement at all.
 */
export const MIN_FRAME_SPAN_MS = 100;

/** Frames counted over an elapsed span. Null when no usable span has passed. */
export function frameRate(frames: number, elapsedMs: number): number | null {
  if (!Number.isFinite(frames) || frames < 0) return null;
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_FRAME_SPAN_MS) return null;
  return (frames * 1000) / elapsedMs;
}

export interface HeapReading {
  used: number;
  total: number;
  limit: number;
}

interface JsHeapMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function heapApi(): JsHeapMemory | null {
  if (typeof performance === 'undefined') return null;
  const memory = (performance as Performance & { memory?: JsHeapMemory }).memory;
  if (!memory || typeof memory.usedJSHeapSize !== 'number') return null;
  return memory;
}

export function heapSupported(): boolean {
  return heapApi() !== null;
}

/** Current JS heap, or null where the engine does not expose it. */
export function readHeap(): HeapReading | null {
  const memory = heapApi();
  if (!memory) return null;
  return {
    used: memory.usedJSHeapSize,
    total: memory.totalJSHeapSize,
    limit: memory.jsHeapSizeLimit,
  };
}
