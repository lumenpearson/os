import { useRegistryStore } from '@lumen/kernel';
import { useWindows } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { useShellStore } from '../shellStore';

/** The Alt+Tab strip: app icons with the current candidate highlighted. */
export function WindowSwitcher() {
  const index = useShellStore((s) => s.switcher);
  const windows = useWindows().filter((w) => !w.minimized);
  const apps = useRegistryStore((s) => s.apps);
  if (index === null || windows.length === 0) return null;
  const current = windows[index];
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1350] flex items-center justify-center"
      data-testid="window-switcher"
      role="dialog"
      aria-label="Switch window"
    >
      <div className="flex max-w-[90vw] flex-col items-center gap-3 rounded-lg border border-rule bg-surface/95 p-4 shadow-lg">
        <div className="flex flex-wrap justify-center gap-2">
          {windows.map((w, i) => {
            const Icon = apps[w.appId]?.icon;
            return (
              <div
                key={w.id}
                className={cx(
                  'flex size-16 items-center justify-center rounded-md',
                  i === index ? 'bg-selection ring-2 ring-accent' : 'bg-transparent',
                )}
                aria-current={i === index}
              >
                {Icon && <Icon size={40} />}
              </div>
            );
          })}
        </div>
        <span className="max-w-[60vw] truncate-1 text-base text-ink">{current?.title}</span>
      </div>
    </div>
  );
}
