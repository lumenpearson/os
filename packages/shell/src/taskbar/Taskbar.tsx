// deslop-ignore-file 09 13 — <Mark> is the product wordmark; the scanner matches the substring 'mark'.
import {
  type AppDefinition,
  useProcessStore,
  useRegistryStore,
  useWindowStore,
} from '@lumen/kernel';
import { useKernel, useProcesses, useSetting, useSettings, useWindows } from '@lumen/kernel/react';
import { AnchoredMenu, cx, type MenuEntry, Tooltip } from '@lumen/ui';
import { LayoutGrid } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Mark } from '../desktop/Wordmark';
import { useShellStore } from '../shellStore';

/**
 * The taskbar: Start, pinned and running apps, and a show-desktop strip at
 * the far end. Position, size, auto-hide and labels come from Settings.
 */
export function Taskbar() {
  const kernel = useKernel();
  const settings = useSettings();
  const [taskbar, setTaskbar] = useSetting('taskbar');
  const apps = useRegistryStore((s) => s.apps);
  const processes = useProcesses();
  const windows = useWindows();
  const startOpen = useShellStore((s) => s.startMenu);
  const toggle = useShellStore((s) => s.toggle);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; app: AppDefinition } | null>(
    null,
  );
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = useMemo(() => {
    const byApp = new Map<string, { windows: typeof windows; pids: number[] }>();
    for (const p of processes) {
      const entry = byApp.get(p.appId) ?? { windows: [], pids: [] };
      entry.pids.push(p.pid);
      byApp.set(p.appId, entry);
    }
    for (const w of windows) byApp.get(w.appId)?.windows.push(w);
    return byApp;
  }, [processes, windows]);

  const items = useMemo(() => {
    const ids = [...taskbar.pinned.filter((id) => apps[id] && !apps[id]?.hidden)];
    for (const id of running.keys())
      if (!ids.includes(id) && apps[id] && !apps[id]?.hidden) ids.push(id);
    return ids.map((id) => apps[id] as AppDefinition);
  }, [taskbar.pinned, apps, running]);

  const vertical = taskbar.position === 'left' || taskbar.position === 'right';
  const size = taskbar.size;
  const autoHide = taskbar.autoHide;
  const hidden = autoHide && !revealed && !startOpen;

  const activate = (app: AppDefinition) => {
    const entry = running.get(app.id);
    if (!entry || entry.windows.length === 0) {
      void kernel.launch(app.id);
      return;
    }
    const store = useWindowStore.getState();
    const focusedId = store.focusedId;
    const focusedHere = entry.windows.some((w) => w.id === focusedId);
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
    const pinned = taskbar.pinned.includes(app.id);
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
        label: pinned ? 'Unpin from Taskbar' : 'Pin to Taskbar',
        onSelect: () =>
          setTaskbar({
            pinned: pinned
              ? taskbar.pinned.filter((id) => id !== app.id)
              : [...taskbar.pinned, app.id],
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

  return (
    <>
      {autoHide && (
        <div
          aria-hidden
          className={cx(
            'absolute z-[999]',
            vertical ? 'top-0 bottom-0 w-1.5' : 'left-0 right-0 h-1.5',
            taskbar.position === 'bottom' && 'bottom-0',
            taskbar.position === 'left' && 'left-0',
            taskbar.position === 'right' && 'right-0',
          )}
          onPointerEnter={() => setRevealed(true)}
        />
      )}
      <nav
        aria-label="Taskbar"
        data-testid="taskbar"
        onPointerEnter={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setRevealed(true);
        }}
        onPointerLeave={() => {
          if (!autoHide) return;
          hideTimer.current = setTimeout(() => setRevealed(false), 400);
        }}
        className={cx(
          'absolute z-[1000] flex items-center bg-chrome text-ink select-none',
          !settings.appearance.reduceTransparency && 'surface-blur',
          'transition-transform duration-(--duration-base) ease-(--ease-standard)',
          vertical
            ? 'top-(--lumen-menubar-h) bottom-0 w-(--lumen-taskbar-h) flex-col border-rule'
            : 'inset-x-0 bottom-0 h-(--lumen-taskbar-h) flex-row border-t border-rule',
          taskbar.position === 'left' && 'left-0 border-r',
          taskbar.position === 'right' && 'right-0 border-l',
          hidden &&
            (taskbar.position === 'bottom'
              ? 'translate-y-full'
              : taskbar.position === 'left'
                ? '-translate-x-full'
                : 'translate-x-full'),
        )}
      >
        <div
          className={cx(
            'flex items-center gap-1 p-1.5',
            vertical ? 'flex-col' : 'flex-row',
            taskbar.centered && !vertical && 'mx-auto',
          )}
        >
          <Tooltip content="Start">
            <button
              type="button"
              aria-label="Start"
              aria-haspopup="dialog"
              aria-expanded={startOpen}
              data-testid="start-button"
              onClick={() => toggle('startMenu')}
              className={cx(
                'flex items-center justify-center rounded-md lumen-focus transition-colors duration-(--duration-fast)',
                startOpen ? 'bg-selection text-accent' : 'hover:bg-surface-2/70 text-ink',
              )}
              style={{ width: size, height: size }}
            >
              {/* deslop-ignore-next-line 24 — the product wordmark, not a generated glyph. */}
              <Mark size={Math.round(size * 0.5)} />
            </button>
          </Tooltip>
          <span
            aria-hidden
            className={cx('bg-rule', vertical ? 'my-1 h-px w-6' : 'mx-1 h-6 w-px')}
          />
          {items.map((app) => {
            const entry = running.get(app.id);
            const isRunning = Boolean(entry && (entry.windows.length > 0 || entry.pids.length > 0));
            const active =
              entry?.windows.some(
                (w) => w.id === useWindowStore.getState().focusedId && !w.minimized,
              ) ?? false;
            const Icon = app.icon;
            return (
              <Tooltip
                key={app.id}
                content={app.name}
                side={taskbar.position === 'bottom' ? 'top' : 'bottom'}
              >
                <button
                  type="button"
                  aria-label={app.name}
                  aria-pressed={active}
                  data-testid={`taskbar-${app.id}`}
                  onClick={() => activate(app)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ at: { x: e.clientX, y: e.clientY }, app });
                  }}
                  className={cx(
                    'relative flex items-center justify-center gap-2 rounded-md lumen-focus',
                    'transition-colors duration-(--duration-fast)',
                    active ? 'bg-surface-2' : 'hover:bg-surface-2/70',
                    taskbar.showLabels && !vertical && 'px-2',
                  )}
                  style={{ minWidth: size, height: size }}
                >
                  <Icon size={Math.round(size * 0.62)} />
                  {taskbar.showLabels && !vertical && (
                    <span className="max-w-24 truncate-1 text-sm">{app.name}</span>
                  )}
                  {isRunning && (
                    <span
                      aria-hidden
                      className={cx(
                        // deslop-ignore-next-line 19 — the running-app indicator is a 4px dot, flat and unanimated.
                        'absolute rounded-full bg-ink-2',
                        vertical
                          ? 'left-0.5 top-1/2 h-1 w-1 -translate-y-1/2'
                          : 'bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2',
                        active && 'bg-accent',
                      )}
                    />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
        {!taskbar.centered && <div className="flex-1" />}
        <Tooltip content="Show desktop" side={taskbar.position === 'bottom' ? 'top' : 'bottom'}>
          <button
            type="button"
            aria-label="Show desktop"
            onClick={() => {
              const s = useWindowStore.getState();
              if (s.order.some((id) => !s.windows[id]?.minimized)) s.minimizeAll();
              else s.restoreAll();
            }}
            className={cx(
              'flex items-center justify-center text-ink-3 hover:text-ink lumen-focus',
              vertical
                ? 'mb-1 h-6 w-full border-t border-rule'
                : 'ml-auto h-full w-4 border-l border-rule',
              taskbar.centered && !vertical && 'absolute right-0 top-0',
            )}
          >
            <LayoutGrid className="size-3" />
          </button>
        </Tooltip>
      </nav>
      <AnchoredMenu
        open={menu !== null}
        onClose={() => setMenu(null)}
        at={menu?.at ?? null}
        items={menu ? contextItems(menu.app) : []}
      />
    </>
  );
}

export function useRunningApps() {
  const processes = useProcessStore((s) => s.processes);
  return useMemo(() => new Set(Object.values(processes).map((p) => p.appId)), [processes]);
}
