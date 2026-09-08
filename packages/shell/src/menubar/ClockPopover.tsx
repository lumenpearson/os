import { useClock, useSettings } from '@lumen/kernel/react';
import { Button, cx, IconButton } from '@lumen/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

/** The menubar clock's popover: a month grid and a link to Calendar. */
export function ClockPopover({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const settings = useSettings();
  const now = useClock(30_000);
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const locale = settings.region.locale;
  const firstDay = settings.region.firstDayOfWeek;

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    cursor,
  );
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const days: Array<{ date: Date; inMonth: boolean }> = [];
  const start = new Date(cursor);
  const offset = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - offset);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() });
  }
  const isToday = (d: Date) => d.toDateString() === now.toDateString();

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="clock-popover">
      <div className="flex items-center justify-between">
        <span className="mono text-sm text-ink">{monthLabel}</span>
        <div className="flex gap-0.5">
          <IconButton
            label="Previous month"
            size="sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next month"
            size="sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(2024, 0, 7 + ((firstDay + i) % 7));
          return (
            <span key={i} className="mono py-1 text-2xs uppercase text-ink-3">
              {weekdayFmt.format(d)}
            </span>
          );
        })}
        {days.map(({ date, inMonth }) => (
          <span
            key={date.toISOString()}
            className={cx(
              'mono flex h-7 items-center justify-center rounded-sm tabular-nums',
              inMonth ? 'text-ink' : 'text-ink-3',
              isToday(date) && 'bg-accent text-accent-ink',
            )}
          >
            {date.getDate()}
          </span>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={onOpenCalendar} className="self-end">
        Open Calendar
      </Button>
    </div>
  );
}
