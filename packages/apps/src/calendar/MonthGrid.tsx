// biome-ignore-all lint/a11y/useFocusableInteractive: the grid puts a roving
// tabIndex on the gridcell, which is the focus stop; rows, column headers and
// row headers are structure around it and are not focus stops in either ARIA
// grid pattern. Making them focusable would add tab stops a keyboard user has
// to escape from.
import { cx, useElementSize } from '@lumen/ui';
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react';
import { DAYS_PER_WEEK, type DateKey, type FirstDay, sameMonth, weekNumber } from './dates';
import { EventChip } from './EventChip';
import type { Occurrence } from './events';
import {
  type FormatOptions,
  formatDayNumber,
  formatFullDate,
  formatMonthShort,
  weekdayHeaders,
} from './format';
import { moveFocus, moveForKey } from './view';

export interface MonthGridProps {
  /** The 42 days of the grid, in reading order. */
  days: DateKey[];
  /** Any day of the month being shown, for dimming the days around it. */
  month: DateKey;
  today: DateKey;
  /** The day with the roving focus. */
  cursor: DateKey;
  firstDay: FirstDay;
  weekNumbers: boolean;
  narrowDays: boolean;
  eventsByDay: Map<DateKey, Occurrence[]>;
  selectedEventId: string | null;
  o: FormatOptions;
  onCursor: (date: DateKey) => void;
  onOpenDay: (date: DateKey) => void;
  onCreate: (date: DateKey) => void;
  onSelectEvent: (occurrence: Occurrence) => void;
  onOpenEvent: (occurrence: Occurrence) => void;
}

/** Height of one chip plus its gap, and the room the date line takes. */
const CHIP_HEIGHT = 19;
const HEADER_HEIGHT = 24;

