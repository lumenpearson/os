/**
 * Live charts for everything this platform can measure. Sampling runs on one
 * interval, stops when the document is hidden or the window is minimized, and
 * clears the buffers when the interval changes so a chart never mixes rates.
 */
import { useProcessStore } from '@lumen/kernel';
import { usePlatform, useVfs } from '@lumen/kernel/react';
import { formatBytes } from '@lumen/vfs';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Chart, type ChartProps } from './Chart';
import { SERIES_CAPACITY } from './config';
import {
  EM_DASH,
  formatCount,
  formatFrameRate,
  formatInterval,
  formatPercent,
  formatSpan,
} from './format';
import {
  heapSupported,
  type MetricEnv,
  type MetricSupport,
  metricSupport,
  readHeap,
} from './metrics';
import { logicalCores, useDocumentVisible, useFrameCounter, useSystemInfo } from './samplers';
import { EMPTY_STATS, Series, type SeriesStats } from './series';

/** Storage is a slow figure and the estimate is not free; it samples slower. */
const STORAGE_INTERVAL_MS = 5000;

type ChartId = 'frameRate' | 'heap' | 'storage' | 'processes' | 'hostCpu' | 'hostMemory';

const CHART_IDS: readonly ChartId[] = [
  'frameRate',
  'heap',
  'processes',
  'storage',
  'hostCpu',
  'hostMemory',
];

type SeriesSet = Record<ChartId, Series>;

interface Snapshot {
  values: Record<ChartId, number[]>;
  stats: Record<ChartId, SeriesStats>;
  /** Scale tops the platform reports; null until read, or where unavailable. */
  heapLimit: number | null;
  quota: number | null;
  hostMemoryTotal: number | null;
}

function createSeries(): SeriesSet {
  return {
    frameRate: new Series(SERIES_CAPACITY),
    heap: new Series(SERIES_CAPACITY),
    storage: new Series(SERIES_CAPACITY),
    processes: new Series(SERIES_CAPACITY),
    hostCpu: new Series(SERIES_CAPACITY),
    hostMemory: new Series(SERIES_CAPACITY),
  };
}

function emptySnapshot(): Snapshot {
  const values = {} as Record<ChartId, number[]>;
  const stats = {} as Record<ChartId, SeriesStats>;
  for (const id of CHART_IDS) {
    values[id] = [];
    stats[id] = EMPTY_STATS;
  }
  return { values, stats, heapLimit: null, quota: null, hostMemoryTotal: null };
}

export interface PerformanceTabProps {
  /** Sampling runs only while this is true. */
  active: boolean;
  refreshMs: number;
}

export function PerformanceTab({ active, refreshMs }: PerformanceTabProps) {
  const platform = usePlatform();
  const vfs = useVfs();
  const documentVisible = useDocumentVisible();
  const sampling = active && documentVisible;
  const readFrameRate = useFrameCounter(sampling);
  const [series] = useState(createSeries);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const scales = useRef({ heapLimit: null, quota: null, hostMemoryTotal: null } as {
    heapLimit: number | null;
    quota: number | null;
    hostMemoryTotal: number | null;
  });

  const env = useMemo<MetricEnv>(
    () => ({
      host: platform.kind,
      realMetrics: platform.capabilities.realMetrics,
      heap: heapSupported(),
      storage: typeof platform.adapter.usage === 'function',
    }),
    [platform],
  );
  const support = useMemo<Record<ChartId, MetricSupport>>(() => {
    const out = {} as Record<ChartId, MetricSupport>;
    for (const id of CHART_IDS) out[id] = metricSupport(id, env);
    return out;
  }, [env]);

  useEffect(() => {
    if (!sampling) return;
    // One x slot is one interval, so a pause or a new interval would leave a
    // hole that the plot cannot show. The buffers start again instead of
    // drawing a straight line across the time nothing was measured.
    for (const id of CHART_IDS) series[id].clear();
    setSnapshot(emptySnapshot());
    let cancelled = false;
    let busy = false;
    let sinceStorage = Number.POSITIVE_INFINITY;

    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const fps = readFrameRate();
        if (fps !== null) series.frameRate.push(fps);

        const heap = readHeap();
        if (heap) {
          series.heap.push(heap.used);
          scales.current.heapLimit = heap.limit;
        }

        series.processes.push(Object.keys(useProcessStore.getState().processes).length);

        if (support.hostCpu.available) {
          const metrics = await platform.system.metrics();
          if (cancelled) return;
          series.hostCpu.push(metrics.cpu);
          series.hostMemory.push(metrics.memory.used);
          scales.current.hostMemoryTotal = metrics.memory.total;
        }

        sinceStorage += refreshMs;
        if (support.storage.available && sinceStorage >= STORAGE_INTERVAL_MS) {
          sinceStorage = 0;
          const usage = await vfs.usage();
          if (cancelled) return;
          series.storage.push(usage.used);
          scales.current.quota = usage.quota;
        }
      } catch {
        // A source that failed this tick simply contributes no sample.
      } finally {
        busy = false;
      }
      if (cancelled) return;
      const values = {} as Record<ChartId, number[]>;
      const stats = {} as Record<ChartId, SeriesStats>;
      for (const id of CHART_IDS) {
        values[id] = series[id].values();
        stats[id] = series[id].stats();
      }
      setSnapshot({ values, stats, ...scales.current });
    };

    void read();
    const id = setInterval(() => void read(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sampling, refreshMs, series, support, platform, vfs, readFrameRate]);

  const charts = useMemo(
    () => buildCharts(snapshot, support, refreshMs, platform.adapter.id),
    [snapshot, support, refreshMs, platform.adapter.id],
  );

  return (
    <div className="lumen-scroll min-h-0 flex-1 p-3">
      <SystemFacts refreshMs={refreshMs} />
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3">
        {charts.map((chart) => (
          <Chart key={chart.title} {...chart} />
        ))}
      </div>
      {!sampling && (
        <p className="mt-3 text-sm text-ink-3">Sampling is paused while the window is hidden.</p>
      )}
    </div>
  );
}

