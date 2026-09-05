/**
 * The hour grid behind the week and day views.
 *
 * One column per day, an all-day band above it, and a gutter of hour labels
 * down the left. Dragging on empty grid draws a new event; dragging a block
 * moves it. Both write the preview straight to the DOM inside
 * `requestAnimationFrame`, so a drag costs one style write a frame however
 * fast the pointer moves — React hears about the result once, at the end.
 */

import { cx } from '@lumen/ui';
import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { type DateKey, isWithin, MINUTES_PER_DAY } from './dates';
import { EventChip, TimeBlock } from './EventChip';
import type { Occurrence } from './events';
import { type FormatOptions, formatDayNumber, formatHourLabel, formatWeekdayLong } from './format';
import { columnAt, dragRange, layoutDay, MIN_SLOT_MINUTES, minutesAt, snapTo } from './layout';

/** Pixels per hour; twenty-four of them is the height of a day column. */
export const HOUR_HEIGHT = 44;
export const DAY_HEIGHT = HOUR_HEIGHT * 24;

/** Where the grid is scrolled to on open, so the working day is on screen. */
export const DEFAULT_SCROLL_TOP = 7 * HOUR_HEIGHT;

/** The gutter is this wide; the ghost needs the same number to place itself. */
const GUTTER = '4rem';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const BAND_ROW = 19;

export interface TimeGridProps {
  days: DateKey[];
  today: DateKey;
  /** Minutes since midnight, for the current-time line. */
  nowMinutes: number;
  occurrences: Occurrence[];
  selectedEventId: string | null;
  o: FormatOptions;
  /** Drop the weekday name and keep the number (a narrow week). */
  narrowDays: boolean;
  onSelectEvent: (occurrence: Occurrence) => void;
  onOpenEvent: (occurrence: Occurrence) => void;
  onOpenDay: (date: DateKey) => void;
  onCreateRange: (date: DateKey, start: number, end: number) => void;
  onMoveOccurrence: (occurrence: Occurrence, date: DateKey, start: number, end: number) => void;
}

/** A drag in progress, in grid coordinates. */
interface Span {
  column: number;
  start: number;
  end: number;
}

