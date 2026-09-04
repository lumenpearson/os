import { useWindowStore } from '@lumen/kernel';
import { useSettings } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { useLayoutEffect, useRef } from 'react';
import { ControlCenter } from '../controlcenter/ControlCenter';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';
import { MenuBar } from '../menubar/MenuBar';
import { Banners } from '../notifications/Banners';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { MissionControl } from '../overview/MissionControl';
import { WindowSwitcher } from '../overview/WindowSwitcher';
import { useShellStore } from '../shellStore';
import { Spotlight } from '../spotlight/Spotlight';
import { StartMenu } from '../start/StartMenu';
import { Taskbar } from '../taskbar/Taskbar';
import { WindowLayer } from '../windows/WindowLayer';
import { DesktopIcons } from './DesktopIcons';
import { Wallpaper } from './Wallpaper';

/**
 * The desktop session: wallpaper, icons, windows, menubar, taskbar and every
 * overlay. It measures itself and publishes the work area to the kernel so
 * windows stay inside it at any viewport size.
 */
export default function Desktop() {
  const settings = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const missionControl = useShellStore((s) => s.missionControl);
  useGlobalShortcuts();

  const taskbarPos = settings.taskbar.position;
  const taskbarHidden = settings.taskbar.autoHide;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const publish = () => {
      const rect = el.getBoundingClientRect();
      const styles = getComputedStyle(document.documentElement);
      const menubar = Number.parseFloat(styles.getPropertyValue('--lumen-menubar-h')) || 26;
      const taskbar = taskbarHidden
        ? 0
        : Number.parseFloat(styles.getPropertyValue('--lumen-taskbar-h')) || 52;
      const area = {
        x: taskbarPos === 'left' ? taskbar : 0,
        y: menubar,
        width: rect.width - (taskbarPos === 'left' || taskbarPos === 'right' ? taskbar : 0),
        height: rect.height - menubar - (taskbarPos === 'bottom' ? taskbar : 0),
      };
      useWindowStore
        .getState()
        .setArea({ ...area, width: Math.max(200, area.width), height: Math.max(120, area.height) });
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    const mo = new MutationObserver(publish);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [taskbarPos, taskbarHidden]);

  return (
    <div
      ref={rootRef}
      className={cx(
        'fixed inset-0 overflow-hidden select-none text-ink',
        missionControl && 'is-overview',
      )}
      data-testid="desktop"
      onContextMenu={(e) => {
        // the desktop and windows draw their own menus; the host menu never shows
        if (!(e.target as HTMLElement).closest('[data-native-menu]')) e.preventDefault();
      }}
    >
      <Wallpaper />
      <DesktopIcons />
      <WindowLayer />
      <MenuBar />
      <Taskbar />
      <StartMenu />
      <Spotlight />
      <ControlCenter />
      <NotificationCenter />
      <Banners />
      <MissionControl />
      <WindowSwitcher />
    </div>
  );
}