function value(stat: number | null, format: (v: number) => string): string {
  return stat === null ? EM_DASH : format(stat);
}

function buildCharts(
  snapshot: Snapshot,
  support: Record<ChartId, MetricSupport>,
  refreshMs: number,
  adapterId: string,
): ChartProps[] {
  const { stats, values } = snapshot;
  const span = formatSpan(SERIES_CAPACITY, refreshMs);
  const note = (id: ChartId) => {
    const state = support[id];
    return state.available ? undefined : state.note;
  };
  const plot = (id: ChartId): number[] => (support[id].available ? values[id] : []);

  const fpsTop = Math.max(60, Math.ceil(stats.frameRate.max ?? 0));
  const heapTop = snapshot.heapLimit ?? stats.heap.max ?? 0;
  const storageTop = snapshot.quota ?? stats.storage.max ?? 0;
  const processTop = Math.max(1, Math.ceil(stats.processes.max ?? 0));
  const hostMemoryTop = snapshot.hostMemoryTotal ?? stats.hostMemory.max ?? 0;

  return [
    {
      title: 'Frame rate',
      source: 'Animation frames delivered to this window',
      value: value(stats.frameRate.last, formatFrameRate),
      unit: 'fps',
      values: plot('frameRate'),
      max: fpsTop,
      scale: `0 – ${fpsTop} fps`,
      span,
      slots: SERIES_CAPACITY,
      note: note('frameRate'),
    },
    {
      title: 'JS heap used',
      source: 'performance.memory for this document',
      value: value(stats.heap.last, (v) => formatBytes(v)),
      values: plot('heap'),
      max: heapTop || undefined,
      scale: snapshot.heapLimit
        ? `0 – ${formatBytes(snapshot.heapLimit, 0)} limit`
        : `0 – ${value(stats.heap.max, (v) => formatBytes(v))}`,
      span,
      slots: SERIES_CAPACITY,
      note: note('heap'),
    },
    {
      title: 'Processes',
      source: 'Entries in the kernel process table',
      value: value(stats.processes.last, formatCount),
      values: plot('processes'),
      max: processTop,
      scale: `0 – ${processTop}`,
      span,
      slots: SERIES_CAPACITY,
      note: note('processes'),
    },
    {
      title: 'Storage used',
      source: `Bytes the ${adapterId} file system reports in use`,
      value: value(stats.storage.last, (v) => formatBytes(v)),
      values: plot('storage'),
      max: storageTop || undefined,
      scale: snapshot.quota
        ? `0 – ${formatBytes(snapshot.quota, 0)} quota`
        : `0 – ${value(stats.storage.max, (v) => formatBytes(v))}`,
      span: formatSpan(SERIES_CAPACITY, Math.max(refreshMs, STORAGE_INTERVAL_MS)),
      slots: SERIES_CAPACITY,
      note: note('storage'),
    },
    {
      title: 'Host CPU',
      source: 'Load reported by the desktop host',
      value: value(stats.hostCpu.last, (v) => formatPercent(v)),
      values: plot('hostCpu'),
      max: 100,
      scale: '0 – 100%',
      span,
      slots: SERIES_CAPACITY,
      note: note('hostCpu'),
    },
    {
      title: 'Host memory used',
      source: 'Physical memory reported by the desktop host',
      value: value(stats.hostMemory.last, (v) => formatBytes(v)),
      values: plot('hostMemory'),
      max: hostMemoryTop || undefined,
      scale: snapshot.hostMemoryTotal
        ? `0 – ${formatBytes(snapshot.hostMemoryTotal, 0)} total`
        : `0 – ${value(stats.hostMemory.max, (v) => formatBytes(v))}`,
      span,
      slots: SERIES_CAPACITY,
      note: note('hostMemory'),
    },
  ];
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mono truncate-1 text-base text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function SystemFacts({ refreshMs }: { refreshMs: number }) {
  const platform = usePlatform();
  const info = useSystemInfo();
  const cores = platform.capabilities.realMetrics ? (info?.cpu.cores ?? null) : logicalCores();
  const pending = '…';
  const os = info ? `${info.os.name} ${info.os.version}`.trim() : pending;
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      <Fact label="Host">{info ? (info.host === 'tauri' ? 'Desktop' : 'Browser') : pending}</Fact>
      <Fact label="Platform">{os}</Fact>
      <Fact label="Logical cores">{cores ?? EM_DASH}</Fact>
      <Fact label="Display">
        {info ? `${info.display.width}×${info.display.height} @ ${info.display.scale}×` : pending}
      </Fact>
      <Fact label="File system">{platform.adapter.id}</Fact>
      <Fact label="Sampling">{formatInterval(refreshMs)}</Fact>
    </dl>
  );
}
