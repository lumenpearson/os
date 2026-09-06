/**
 * Apps that are running but not pinned. Settings calls this "Show recent
 * apps"; with it off, the bar carries only what was put there on purpose.
 */

import { useSettingsStore } from '@lumen/kernel';
import { useMemo } from 'react';
import { useTaskbarApps, visibleApps } from '../useTaskbarApps';
import { AppButton } from './AppButton';
import { groupClass, type TaskbarItemProps } from './types';

export function WindowsItems(props: TaskbarItemProps) {
  const showRecents = useSettingsStore((s) => s.settings.taskbar.showRecents);
  const { byId, pinned, running, isRunning, isActive, activate, contextItems } = useTaskbarApps();
  const apps = useMemo(
    () =>
      visibleApps(
        [...running.keys()].filter((id) => !pinned.includes(id)),
        byId,
      ),
    [running, pinned, byId],
  );

  if (!showRecents || apps.length === 0) return null;
  return (
    <div
      data-taskbar-item="windows"
      data-testid="taskbar-windows"
      className={groupClass(props.vertical)}
    >
      {apps.map((app) => (
        <AppButton
          key={app.id}
          {...props}
          app={app}
          running={isRunning(app.id)}
          active={isActive(app.id)}
          onActivate={() => activate(app)}
          menuItems={() => contextItems(app)}
        />
      ))}
    </div>
  );
}
