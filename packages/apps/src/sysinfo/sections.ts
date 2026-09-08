/**
 * The spec sheet itself: a snapshot of the machine turned into labelled
 * rows. The screen and the text report render the same `Section[]`, so a
 * saved report can never disagree with what the window showed.
 *
 * One rule runs through this file. Values that only the native host can
 * measure are read from `SystemInfo` on the desktop build and marked
 * unavailable in a browser — the web platform bridge fills those fields with
 * plausible substitutes (a simulated load, `deviceMemory` as the installed
 * total, a user-agent guess at the OS) and this app must not repeat them.
 */

import type { PlatformKind, SystemInfo } from '@lumen/platform';
import { formatBytes } from '@lumen/vfs';
import {
  bytesFact,
  type Fact,
  type FeatureSupport,
  type GpuReading,
  known,
  maybe,
  type ProbeEnv,
  probeArchitecture,
  probeBrowser,
  probeColorDepth,
  probeColorScheme,
  probeCores,
  probeDeviceMemory,
  probeDevicePixels,
  probeEngine,
  probeHeap,
  probeHostSystem,
  probeLanguages,
  probeLocale,
  probePixelRatio,
  probePointer,
  probeReducedMotion,
  probeScreenSize,
  probeTimeZone,
  probeUserAgent,
  REASONS,
  supportFact,
  type UaHints,
  unknown,
} from './probe';
import type { RefreshEstimate } from './refresh';

export interface StorageReading {
  /** `navigator.storage.estimate()` or the file-system adapter's own figures. */
  source: 'storage-api' | 'adapter';
  used: number;
  quota: number | null;
}

export interface Snapshot {
  collectedAt: number;
  kind: PlatformKind;
  /** What the platform bridge answered, or null if the call failed. */
  info: SystemInfo | null;
  /** `Vfs` adapter id: opfs, indexeddb, memory or tauri. */
  adapterId: string;
  hints: UaHints | null;
  gpu: GpuReading;
  refresh: RefreshEstimate;
  storage: StorageReading | null;
  /** Sum of every file size in the VFS, or null if the walk failed. */
  vfsBytes: number | null;
  features: FeatureSupport[];
  /** Epoch ms when the kernel booted this session. */
  bootedAt: number;
  /** Uptime recorded for earlier sessions, or null if never written. */
  previousUptimeMs: number | null;
  env: ProbeEnv;
}

export interface LiveValues {
  now: number;
  /** Boot time in the user's date format; formatting needs kernel settings. */
  startedAtLabel: string;
}

export interface FactRow {
  id: string;
  label: string;
  fact: Fact;
  /** Where an available value came from, or what it does not include. */
  note?: string;
}

export interface Section {
  id: string;
  title: string;
  rows: FactRow[];
}

