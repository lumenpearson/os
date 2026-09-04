/**
 * The Task Manager window. It owns the view state (persisted under the user's
 * home), the process selection, and the single interval every ticking cell in
 * the window shares. Each tab is mounted only while it is shown, so a chart
 * never resumes onto a buffer with a hole in it.
 */
import type { AppId, Pid } from '@lumen/kernel';
import { useProcessStore, useWindowStore } from '@lumen/kernel';
import { useApps, useKernel, usePlatform } from '@lumen/kernel/react';
import {
  SegmentedControl,
  type SegmentedOption,
  Select,
  type SelectOption,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useLauncher, useTitle } from '../_sdk';
import { AppsTab } from './AppsTab';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  REFRESH_RATES,
  TAB_IDS,
  type TabId,
  type TaskManagerConfig,
} from './config';
import { formatInterval } from './format';
import { buildTaskManagerMenus } from './menus';
import { heapSupported, type MetricEnv, metricSupport } from './metrics';
import { PerformanceTab } from './PerformanceTab';
import { ProcessesTab } from './ProcessesTab';
import {
  buildProcessRows,
  endProcessMessage,
  nextSelection,
  type ProcessRow,
  processSignature,
  processSortValue,
  windowSignature,
} from './processes';
import { useDocumentVisible } from './samplers';
import { sortRows } from './sort';
import { TickProvider } from './tick';

const TAB_LABEL: Record<TabId, string> = {
  processes: 'Processes',
  performance: 'Performance',
  apps: 'Apps',
};

const TAB_OPTIONS: ReadonlyArray<SegmentedOption<TabId>> = TAB_IDS.map((id) => ({
  value: id,
  label: TAB_LABEL[id],
}));

const RATE_OPTIONS: ReadonlyArray<SelectOption> = REFRESH_RATES.map((ms) => ({
  value: String(ms),
  label: formatInterval(ms),
}));

/** Window width at which the refresh control still has room for its label. */
const LABEL_AT = 560;

