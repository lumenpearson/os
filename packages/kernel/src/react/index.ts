import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRegistryStore } from '../apps/registry';
import { useClipboardStore } from '../clipboard/store';
import { events, type KernelEvents } from '../events';
import type { Kernel } from '../kernel';
import { useLogStore } from '../log/store';
import { useMenuStore } from '../menu/store';
import { selectUnreadCount, useNotificationStore } from '../notifications/store';
import { useProcessStore } from '../process/store';
import { useSessionStore } from '../session/store';
import { runtimeSettings } from '../settings/runtime';
import type { Settings } from '../settings/schema';
import { useSettingsStore } from '../settings/store';
import type { AppDefinition, AppId, Pid, WindowId, WindowState } from '../types';
import { useUsersStore } from '../users/store';
import { selectFocusedWindow, useWindowStore } from '../window/store';

// Dragging a rectangle to select, shared by the desktop and the file views.
export { boxesByPath, DRAG_THRESHOLD, type Marquee, useMarquee } from '../selection/useMarquee';

const KernelContext = createContext<Kernel | null>(null);

export function KernelProvider({ kernel, children }: { kernel: Kernel; children: ReactNode }) {
  return createElement(KernelContext.Provider, { value: kernel }, children);
}

export function useKernel(): Kernel {
  const k = useContext(KernelContext);
  if (!k) throw new Error('useKernel must be used inside <KernelProvider>');
  return k;
}

export function useVfs() {
  return useKernel().vfs;
}

export function usePlatform() {
  return useKernel().platform;
}

/** Subscribe to a kernel event for the component's lifetime. */
export function useKernelEvent<K extends keyof KernelEvents>(
  event: K,
  handler: (payload: KernelEvents[K]) => void,
) {
  useEffect(() => events.on(event, handler), [event, handler]);
}

// ── settings ──────────────────────────────────────────────────────────────

export function useSettings(): Settings {
  return useSettingsStore((s) => s.settings);
}

/**
 * The settings as the system should behave right now, with Low Power Mode
 * applied. Anything that draws or animates wants this one; Settings itself
 * wants `useSetting`, which reports what the person chose.
 */
export function useRuntimeSettings(): Settings {
  return runtimeSettings(useSettingsStore((s) => s.settings));
}

export function useSetting<K extends keyof Settings>(
  section: K,
): [Settings[K], (patch: Partial<Settings[K]>) => void] {
  const value = useSettingsStore((s) => s.settings[section]);
  const patch = useSettingsStore((s) => s.patch);
  return [value, (p) => patch(section, p)];
}

// ── session / users ───────────────────────────────────────────────────────

export function useSession() {
  return useSessionStore(
    useShallow((s) => ({
      state: s.state,
      screensaverActive: s.screensaverActive,
      failedAttempts: s.failedAttempts,
      lockedUntil: s.lockedUntil,
    })),
  );
}

export function useCurrentUser() {
  return useUsersStore((s) => s.users.find((u) => u.id === s.currentUserId));
}

// ── processes & windows ───────────────────────────────────────────────────

export function useProcesses() {
  return useProcessStore(useShallow((s) => Object.values(s.processes)));
}

export function useProcess(pid: Pid) {
  return useProcessStore((s) => s.processes[pid]);
}

export function useWindows(): WindowState[] {
  return useWindowStore(
    useShallow((s) =>
      s.order.map((id) => s.windows[id]).filter((w): w is WindowState => Boolean(w)),
    ),
  );
}

export function useWindow(id: WindowId): WindowState | undefined {
  return useWindowStore((s) => s.windows[id]);
}

export function useFocusedWindow(): WindowState | undefined {
  return useWindowStore(selectFocusedWindow);
}

export function useIsFocused(id: WindowId): boolean {
  return useWindowStore((s) => s.focusedId === id);
}

export function useWorkArea() {
  return useWindowStore((s) => s.area);
}

// ── registry ──────────────────────────────────────────────────────────────

export function useApps(options: { includeHidden?: boolean } = {}): AppDefinition[] {
  const includeHidden = options.includeHidden ?? false;
  return useRegistryStore(
    useShallow((s) =>
      Object.values(s.apps)
        .filter((a) => includeHidden || !a.hidden)
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  );
}

export function useApp(id: AppId): AppDefinition | undefined {
  return useRegistryStore((s) => s.apps[id]);
}

export function useInstalledApps() {
  return useRegistryStore(useShallow((s) => Object.values(s.installed)));
}

// ── notifications, clipboard, menus, log ──────────────────────────────────

export function useNotifications() {
  return useNotificationStore(useShallow((s) => ({ items: s.items, banners: s.banners })));
}

export function useUnreadCount() {
  return useNotificationStore(selectUnreadCount);
}

export function useClipboard() {
  return useClipboardStore(
    useShallow((s) => ({
      item: s.item,
      copyText: s.copyText,
      copyFiles: s.copyFiles,
      clear: s.clear,
    })),
  );
}

export function useWindowMenus(windowId: WindowId | null) {
  return useMenuStore((s) => (windowId ? s.byWindow[windowId] : undefined));
}

export function useLogEntries() {
  return useLogStore((s) => s.entries);
}

/** Re-render on a clock tick (default every second) for time displays. */
export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
