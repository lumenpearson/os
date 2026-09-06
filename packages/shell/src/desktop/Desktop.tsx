import { formatShortcut, useWindowStore } from '@lumen/kernel';
import { useSettings } from '@lumen/kernel/react';
import { AnchoredMenu, useTextFieldMenu } from '@lumen/ui';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ControlCenter } from '../controlcenter/ControlCenter';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';
import { MenuBar } from '../menubar/MenuBar';
import { Banners } from '../notifications/Banners';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { MissionControl } from '../overview/MissionControl';
import { WindowSwitcher } from '../overview/WindowSwitcher';
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
  useGlobalShortcuts();

  const taskbarPos = settings.taskbar.position;
  const taskbarHidden = settings.taskbar.autoHide;
  const modifier = settings.keyboard.modifier;

  const shortcut = useCallback((keys: string) => formatShortcut(keys, modifier), [modifier]);
  const fieldMenu = useTextFieldMenu({ shortcut });
  const openField = fieldMenu.openAt;

  /**
   * The one rule for right-clicks. Every surface with something to offer —
   * an icon, a title bar, the system bar, a tab — draws its own menu and
   * stops the event on its way up; a text field that reached here without
   * one gets the editing menu, wherever in the session it was drawn. What is
   * left is a click on scenery: nothing to show, and still no reason to hand
   * the person the host browser's menu, which knows nothing about any of
   * this. The listener sits on the document rather than on the desktop node
   * so that menus, dialogs and everything else portalled to the body are
   * covered by the same rule.
   */
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (!e.defaultPrevented) openField(e);
      e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [openField]);

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
      className="fixed inset-0 overflow-hidden select-none text-ink"
      data-testid="desktop"
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
      <AnchoredMenu
        open={fieldMenu.open}
        at={fieldMenu.at}
        items={fieldMenu.items}
        onClose={fieldMenu.close}
      />
    </div>
  );
}
