import {
  type AppId,
  events,
  formatShortcut,
  getKernel,
  type LaunchArgs,
  type MenuItemTemplate,
  type MenuTemplate,
  matchesShortcut,
  type Pid,
  useMenuStore,
  useNotificationStore,
  useSettingsStore,
  useWindowStore,
  type WindowId,
} from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface AppContextValue {
  pid: Pid;
  windowId: WindowId;
  appId: AppId;
  /** The DOM element of the window body, for app-modal dialogs. */
  container: HTMLElement | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Identity of the running app instance. */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside an app window');
  return ctx;
}

/**
 * Launch arguments. Singleton apps receive fresh args when launched again
 * (e.g. Settings asked to open another section), so this re-renders then.
 */
export function useArgs<T extends LaunchArgs = LaunchArgs>(initial: T): T {
  const { pid } = useApp();
  const [args, setArgs] = useState<T>(initial);
  useEffect(
    () =>
      events.on('process:args', (e) => {
        if (e.pid === pid) setArgs((prev) => ({ ...prev, ...(e.args as T) }));
      }),
    [pid],
  );
  return args;
}

/** Window-level controls for the current app window. */
export function useWindowControls() {
  const { windowId, pid } = useApp();
  const kernel = useKernel();
  const window = useWindowStore((s) => s.windows[windowId]);
  const focused = useWindowStore((s) => s.focusedId === windowId);
  return useMemo(
    () => ({
      window,
      focused,
      setTitle: (title: string) => useWindowStore.getState().setTitle(windowId, title),
      setDirty: (dirty: boolean) => useWindowStore.getState().setDirty(windowId, dirty),
      setDocument: (path: string | null) => useWindowStore.getState().setDocument(windowId, path),
      close: () => kernel.closeWindow(windowId),
      quit: () => kernel.quitApp(pid),
      minimize: () => useWindowStore.getState().minimize(windowId),
      toggleMaximize: () => useWindowStore.getState().toggleMaximize(windowId),
      focus: () => useWindowStore.getState().focus(windowId),
      setFullscreen: (v: boolean) => useWindowStore.getState().setFullscreen(windowId, v),
    }),
    [window, focused, windowId, pid, kernel],
  );
}

/** Keep the window title in sync with a value. */
export function useTitle(title: string) {
  const { windowId } = useApp();
  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, title);
  }, [windowId, title]);
}

/** Mark the window as having unsaved changes (dot in the close button, confirm on close). */
export function useDirty(dirty: boolean) {
  const { windowId } = useApp();
  useEffect(() => {
    useWindowStore.getState().setDirty(windowId, dirty);
  }, [windowId, dirty]);
}

/** Register a close guard. Return false (or a promise of false) to keep the window open. */
export function useCloseGuard(guard: (() => boolean | Promise<boolean>) | null) {
  const { windowId } = useApp();
  const kernel = useKernel();
  const latest = useRef(guard);
  latest.current = guard;
  // The guard is read through the ref, so it may change identity every render;
  // only whether one exists at all needs to re-register it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the ref carries the latest guard
  useEffect(() => {
    kernel.setCloseGuard(windowId, guard ? () => latest.current?.() ?? true : null);
    return () => kernel.setCloseGuard(windowId, null);
  }, [kernel, windowId, guard === null]);
}

/**
 * Contribute menus to the global menubar while this window is focused.
 * Shortcuts declared on items are bound automatically.
 */
export function useAppMenus(menus: MenuTemplate[], deps: unknown[] = []) {
  const { windowId } = useApp();
  const focused = useWindowStore((s) => s.focusedId === windowId);
  const modifier = useSettingsStore((s) => s.settings.keyboard.modifier);
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are provided by the caller
  const stable = useMemo(() => menus, deps);
  useEffect(() => {
    useMenuStore.getState().setMenus(windowId, stable);
    return () => useMenuStore.getState().clearMenus(windowId);
  }, [windowId, stable]);
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const item = findShortcut(stable, e, modifier);
      if (item?.onSelect) {
        e.preventDefault();
        e.stopPropagation();
        item.onSelect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, stable, modifier]);
}

function findShortcut(
  menus: MenuTemplate[],
  e: KeyboardEvent,
  modifier: 'auto' | 'ctrl' | 'meta',
): MenuItemTemplate | null {
  const walk = (items: MenuItemTemplate[]): MenuItemTemplate | null => {
    for (const it of items) {
      if (it.shortcut && it.enabled !== false && matchesShortcut(e, it.shortcut, modifier))
        return it;
      if (it.submenu) {
        const found = walk(it.submenu);
        if (found) return found;
      }
    }
    return null;
  };
  for (const m of menus) {
    const found = walk(m.items);
    if (found) return found;
  }
  return null;
}

/** A single shortcut bound while the window is focused. */
export function useShortcut(keys: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const { windowId } = useApp();
  const focused = useWindowStore((s) => s.focusedId === windowId);
  const modifier = useSettingsStore((s) => s.settings.keyboard.modifier);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!focused || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (matchesShortcut(e, keys, modifier)) {
        e.preventDefault();
        latest.current(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, enabled, keys, modifier]);
}

/** Format a shortcut for display according to the user's modifier preference. */
export function useShortcutLabel() {
  const modifier = useSettingsStore((s) => s.settings.keyboard.modifier);
  return useCallback((keys: string) => formatShortcut(keys, modifier), [modifier]);
}

/** Post a notification attributed to this app. */
export function useNotify() {
  const { appId } = useApp();
  return useCallback(
    (
      title: string,
      body?: string,
      extra: {
        timeout?: number;
        actions?: Array<{ id: string; label: string }>;
        onAction?: (id: string) => void;
      } = {},
    ) => useNotificationStore.getState().post({ appId, title, body, ...extra }),
    [appId],
  );
}

/** Launch another app or open a path through the kernel. */
export function useLauncher() {
  return useMemo(
    () => ({
      launch: (appId: AppId, args?: LaunchArgs) => getKernel().launch(appId, args),
      open: (path: string, options?: { with?: AppId }) => getKernel().open(path, options),
    }),
    [],
  );
}
