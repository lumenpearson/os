/**
 * What every app icon on the bar needs to know: which apps are running, which
 * window has focus, what a click does, and what the context menu offers. The
 * pieces under `items/` each select this narrowly rather than being handed a
 * bundle of props through the bar.
 */

import {
  type AppDefinition,
  useRegistryStore,
  useSettingsStore,
  useWindowStore,
  type WindowState,
} from '@lumen/kernel';
import { useKernel, useProcesses, useWindows } from '@lumen/kernel/react';
import type { MenuEntry } from '@lumen/ui';
import { useMemo } from 'react';

export interface RunningEntry {
  windows: WindowState[];
  pids: number[];
}

export interface TaskbarApps {
  /** Every registered app, by id. */
  byId: Record<string, AppDefinition | undefined>;
  /** Apps with at least one process, by id. */
  running: Map<string, RunningEntry>;
  /** Ids pinned in Settings, in the order Settings holds them. */
  pinned: string[];
  /** The app ids the bar shows without being asked: pinned, or running. */
  claimed: ReadonlySet<string>;
  isRunning: (id: string) => boolean;
  isActive: (id: string) => boolean;
  /** Launch, focus, or minimise, the way a taskbar button does. */
  activate: (app: AppDefinition) => void;
  contextItems: (app: AppDefinition) => MenuEntry[];
}

/** An app the bar may draw: registered, and not hidden from launchers. */
export function visibleApps(
  ids: readonly string[],
  byId: Record<string, AppDefinition | undefined>,
): AppDefinition[] {
  const out: AppDefinition[] = [];
  for (const id of ids) {
    const app = byId[id];
    if (app && !app.hidden) out.push(app);
  }
  return out;
}

export function useTaskbarApps(): TaskbarApps {
  const kernel = useKernel();
  const byId = useRegistryStore((s) => s.apps);
  const processes = useProcesses();
  const windows = useWindows();
  const focusedId = useWindowStore((s) => s.focusedId);
  const pinned = useSettingsStore((s) => s.settings.taskbar.pinned);

  const running = useMemo(() => {
    const map = new Map<string, RunningEntry>();
    for (const p of processes) {
      const entry = map.get(p.appId) ?? { windows: [], pids: [] };
      entry.pids.push(p.pid);
      map.set(p.appId, entry);
    }
    for (const w of windows) map.get(w.appId)?.windows.push(w);
    return map;
  }, [processes, windows]);

  return useMemo(() => {
    const claimed = new Set<string>([...pinned, ...running.keys()]);
    const isRunning = (id: string) => {
      const entry = running.get(id);
      return Boolean(entry && (entry.windows.length > 0 || entry.pids.length > 0));
    };
    const isActive = (id: string) =>
      running.get(id)?.windows.some((w) => w.id === focusedId && !w.minimized) ?? false;

    const activate = (app: AppDefinition) => {
      const entry = running.get(app.id);
      if (!entry || entry.windows.length === 0) {
        void kernel.launch(app.id);
        return;
      }
      const store = useWindowStore.getState();
      const focusedHere = entry.windows.some((w) => w.id === store.focusedId);
      const allMinimized = entry.windows.every((w) => w.minimized);
      if (focusedHere && !allMinimized) {
        for (const w of entry.windows) store.minimize(w.id);
        return;
      }
      const target = [...entry.windows].sort((a, b) => b.zIndex - a.zIndex)[0];
      if (target) store.focus(target.id);
    };

    const contextItems = (app: AppDefinition): MenuEntry[] => {
      const entry = running.get(app.id);
      const isPinned = pinned.includes(app.id);
      return [
        { label: app.name, enabled: false },
        { type: 'separator' },
        {
          label: 'New Window',
          enabled: !app.singleton || !entry,
          onSelect: () => void kernel.launch(app.id),
        },
        ...(entry?.windows.length
          ? entry.windows.map((w) => ({
              label: w.title || app.name,
              onSelect: () => useWindowStore.getState().focus(w.id),
            }))
          : []),
        { type: 'separator' },
        {
          label: isPinned ? 'Unpin from Taskbar' : 'Pin to Taskbar',
          onSelect: () =>
            useSettingsStore.getState().patch('taskbar', {
              pinned: isPinned ? pinned.filter((id) => id !== app.id) : [...pinned, app.id],
            }),
        },
        ...(entry
          ? [
              {
                label: 'Quit',
                danger: true,
                onSelect: () => entry.pids.forEach((pid) => void kernel.quitApp(pid)),
              },
            ]
          : []),
      ];
    };

    return { byId, running, pinned, claimed, isRunning, isActive, activate, contextItems };
  }, [byId, running, pinned, focusedId, kernel]);
}
