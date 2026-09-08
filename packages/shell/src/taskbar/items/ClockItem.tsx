/**
 * The time, in the format the system bar already uses: Settings > Taskbar &
 * Menubar owns 24-hour, seconds and the date, and Region owns the locale and
 * the time zone. Two clocks disagreeing on a screen is one clock too many.
 */

import { useSettingsStore } from '@lumen/kernel';
import { useClock } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { useShallow } from 'zustand/react/shallow';
import { groupClass, type TaskbarItemProps } from './types';

export function ClockItem({ vertical }: TaskbarItemProps) {
  const { menubar, region } = useSettingsStore(
    useShallow((s) => ({ menubar: s.settings.menubar, region: s.settings.region })),
  );
  const now = useClock(menubar.showSeconds ? 1000 : 10_000);
  const timeZone = region.timeZone || undefined;

  const time = new Intl.DateTimeFormat(region.locale, {
    hour: 'numeric',
    minute: '2-digit',
    second: menubar.showSeconds ? '2-digit' : undefined,
    hour12: !menubar.clock24h,
    timeZone,
  }).format(now);
  const showDate = (menubar.showDate || menubar.showDayOfWeek) && !vertical;
  const date = showDate
    ? new Intl.DateTimeFormat(region.locale, {
        weekday: menubar.showDayOfWeek ? 'short' : undefined,
        day: menubar.showDate ? 'numeric' : undefined,
        month: menubar.showDate ? 'short' : undefined,
        timeZone,
      }).format(now)
    : null;

  return (
    <div data-taskbar-item="clock" className={groupClass(vertical)}>
      <time
        dateTime={now.toISOString()}
        data-testid="taskbar-clock"
        className={cx(
          'mono flex whitespace-nowrap px-1.5 text-ink tabular-nums',
          vertical ? 'flex-col items-center text-2xs' : 'items-baseline gap-2 text-sm',
        )}
      >
        {date && <span className="text-ink-2">{date}</span>}
        <span>{time}</span>
      </time>
    </div>
  );
}