export function MonthGrid({
  days,
  month,
  today,
  cursor,
  firstDay,
  weekNumbers,
  narrowDays,
  eventsByDay,
  selectedEventId,
  o,
  onCursor,
  onOpenDay,
  onCreate,
  onSelectEvent,
  onOpenEvent,
}: MonthGridProps) {
  const cells = useRef(new Map<DateKey, HTMLDivElement>());
  const hasFocus = useRef(false);
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>();

  const rows = useMemo(() => {
    const out: DateKey[][] = [];
    for (let i = 0; i < days.length; i += DAYS_PER_WEEK) out.push(days.slice(i, i + DAYS_PER_WEEK));
    return out;
  }, [days]);

  const headers = useMemo(
    () => weekdayHeaders(firstDay, o, narrowDays ? 'narrow' : 'short'),
    [firstDay, o, narrowDays],
  );

  // Keep the roving focus on the focused day as it moves between months.
  useEffect(() => {
    if (!hasFocus.current) return;
    cells.current.get(cursor)?.focus({ preventScroll: true });
  }, [cursor]);

  const rowHeight = rows.length > 0 ? bodySize.height / rows.length : 0;
  const perCell = Math.max(1, Math.floor((rowHeight - HEADER_HEIGHT) / CHIP_HEIGHT));

  const columns = weekNumbers
    ? `2.25rem repeat(${DAYS_PER_WEEK}, minmax(0, 1fr))`
    : `repeat(${DAYS_PER_WEEK}, minmax(0, 1fr))`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, date: DateKey) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpenDay(date);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      onCreate(date);
      return;
    }
    const move = moveForKey(e.key, e.ctrlKey || e.metaKey);
    if (!move) return;
    e.preventDefault();
    onCursor(moveFocus(date, move, firstDay));
  };

  return (
    <div
      role="grid"
      aria-label="Month"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      onFocus={() => {
        hasFocus.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) hasFocus.current = false;
      }}
    >
      <div
        role="row"
        className="grid shrink-0 border-b border-rule"
        style={{ gridTemplateColumns: columns }}
      >
        {weekNumbers && (
          <div role="columnheader" className="mono py-1 text-center text-2xs text-ink-3">
            Wk
          </div>
        )}
        {headers.map((label, i) => (
          <div
            // Weekday names repeat in the narrow form (T for Tuesday and Thursday).
            key={`${label}-${i}`}
            role="columnheader"
            className="truncate-1 py-1 text-center text-xs font-medium text-ink-2"
          >
            {label}
          </div>
        ))}
      </div>
      <div ref={bodyRef} className="grid min-h-0 flex-1 grid-rows-6">
        {rows.map((row) => (
          <div
            key={row[0]}
            role="row"
            className="grid min-h-0 border-b border-rule last:border-b-0"
            style={{ gridTemplateColumns: columns }}
          >
            {weekNumbers && row[0] && (
              <div
                role="rowheader"
                className="mono flex items-start justify-center border-r border-rule pt-1 text-2xs tabular-nums text-ink-3"
              >
                {weekNumber(row[0], firstDay)}
              </div>
            )}
            {row.map((date) => (
              <MonthCell
                key={date}
                date={date}
                outside={!sameMonth(date, month)}
                today={date === today}
                cursor={date === cursor}
                events={eventsByDay.get(date) ?? []}
                perCell={perCell}
                selectedEventId={selectedEventId}
                o={o}
                register={(el) => {
                  if (el) cells.current.set(date, el);
                  else cells.current.delete(date);
                }}
                onKeyDown={(e) => onKeyDown(e, date)}
                onCursor={() => onCursor(date)}
                onOpenDay={() => onOpenDay(date)}
                onCreate={() => onCreate(date)}
                onSelectEvent={onSelectEvent}
                onOpenEvent={onOpenEvent}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface MonthCellProps {
  date: DateKey;
  outside: boolean;
  today: boolean;
  cursor: boolean;
  events: Occurrence[];
  perCell: number;
  selectedEventId: string | null;
  o: FormatOptions;
  register: (el: HTMLDivElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onCursor: () => void;
  onOpenDay: () => void;
  onCreate: () => void;
  onSelectEvent: (occurrence: Occurrence) => void;
  onOpenEvent: (occurrence: Occurrence) => void;
}

function MonthCell({
  date,
  outside,
  today,
  cursor,
  events,
  perCell,
  selectedEventId,
  o,
  register,
  onKeyDown,
  onCursor,
  onOpenDay,
  onCreate,
  onSelectEvent,
  onOpenEvent,
}: MonthCellProps) {
  const room = events.length > perCell ? Math.max(0, perCell - 1) : perCell;
  const shown = events.slice(0, room);
  const hidden = events.length - shown.length;
  const first = date.endsWith('-01');
  return (
    // A cell is the grid's focus stop; the chips inside are reached from the
    // day, the agenda or search, which is where an event is a real tab stop.
    // biome-ignore lint/a11y/useSemanticElements: a gridcell cannot be a button
    <div
      ref={register}
      role="gridcell"
      tabIndex={cursor ? 0 : -1}
      aria-selected={cursor}
      aria-label={formatFullDate(date, o)}
      onKeyDown={onKeyDown}
      onClick={onCursor}
      onDoubleClick={onCreate}
      className={cx(
        'flex min-w-0 flex-col gap-px overflow-hidden border-r border-rule px-1 pb-1 last:border-r-0 lumen-focus',
        outside && 'bg-canvas',
        cursor && 'bg-selection',
      )}
    >
      <div className="flex items-baseline gap-1 pt-0.5">
        <span
          className={cx(
            'mono rounded-xs px-1 text-xs tabular-nums leading-4',
            today ? 'bg-accent font-medium text-accent-ink' : outside ? 'text-ink-3' : 'text-ink-2',
          )}
        >
          {formatDayNumber(date, o)}
        </span>
        {first && <span className="text-2xs text-ink-3">{formatMonthShort(date, o)}</span>}
      </div>
      {shown.map((occurrence) => (
        <EventChip
          key={occurrence.id}
          occurrence={occurrence}
          selected={occurrence.id === selectedEventId}
          o={o}
          dense
          tabIndex={-1}
          onSelect={() => onSelectEvent(occurrence)}
          onOpen={() => onOpenEvent(occurrence)}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDay();
          }}
          className="mono truncate-1 rounded-xs px-1 text-left text-2xs tabular-nums text-ink-3 hover:text-ink lumen-focus"
        >
          {hidden} more
        </button>
      )}
    </div>
  );
}