const ADAPTER_NAMES: Record<string, string> = {
  opfs: 'Origin private file system',
  indexeddb: 'IndexedDB',
  memory: 'In memory (nothing is persisted)',
  tauri: 'Host file system',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `1 d 02:03:04`, or `02:03:04` under a day. Fixed width, so it ticks quietly. */
export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(total / 86_400);
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(
    Math.floor((total % 3600) / 60),
  )}:${pad(total % 60)}`;
  return days > 0 ? `${days} d ${clock}` : clock;
}

function row(id: string, label: string, fact: Fact, note?: string): FactRow {
  return note && fact.available ? { id, label, fact, note } : { id, label, fact };
}

function refreshRow(estimate: RefreshEstimate): FactRow {
  if (estimate.hz === null) {
    return row('graphics.refresh', 'Refresh rate', unknown(estimate.reason ?? REASONS.noScreen));
  }
  return row(
    'graphics.refresh',
    'Refresh rate',
    known(`${estimate.hz} Hz`),
    `Measured over ${estimate.frames} frames in ${estimate.spanMs} ms.`,
  );
}

function storageRows(snapshot: Snapshot): FactRow[] {
  const { storage } = snapshot;
  const fromApi = storage?.source === 'storage-api';
  return [
    row(
      'storage.backend',
      'Backend',
      known(ADAPTER_NAMES[snapshot.adapterId] ?? snapshot.adapterId),
    ),
    row(
      'storage.files',
      'Lumen OS files',
      bytesFact(snapshot.vfsBytes, 'The file system could not be walked.'),
      'Sum of every file size in the Lumen OS file system.',
    ),
    row(
      'storage.used',
      'In use',
      storage ? known(formatBytes(storage.used)) : unknown(REASONS.storage),
      fromApi
        ? 'navigator.storage.estimate(): everything this origin stores, not only Lumen OS.'
        : 'Reported by the file-system adapter.',
    ),
    row(
      'storage.quota',
      'Quota',
      bytesFact(storage?.quota, REASONS.quota),
      fromApi
        ? "The browser's ceiling for this origin; it moves with free disk space."
        : 'Bytes in use plus the free space on the volume.',
    ),
  ];
}

function uptimeRows(snapshot: Snapshot, host: SystemInfo | null, live: LiveValues): FactRow[] {
  const sessionMs = Math.max(0, live.now - snapshot.bootedAt);
  const sinceCollected = Math.max(0, live.now - snapshot.collectedAt) / 1000;
  const rows: FactRow[] = [
    row(
      'uptime.session',
      'This session',
      known(formatDuration(sessionMs / 1000)),
      'Since the kernel booted, from the session store.',
    ),
    row(
      'uptime.started',
      'Started',
      maybe(live.startedAtLabel, 'The kernel did not record a boot time.'),
    ),
    row(
      'uptime.host',
      'Host uptime',
      host ? known(formatDuration(host.uptime + sinceCollected)) : unknown(REASONS.hostUptime),
      'Since the computer booted, from sysinfo.',
    ),
  ];
  rows.push(
    row(
      'uptime.total',
      'Total across sessions',
      snapshot.previousUptimeMs === null
        ? unknown(REASONS.stateFile)
        : known(formatDuration((snapshot.previousUptimeMs + sessionMs) / 1000)),
      'Earlier sessions recorded in /System/state.json, plus this one.',
    ),
  );
  return rows;
}

/** The whole sheet. Pure: everything it prints comes from `snapshot`. */
export function buildSections(snapshot: Snapshot, live: LiveValues): Section[] {
  const { env, info, gpu, hints } = snapshot;
  // Only the native build measures the host. In a browser the same fields
  // hold the web bridge's substitutes, so they are not read here.
  const host = snapshot.kind === 'tauri' ? info : null;
  const nav = env.navigator;

  const overview: Section = {
    id: 'overview',
    title: 'Overview',
    rows: [
      row(
        'overview.version',
        'Version',
        maybe(info?.appVersion, REASONS.platformBridge),
        'Compiled in from the host application package version.',
      ),
      row('overview.kernel', 'Kernel', maybe(info?.kernel, REASONS.platformBridge)),
      row(
        'overview.build',
        'Build target',
        known(snapshot.kind === 'tauri' ? 'Desktop (Tauri)' : 'Web browser'),
      ),
      row(
        'overview.host',
        'Host system',
        probeHostSystem(host?.os ?? null, nav, hints),
        host ? 'Reported by sysinfo.' : 'From navigator.userAgentData, not the user-agent string.',
      ),
      row(
        'overview.device',
        'Device name',
        host ? maybe(host.hostname, REASONS.hostname) : unknown(REASONS.hostname),
      ),
    ],
  };

  const processor: Section = {
    id: 'processor',
    title: 'Processor',
    rows: [
      row(
        'processor.model',
        'Model',
        host ? maybe(host.cpu.model, REASONS.cpuModel) : unknown(REASONS.cpuModel),
        'Reported by sysinfo.',
      ),
      row(
        'processor.cores',
        'Logical cores',
        host ? maybe(host.cpu.cores, REASONS.cores) : probeCores(nav),
        host
          ? 'Logical CPUs reported by sysinfo.'
          : 'navigator.hardwareConcurrency: the threads the browser will schedule on.',
      ),
      row(
        'processor.architecture',
        'Architecture',
        probeArchitecture(host?.os.arch ?? null, hints),
        host ? 'Reported by sysinfo.' : 'From user-agent client hints.',
      ),
    ],
  };

  const memoryUsed =
    host && host.memory.total >= host.memory.available
      ? host.memory.total - host.memory.available
      : null;
  const memory: Section = {
    id: 'memory',
    title: 'Memory',
    rows: [
      row(
        'memory.total',
        'Physical memory',
        host
          ? bytesFact(host.memory.total, REASONS.installedMemory)
          : unknown(REASONS.installedMemory),
        'Reported by sysinfo.',
      ),
      row(
        'memory.used',
        'In use',
        host ? bytesFact(memoryUsed, REASONS.installedMemory) : unknown(REASONS.installedMemory),
        'Total minus the memory the host reports as available.',
      ),
      row(
        'memory.device',
        'Device memory',
        probeDeviceMemory(nav),
        'navigator.deviceMemory: a power of two capped at 8 GB, not the installed total.',
      ),
      row(
        'memory.heapUsed',
        'JS heap in use',
        probeHeap(env.heap, 'usedJSHeapSize'),
        'performance.memory, Chromium only.',
      ),
      row('memory.heapLimit', 'JS heap limit', probeHeap(env.heap, 'jsHeapSizeLimit')),
    ],
  };

  const graphics: Section = {
    id: 'graphics',
    title: 'Graphics',
    rows: [
      row('graphics.renderer', 'Renderer', gpu.renderer, 'WEBGL_debug_renderer_info.'),
      row('graphics.vendor', 'Vendor', gpu.vendor),
      row('graphics.api', 'Graphics API', gpu.api),
      row('graphics.screen', 'Screen', probeScreenSize(env.screen), 'CSS pixels.'),
      row(
        'graphics.devicePixels',
        'Device pixels',
        probeDevicePixels(env.screen, env.devicePixelRatio),
        'Screen size multiplied by the device pixel ratio.',
      ),
      row('graphics.ratio', 'Pixel ratio', probePixelRatio(env.devicePixelRatio)),
      refreshRow(snapshot.refresh),
      row('graphics.depth', 'Colour depth', probeColorDepth(env.screen)),
      row(
        'graphics.scheme',
        'Colour scheme',
        probeColorScheme(env.matchMedia),
        'The display preference, not the Lumen OS theme.',
      ),
      row('graphics.motion', 'Reduced motion', probeReducedMotion(env.matchMedia)),
      row('graphics.pointer', 'Primary pointer', probePointer(env.matchMedia)),
    ],
  };

  const storage: Section = { id: 'storage', title: 'Storage', rows: storageRows(snapshot) };

  const softwareRows: FactRow[] = [
    row('software.browser', 'Browser', probeBrowser(nav)),
    row('software.engine', 'Engine', probeEngine(nav?.userAgent), 'From the user-agent string.'),
  ];
  if (snapshot.kind === 'tauri') {
    softwareRows.push(
      row('software.tauri', 'Tauri', unknown(REASONS.tauriVersion)),
      row('software.rust', 'Rust', unknown(REASONS.rustVersion)),
    );
  }
  softwareRows.push(
    row('software.languages', 'Languages', probeLanguages(nav)),
    row('software.locale', 'Locale', probeLocale(env.dateTimeFormat), 'Resolved by Intl.'),
    row(
      'software.timeZone',
      'Time zone',
      probeTimeZone(env.dateTimeFormat, env.timeZoneOffsetMinutes),
    ),
    row('software.userAgent', 'User agent', probeUserAgent(nav)),
  );
  const software: Section = { id: 'software', title: 'Software', rows: softwareRows };

  const features: Section = {
    id: 'features',
    title: 'Feature support',
    rows: snapshot.features.map((feature) =>
      row(`features.${feature.id}`, feature.label, supportFact(feature.supported)),
    ),
  };

  const uptime: Section = {
    id: 'uptime',
    title: 'Uptime',
    rows: uptimeRows(snapshot, host, live),
  };

  return [overview, processor, memory, graphics, storage, software, features, uptime];
}

/** How many rows the sheet could not fill in. */
export function countUnavailable(sections: readonly Section[]): number {
  return sections.reduce(
    (total, section) => total + section.rows.filter((r) => !r.fact.available).length,
    0,
  );
}
