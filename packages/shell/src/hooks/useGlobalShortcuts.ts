import {
  GLOBAL_SHORTCUTS,
  type GlobalShortcutId,
  getSettings,
  matchesShortcut,
  menusClaimShortcut,
  useMenuStore,
  useWindowStore,
} from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { useEffect } from 'react';
import { useShellStore } from '../shellStore';

/**
 * Binds the system-wide shortcuts (Settings → Keyboard can override the keys).
 * Runs in the capture phase so apps cannot swallow them, except for text
 * input where plain keys must reach the field.
 */
export function useGlobalShortcuts() {
  const kernel = useKernel();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const settings = getSettings();
      const keysFor = (id: GlobalShortcutId) =>
        settings.keyboard.shortcuts[id] ?? GLOBAL_SHORTCUTS[id].keys;
      const hit = (id: GlobalShortcutId) =>
        matchesShortcut(e, keysFor(id), settings.keyboard.modifier);
      const shell = useShellStore.getState();
      const windows = useWindowStore.getState();
      const focused = windows.focusedId ? windows.windows[windows.focusedId] : undefined;

      // Alt+Tab switcher: hold Alt, tap Tab; release Alt to commit.
      if (hit('shell.switchWindow') || hit('shell.switchWindowBack')) {
        e.preventDefault();
        const visible = windows.order.filter((id) => !windows.windows[id]?.minimized);
        if (visible.length === 0) return;
        const current = shell.switcher ?? visible.length - 1;
        const dir = hit('shell.switchWindowBack') ? -1 : 1;
        shell.setSwitcher((current + dir + visible.length) % visible.length);
        return;
      }

      // the Start menu opens on a lone Meta press (handled on keyup below)
      if (e.key === 'Meta' && !e.ctrlKey && !e.altKey && !e.shiftKey) return;

      const actions: Array<[GlobalShortcutId, () => void]> = [
        ['shell.spotlight', () => shell.toggle('spotlight')],
        ['shell.missionControl', () => shell.toggle('missionControl')],
        [
          'shell.showDesktop',
          () =>
            windows.order.some((id) => !windows.windows[id]?.minimized)
              ? windows.minimizeAll()
              : windows.restoreAll(),
        ],
        ['shell.lock', () => kernel.lock()],
        ['shell.notifications', () => shell.toggle('notificationCenter')],
        ['shell.controlCenter', () => shell.toggle('controlCenter')],
        ['shell.terminal', () => void kernel.launch('lumen.terminal')],
        ['shell.files', () => void kernel.launch('lumen.files')],
        ['shell.settings', () => void kernel.launch('lumen.settings')],
        ['shell.taskManager', () => void kernel.launch('lumen.taskmanager')],
        ['window.close', () => focused && void kernel.closeWindow(focused.id)],
        ['window.quit', () => focused && void kernel.quitApp(focused.pid)],
        [
          'window.minimize',
          () => focused && focused.options.minimizable !== false && windows.minimize(focused.id),
        ],
        ['window.maximize', () => focused && windows.toggleMaximize(focused.id)],
        ['window.snapLeft', () => focused && windows.snap(focused.id, 'left')],
        ['window.snapRight', () => focused && windows.snap(focused.id, 'right')],
        [
          'window.snapTop',
          () => focused && (focused.maximized ? undefined : windows.toggleMaximize(focused.id)),
        ],
        [
          'window.snapDown',
          () =>
            focused &&
            (focused.maximized || focused.snap
              ? focused.maximized
                ? windows.toggleMaximize(focused.id)
                : windows.snap(focused.id, null)
              : windows.minimize(focused.id)),
        ],
      ];
      // A focused app may reinterpret the window-scoped chords: Mod+W means
      // "close this tab" in a browser and "close this window" everywhere else.
      // Since this listener runs in the capture phase and stops propagation,
      // an app that binds the same chord would never see the key at all, so
      // ask its menus first and stand aside when they claim it. The shell's
      // own chords — Spotlight, lock, Mission Control — are never claimable.
      const appClaims =
        focused !== undefined &&
        menusClaimShortcut(
          useMenuStore.getState().byWindow[focused.id],
          e,
          settings.keyboard.modifier,
        );

      for (const [id, run] of actions) {
        if (!hit(id)) continue;
        if (appClaims && id.startsWith('window.')) return;
        e.preventDefault();
        e.stopPropagation();
        run();
        return;
      }
      if (
        e.key === 'Escape' &&
        (shell.startMenu ||
          shell.spotlight ||
          shell.controlCenter ||
          shell.notificationCenter ||
          shell.missionControl)
      ) {
        shell.closeAll();
      }
    };

    let metaAlone = false;
    const onKeyDownMeta = (e: KeyboardEvent) => {
      metaAlone = e.key === 'Meta' && !e.ctrlKey && !e.altKey && !e.shiftKey;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' && metaAlone) {
        const s = getSettings();
        if (
          (s.keyboard.shortcuts['shell.startMenu'] ?? GLOBAL_SHORTCUTS['shell.startMenu'].keys) ===
          'Meta'
        ) {
          e.preventDefault();
          useShellStore.getState().toggle('startMenu');
        }
      }
      metaAlone = false;
      if (e.key === 'Alt' && useShellStore.getState().switcher !== null) {
        const shell = useShellStore.getState();
        const windows = useWindowStore.getState();
        const visible = windows.order.filter((id) => !windows.windows[id]?.minimized);
        const target = visible[shell.switcher ?? 0];
        shell.setSwitcher(null);
        if (target) windows.focus(target);
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', onKeyDownMeta, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', () => useShellStore.getState().setSwitcher(null));
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onKeyDownMeta, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [kernel]);
}