export default function TaskManager({ pid, windowId }: AppProps) {
  const kernel = useKernel();
  const platform = usePlatform();
  const dialogs = useDialogs();
  const { launch } = useLauncher();
  const apps = useApps({ includeHidden: true });
  const documentVisible = useDocumentVisible();
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  // Selected narrowly: this window's bounds change at pointer rate while it
  // is dragged, and none of that concerns the monitor.
  const minimized = useWindowStore((s) => s.windows[windowId]?.minimized ?? false);
  useTitle('Task Manager');

  const [stored, setStored] = useJsonFile<unknown>(
    join(kernel.home, '.config', 'taskmanager.json'),
    DEFAULT_CONFIG,
  );
  const config = useMemo(() => normalizeConfig(stored), [stored]);
  const patch = useCallback(
    (next: Partial<TaskManagerConfig>) => setStored({ ...config, ...next }),
    [config, setStored],
  );

  const [selection, setSelection] = useState<ReadonlySet<Pid>>(() => new Set<Pid>());

  /** Whether memory can be attributed to one app on this host, and why not. */
  const appMemory = useMemo(() => {
    const env: MetricEnv = {
      host: platform.kind,
      realMetrics: platform.capabilities.realMetrics,
      heap: heapSupported(),
      storage: typeof platform.adapter.usage === 'function',
    };
    return metricSupport('appMemory', env);
  }, [platform]);

  // The kernel rewrites every process on its own load tick; these digests
  // cover only what the table draws, so that tick costs no render.
  const processSig = useProcessStore((s) => processSignature(s.processes));
  const windowSig = useWindowStore((s) => windowSignature(s.windows, s.focusedId));

  // biome-ignore lint/correctness/useExhaustiveDependencies: the digests are the memo key; the rows themselves are read from the stores
  const rows = useMemo(() => {
    const windows = useWindowStore.getState();
    return buildProcessRows({
      processes: Object.values(useProcessStore.getState().processes),
      windows: Object.values(windows.windows),
      focusedId: windows.focusedId,
      memoryAvailable: appMemory.available,
    });
  }, [processSig, windowSig, appMemory]);

  const ordered = useMemo(
    () => sortRows(rows, (row) => processSortValue(row, config.sort.column), config.sort.direction),
    [rows, config.sort],
  );

  // A process that has exited cannot stay selected.
  useEffect(() => {
    const live = new Set(rows.map((r) => r.pid));
    setSelection((prev) => {
      const next = new Set([...prev].filter((p) => live.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const selected = useMemo(() => ordered.filter((r) => selection.has(r.pid)), [ordered, selection]);
  const single = selected.length === 1 ? selected[0] : undefined;

  const appsById = useMemo(() => new Map(apps.map((app) => [app.id, app] as const)), [apps]);
  const running = useMemo(() => {
    const map = new Map<AppId, Pid[]>();
    for (const row of ordered) {
      const list = map.get(row.appId);
      if (list) list.push(row.pid);
      else map.set(row.appId, [row.pid]);
    }
    return map;
  }, [ordered]);

  const focusWindow = useCallback((row: ProcessRow) => {
    const first = row.windowIds[0];
    // focus() also un-minimizes, so a hidden window comes back.
    if (first !== undefined) useWindowStore.getState().focus(first);
  }, []);

  const endProcess = useCallback(
    async (pids: readonly Pid[]) => {
      const wanted = new Set(pids);
      const targets = ordered.filter((row) => wanted.has(row.pid));
      if (targets.length === 0) return;
      const warning = endProcessMessage(targets, pid);
      if (warning) {
        const first = targets[0];
        const ok = await dialogs.confirm({
          title:
            targets.length === 1 && first
              ? `End ${first.name}?`
              : `End ${targets.length} processes?`,
          message: warning,
          confirmLabel: targets.length === 1 ? 'End Process' : 'End Processes',
          danger: true,
        });
        if (!ok) return;
      }
      const keep = nextSelection(
        ordered.map((row) => row.pid),
        targets.map((row) => row.pid),
      );
      setSelection(keep === null ? new Set<Pid>() : new Set([keep]));
      // Ending this window's own process takes the table with it, so it goes
      // last and the rest of the selection still ends.
      for (const row of [...targets].sort(
        (a, b) => Number(a.pid === pid) - Number(b.pid === pid),
      )) {
        kernel.kill(row.pid);
      }
    },
    [ordered, pid, dialogs, kernel],
  );

  const quitApp = useCallback(
    (pids: readonly Pid[]) => {
      // Quit runs each window's close guard, so an app with unsaved work asks
      // for itself instead of being asked about here.
      for (const target of pids) void kernel.quitApp(target);
    },
    [kernel],
  );

  const showTab = useCallback((tab: TabId) => patch({ tab }), [patch]);

  useAppMenus(
    buildTaskManagerMenus(
      {
        tab: config.tab,
        refreshMs: config.refreshMs,
        selectionCount: selected.length,
        canFocusWindow: single !== undefined && single.windowIds.length > 0,
      },
      {
        showTab,
        setRefreshMs: (refreshMs) => patch({ refreshMs }),
        endProcess: () => void endProcess(selected.map((row) => row.pid)),
        focusWindow: () => {
          if (single) focusWindow(single);
        },
        quitApp: () => quitApp(selected.map((row) => row.pid)),
      },
    ),
    [
      config.tab,
      config.refreshMs,
      selected,
      single,
      patch,
      showTab,
      endProcess,
      focusWindow,
      quitApp,
    ],
  );

  const paused = !documentVisible || minimized;

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col bg-surface text-ink">
      <Toolbar dense>
        <SegmentedControl
          aria-label="View"
          size="sm"
          options={TAB_OPTIONS}
          value={config.tab}
          onChange={showTab}
        />
        <ToolbarSpacer />
        {/* The narrowest window keeps the control and drops its word for it. */}
        {(size.width === 0 || size.width >= LABEL_AT) && (
          <label htmlFor="taskmanager-refresh" className="text-sm text-ink-2">
            Refresh
          </label>
        )}
        <Select
          id="taskmanager-refresh"
          aria-label="Refresh rate"
          size="sm"
          mono
          options={RATE_OPTIONS}
          value={String(config.refreshMs)}
          onChange={(value) => patch({ refreshMs: Number(value) })}
        />
      </Toolbar>
      <TickProvider paused={paused} intervalMs={config.refreshMs}>
        {config.tab === 'processes' && (
          <ProcessesTab
            rows={ordered}
            apps={appsById}
            sort={config.sort}
            onSortChange={(sort) => patch({ sort })}
            selection={selection}
            onSelectionChange={setSelection}
            memoryNote={appMemory.available ? null : appMemory.note}
            onFocusWindow={focusWindow}
            onEndProcess={(pids) => void endProcess(pids)}
            onQuitApp={quitApp}
          />
        )}
        {config.tab === 'performance' && (
          <PerformanceTab active={!paused} refreshMs={config.refreshMs} />
        )}
        {config.tab === 'apps' && (
          <AppsTab
            apps={apps}
            running={running}
            onLaunch={(appId) => {
              launch(appId);
            }}
            onQuit={quitApp}
          />
        )}
      </TickProvider>
    </div>
  );
}