export function TimeGrid({
  days,
  today,
  nowMinutes,
  occurrences,
  selectedEventId,
  o,
  narrowDays,
  onSelectEvent,
  onOpenEvent,
  onOpenDay,
  onCreateRange,
  onMoveOccurrence,
}: TimeGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Span | null>(null);

  const bands = useMemo(
    () => days.map((date) => occurrences.filter((oc) => oc.allDay && covers(oc, date))),
    [days, occurrences],
  );
  const timed = useMemo(
    () => days.map((date) => layoutDay(occurrences, date)),
    [days, occurrences],
  );
  const bandRows = bands.reduce((most, list) => Math.max(most, list.length), 0);

  /** The column and the snapped minute under a client point. */
  const locate = (rect: DOMRect, x: number, y: number) => ({
    column: columnAt(x - rect.left, rect.width, days.length),
    minutes: minutesAt(y - rect.top, DAY_HEIGHT, MIN_SLOT_MINUTES),
  });

  /**
   * One drag, shared by drawing and moving. `track` answers with the span
   * under the pointer; `commit` is handed the last one when the pointer lifts.
   */
  const drag = (
    event: ReactPointerEvent<HTMLElement>,
    first: Span,
    track: (at: { column: number; minutes: number }) => Span,
    commit: (span: Span) => void,
  ) => {
    const grid = scroller.current?.firstElementChild;
    if (!(grid instanceof HTMLElement) || event.button !== 0) return;
    event.preventDefault();
    const rect = grid.getBoundingClientRect();
    let latest = first;
    let frame = 0;
    setDragging(first);

    const paint = () => {
      frame = 0;
      const node = ghost.current;
      if (!node) return;
      node.style.top = `${(latest.start / MINUTES_PER_DAY) * DAY_HEIGHT}px`;
      node.style.height = `${((latest.end - latest.start) / MINUTES_PER_DAY) * DAY_HEIGHT}px`;
      node.style.left = columnLeft(latest.column, days.length);
    };

    const onMove = (move: PointerEvent) => {
      latest = track(locate(rect, move.clientX, move.clientY));
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (frame) cancelAnimationFrame(frame);
      setDragging(null);
      commit(latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Only bare grid draws; a block underneath handles its own pointer.
    if (event.target !== event.currentTarget) return;
    const grid = scroller.current?.firstElementChild;
    if (!(grid instanceof HTMLElement)) return;
    const anchor = locate(grid.getBoundingClientRect(), event.clientX, event.clientY);
    const first = { column: anchor.column, ...dragRange(anchor.minutes, anchor.minutes) };
    drag(
      event,
      first,
      (at) => ({ column: first.column, ...dragRange(anchor.minutes, at.minutes) }),
      (span) => {
        const date = days[span.column];
        if (date) onCreateRange(date, span.start, span.end);
      },
    );
  };

  const startMove = (event: ReactPointerEvent<HTMLButtonElement>, occurrence: Occurrence) => {
    const column = days.indexOf(occurrence.date);
    const grid = scroller.current?.firstElementChild;
    if (column < 0 || !(grid instanceof HTMLElement)) return;
    const length = occurrence.end - occurrence.start;
    const grabbed = locate(grid.getBoundingClientRect(), event.clientX, event.clientY).minutes;
    const first = { column, start: occurrence.start, end: occurrence.end };
    drag(
      event,
      first,
      (at) => {
        const shifted = snapTo(occurrence.start + (at.minutes - grabbed), MIN_SLOT_MINUTES);
        const start = Math.min(MINUTES_PER_DAY - length, Math.max(0, shifted));
        return { column: at.column, start, end: start + length };
      },
      (span) => {
        const date = days[span.column];
        if (!date) return;
        if (date === occurrence.date && span.start === occurrence.start) return;
        onMoveOccurrence(occurrence, date, span.start, span.end);
      },
    );
  };

  const columns = `${GUTTER} repeat(${days.length}, minmax(0, 1fr))`;
  const nowColumn = days.indexOf(today);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="grid shrink-0 border-b border-rule" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((date) => (
          <button
            key={date}
            type="button"
            onClick={() => onOpenDay(date)}
            className="flex flex-col items-center gap-px border-l border-rule py-1 lumen-focus"
          >
            {!narrowDays && (
              <span className="truncate-1 text-xs text-ink-2">{formatWeekdayLong(date, o)}</span>
            )}
            <span
              className={cx(
                'mono rounded-xs px-1.5 text-md tabular-nums leading-5',
                date === today ? 'bg-accent font-medium text-accent-ink' : 'text-ink',
              )}
            >
              {formatDayNumber(date, o)}
            </span>
          </button>
        ))}
      </div>

      {bandRows > 0 && (
        <div
          className="grid shrink-0 border-b border-rule"
          style={{ gridTemplateColumns: columns }}
        >
          <span className="mono self-center px-2 text-right text-2xs text-ink-3">All day</span>
          {bands.map((list, index) => (
            <div
              key={days[index]}
              className="flex min-w-0 flex-col gap-px border-l border-rule p-px"
              style={{ minHeight: bandRows * BAND_ROW + 2 }}
            >
              {list.map((occurrence) => (
                <EventChip
                  key={occurrence.id}
                  occurrence={occurrence}
                  selected={occurrence.id === selectedEventId}
                  o={o}
                  dense
                  onSelect={() => onSelectEvent(occurrence)}
                  onOpen={() => onOpenEvent(occurrence)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scroller} className="lumen-scroll relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: columns, height: DAY_HEIGHT }}>
          <div className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                style={{ top: hour * HOUR_HEIGHT }}
                className="mono absolute right-2 -translate-y-1/2 text-2xs tabular-nums text-ink-3"
              >
                {formatHourLabel(hour, o)}
              </span>
            ))}
          </div>

          {days.map((date, index) => (
            // The column is a surface for drawing an event with the pointer.
            // Every event it can make is also reachable from New Event and from
            // the month grid, which is where the keyboard path lives.
            <div
              key={date}
              className="relative border-l border-rule"
              data-cursor="crosshair"
              onPointerDown={startDraw}
            >
              {HOURS.slice(1).map((hour) => (
                <div
                  key={hour}
                  style={{ top: hour * HOUR_HEIGHT }}
                  className="pointer-events-none absolute inset-x-0 border-t border-rule"
                />
              ))}
              {(timed[index] ?? []).map((segment) => (
                <TimeBlock
                  key={segment.id}
                  occurrence={segment.occurrence}
                  selected={segment.occurrence.id === selectedEventId}
                  o={o}
                  left={segment.left}
                  width={segment.width}
                  top={(segment.start / MINUTES_PER_DAY) * DAY_HEIGHT}
                  height={Math.max(
                    14,
                    ((segment.end - segment.start) / MINUTES_PER_DAY) * DAY_HEIGHT,
                  )}
                  onSelect={() => onSelectEvent(segment.occurrence)}
                  onOpen={() => onOpenEvent(segment.occurrence)}
                  onPointerDown={(event) => {
                    if (segment.first) startMove(event, segment.occurrence);
                  }}
                />
              ))}
              {index === nowColumn && (
                <div
                  aria-hidden
                  style={{ top: (nowMinutes / MINUTES_PER_DAY) * DAY_HEIGHT }}
                  className="pointer-events-none absolute inset-x-0 h-px bg-accent"
                />
              )}
            </div>
          ))}

          {dragging && (
            <div
              ref={ghost}
              aria-hidden
              style={{
                top: (dragging.start / MINUTES_PER_DAY) * DAY_HEIGHT,
                height: ((dragging.end - dragging.start) / MINUTES_PER_DAY) * DAY_HEIGHT,
                left: columnLeft(dragging.column, days.length),
                width: `calc((100% - ${GUTTER}) / ${days.length})`,
              }}
              className="pointer-events-none absolute rounded-xs border border-accent bg-selection"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The left edge of a day column, as CSS, for the drag ghost. */
function columnLeft(column: number, count: number): string {
  return `calc(${GUTTER} + (100% - ${GUTTER}) / ${count} * ${column})`;
}

/** True when an all-day occurrence covers this day. */
function covers(occurrence: Occurrence, date: DateKey): boolean {
  return isWithin(date, occurrence.date, occurrence.endDate);
}
