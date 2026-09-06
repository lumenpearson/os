/**
 * The apps pinned in Settings, in the order Settings holds them — and the one
 * place that order can be changed by hand: drag an icon along the bar.
 */

import { useSettingsStore } from '@lumen/kernel';
import { useMemo } from 'react';
import { reorderIds } from '../logic';
import { useIconReorder } from '../useIconReorder';
import { useTaskbarApps, visibleApps } from '../useTaskbarApps';
import { AppButton } from './AppButton';
import { groupClass, type TaskbarItemProps } from './types';

export function PinnedItems(props: TaskbarItemProps) {
  const { byId, pinned, isRunning, isActive, activate, contextItems } = useTaskbarApps();
  const apps = useMemo(() => visibleApps(pinned, byId), [pinned, byId]);

  const { rowRef, onPointerDown, consumeClick } = useIconReorder({
    vertical: props.vertical,
    fallbackExtent: props.size + 4,
    onDrop: (from, to) => {
      const fromId = apps[from]?.id;
      const toId = apps[to]?.id;
      if (!fromId || !toId) return;
      useSettingsStore.getState().patch('taskbar', { pinned: reorderIds(pinned, fromId, toId) });
    },
  });

  if (apps.length === 0) return null;
  return (
    <div
      ref={rowRef}
      data-taskbar-item="pinned"
      data-testid="taskbar-pinned"
      className={groupClass(props.vertical)}
    >
      {apps.map((app, index) => (
        <AppButton
          key={app.id}
          {...props}
          app={app}
          running={isRunning(app.id)}
          active={isActive(app.id)}
          // One icon has nowhere to go, and the drag knows it — an open hand
          // over the only pinned app would promise a reorder that cannot run.
          reorderable={apps.length > 1}
          onPointerDown={onPointerDown(index)}
          onActivate={() => {
            // The click that ends a drag is the drop, not a launch.
            if (consumeClick()) return;
            activate(app);
          }}
          menuItems={() => contextItems(app)}
        />
      ))}
    </div>
  );
}
