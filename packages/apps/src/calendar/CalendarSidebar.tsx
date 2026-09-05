/**
 * The sidebar: a small month for jumping about, and under it either the search
 * results or what is on the selected day. Search takes the panel over while
 * there is a query, because that is the only place results can go.
 */

import { cx, EmptyState, SearchField } from '@lumen/ui';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import {
  addMonths,
  type DateKey,
  type FirstDay,
  MONTH_GRID_DAYS,
  monthGrid,
  sameMonth,
} from './dates';
import { EventChip } from './EventChip';
import { type CalendarEvent, displayTitle, type Occurrence, type SearchHit } from './events';
import {
  type FormatOptions,
  formatDayNumber,
  formatFullDate,
  formatMediumDate,
  formatMonthYear,
  formatTimeRange,
  weekdayHeaders,
} from './format';

export interface CalendarSidebarProps {
  cursor: DateKey;
  today: DateKey;
  firstDay: FirstDay;
  o: FormatOptions;
  /** Occurrences on the cursor's day, already sorted. */
  dayEvents: Occurrence[];
  query: string;
  hits: SearchHit[];
  selectedEventId: string | null;
  searchRef: React.Ref<HTMLInputElement>;
  onQuery: (query: string) => void;
  onCursor: (date: DateKey) => void;
  onSelectEvent: (occurrence: Occurrence) => void;
  onOpenEvent: (occurrence: Occurrence) => void;
  onOpenHit: (event: CalendarEvent) => void;
}

export function CalendarSidebar({
  cursor,
  today,
  firstDay,
  o,
  dayEvents,
  query,
  hits,
  selectedEventId,
  searchRef,
  onQuery,
  onCursor,
  onSelectEvent,
  onOpenEvent,
  onOpenHit,
}: CalendarSidebarProps) {
  return (
    <aside
      aria-label="Calendar sidebar"
      className="flex w-56 shrink-0 flex-col border-r border-rule bg-canvas"
    >
      <div className="shrink-0 p-2">
        <SearchField
          ref={searchRef}
          size="sm"
          placeholder="Search events"
          aria-label="Search events"
          value={query}
          onChange={onQuery}
        />
      </div>

      {query.trim() === '' ? (
        <>
          <MiniMonth cursor={cursor} today={today} firstDay={firstDay} o={o} onCursor={onCursor} />
          <div className="lumen-scroll min-h-0 flex-1 border-t border-rule">
            <h3 className="px-3 pt-2 pb-1 text-xs text-ink-2">{formatFullDate(cursor, o)}</h3>
            {dayEvents.length === 0 ? (
              <p className="px-3 pb-3 text-sm text-ink-3">Nothing on this day.</p>
            ) : (
              <ul aria-label="Events on this day" className="flex flex-col gap-1 px-2 pb-2">
                {dayEvents.map((occurrence) => (
                  <li key={occurrence.id} className="flex flex-col gap-px">
                    <EventChip
                      occurrence={occurrence}
                      selected={occurrence.id === selectedEventId}
                      o={o}
                      onSelect={() => onSelectEvent(occurrence)}
                      onOpen={() => onOpenEvent(occurrence)}
                    />
                    {!occurrence.allDay && (
                      <span className="mono px-1 text-2xs tabular-nums text-ink-3">
                        {formatTimeRange(occurrence.start, occurrence.end, o)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="lumen-scroll min-h-0 flex-1 border-t border-rule">
          {hits.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="No events match"
              description={`Nothing has “${query.trim()}” in its title, place or notes.`}
            />
          ) : (
            <ul aria-label="Search results">
              {hits.map((hit) => (
                <li key={hit.event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenHit(hit.event)}
                    className={cx(
                      'flex w-full flex-col items-start gap-px px-3 py-1.5 text-left lumen-focus',
                      'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                      hit.event.id === selectedEventId ? 'bg-selection' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="truncate-1 w-full text-base text-ink">
                      {displayTitle(hit.event)}
                    </span>
                    <span className="mono text-2xs tabular-nums text-ink-3">
                      {formatMediumDate(hit.event.date, o)}
                      {hit.field === 'title' ? '' : ` · in ${hit.field}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

interface MiniMonthProps {
  cursor: DateKey;
  today: DateKey;
  firstDay: FirstDay;
  o: FormatOptions;
  onCursor: (date: DateKey) => void;
}

/** Six weeks of the cursor's month, for jumping without changing the view. */
function MiniMonth({ cursor, today, firstDay, o, onCursor }: MiniMonthProps) {
  const days = useMemo(() => monthGrid(cursor, firstDay), [cursor, firstDay]);
  const headers = useMemo(() => weekdayHeaders(firstDay, o, 'narrow'), [firstDay, o]);

  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-sm font-medium text-ink">{formatMonthYear(cursor, o)}</span>
        <span className="flex gap-px">
          <MiniStep label="Previous month" onClick={() => onCursor(addMonths(cursor, -1))}>
            ‹
          </MiniStep>
          <MiniStep label="Next month" onClick={() => onCursor(addMonths(cursor, 1))}>
            ›
          </MiniStep>
        </span>
      </div>
      <div className="grid grid-cols-7">
        {headers.map((label, index) => (
          <span
            // Narrow weekday names repeat (T for Tuesday and Thursday).
            key={`${label}-${index}`}
            aria-hidden
            className="mono py-0.5 text-center text-2xs text-ink-3"
          >
            {label}
          </span>
        ))}
        {days.slice(0, MONTH_GRID_DAYS).map((date) => (
          <button
            key={date}
            type="button"
            aria-current={date === cursor ? 'date' : undefined}
            aria-label={formatFullDate(date, o)}
            onClick={() => onCursor(date)}
            className={cx(
              'mono h-6 rounded-xs text-center text-2xs tabular-nums lumen-focus',
              'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
              date === cursor && 'bg-selection',
              date === today && 'font-medium text-accent',
              sameMonth(date, cursor) ? 'text-ink' : 'text-ink-3',
            )}
          >
            {formatDayNumber(date, o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniStep({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="size-5 rounded-xs text-sm text-ink-2 hover:bg-surface-2 hover:text-ink lumen-focus"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
