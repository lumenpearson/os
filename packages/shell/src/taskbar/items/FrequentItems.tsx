/**
 * The apps that have opened the most documents, counted from the kernel's own
 * Recents list — no separate tally, and nothing invented. An app already on
 * the bar (pinned or running) is not repeated here, and with Recents switched
 * off in Settings > Privacy there is nothing to count, so the piece is empty.
 */

import { useSettingsStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { frequentAppIds } from '../logic';
import { useTaskbarApps, visibleApps } from '../useTaskbarApps';
import { AppButton } from './AppButton';
import { groupClass, type TaskbarItemProps } from './types';

/** How many an app bar can carry before it stops being a bar. */
const LIMIT = 3;

export function FrequentItems(props: TaskbarItemProps) {
  const kernel = useKernel();
  const keepsRecents = useSettingsStore((s) => s.settings.privacy.recents);
  const { byId, claimed, isRunning, isActive, activate, contextItems } = useTaskbarApps();
  const apps = visibleApps(
    keepsRecents ? frequentAppIds(kernel.state.recents, { exclude: claimed, limit: LIMIT }) : [],
    byId,
  );

  if (apps.length === 0) return null;
  return (
    <div
      data-taskbar-item="frequent"
      data-testid="taskbar-frequent"
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
