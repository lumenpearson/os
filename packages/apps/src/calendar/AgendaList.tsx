/**
 * The agenda: every occurrence in the range as one scrolling list, grouped by
 * day. Days with nothing on them are left out — an agenda is what is happening,
 * not a calendar with holes in it.
 */

import { cx, EmptyState } from '@lumen/ui';
import { CalendarDays } from 'lucide-react';
import type { DateKey } from './dates';
import { TONE_CLASS } from './EventChip';
import { displayTitle, groupByDay, type Occurrence } from './events';
import { type FormatOptions, formatDayHeading, formatTimeRange, formatWeekdayLong } from './format';

export interface AgendaListProps {
  occurrences: Occurrence[];
  today: DateKey;
  selectedEventId: string | null;
  o: FormatOptions;
  onSelect: (occurrence: Occurrence) => void;
  onOpen: (occurrence: Occurrence) => void;
}

export function AgendaList({
  occurrences,
  today,
  selectedEventId,
  o,
  onSelect,
  onOpen,
}: AgendaListProps) {
  const groups = groupByDay(occurrences);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="Nothing scheduled"
        description="The next three months are clear. Press Mod+N to add something."
      />
    );
  }

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      {groups.map((group) => (
        <section key={group.date} className="border-b border-rule last:border-b-0">
          <h3 className="sticky top-0 z-1 flex items-baseline gap-2 border-b border-rule bg-canvas px-3 py-1">
            <span
              className={cx(
                'mono text-xs tabular-nums',
                group.date === today ? 'font-medium text-accent' : 'text-ink',
              )}
            >
              {formatDayHeading(group.date, o)}
            </span>
            <span className="text-xs text-ink-3">{formatWeekdayLong(group.date, o)}</span>
          </h3>
          <ul>
            {group.items.map((occurrence) => (
              <li key={occurrence.id}>
                <button
                  type="button"
                  data-event-id={occurrence.id}
                  aria-current={occurrence.id === selectedEventId ? 'true' : undefined}
                  onClick={() => onSelect(occurrence)}
                  onDoubleClick={() => onOpen(occurrence)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    onOpen(occurrence);
                  }}
                  className={cx(
                    'flex w-full items-baseline gap-3 px-3 py-1.5 text-left lumen-focus',
                    'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                    occurrence.id === selectedEventId ? 'bg-selection' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'mt-1 size-2 shrink-0 rounded-xs border',
                      TONE_CLASS[occurrence.event.color],
                    )}
                  />
                  <span className="mono w-32 shrink-0 text-xs tabular-nums text-ink-2">
                    {occurrence.allDay
                      ? 'All day'
                      : formatTimeRange(occurrence.start, occurrence.end, o)}
                  </span>
                  <span className="truncate-1 min-w-0 flex-1 text-base text-ink">
                    {displayTitle(occurrence.event)}
                  </span>
                  {occurrence.event.location && (
                    <span className="truncate-1 hidden max-w-40 text-sm text-ink-3 sm:block">
                      {occurrence.event.location}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
