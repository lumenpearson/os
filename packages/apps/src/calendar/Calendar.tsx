/**
 * Calendar: month, week, day and agenda over one list of events.
 *
 * Events are stored once, as rules rather than as instances — a weekly meeting
 * is one record, and the occurrences on screen are expanded from it for the
 * range in view. Moving or deleting a single instance of a series writes an
 * exception against the rule instead of splitting it, so the series stays one
 * thing the user can still edit as a whole.
 */

import { useKernel, useSettings } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  IconButton,
  SegmentedControl,
  Toolbar,
  ToolbarSpacer,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useJsonFile,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { AgendaList } from './AgendaList';
import { CalendarSidebar } from './CalendarSidebar';
import { civilNow, type DateKey, monthGrid, weekDays } from './dates';
import { draftFromEvent, type EventDraft, emptyDraft } from './draft';
import { EventDialog } from './EventDialog';
import {
  type CalendarData,
  type CalendarEvent,
  calendarReducer,
  createEvent,
  DEFAULT_DATA,
  displayTitle,
  type EventInput,
  newEventId,
  normalizeData,
  type Occurrence,
  searchEvents,
  sortOccurrences,
} from './events';
import type { FormatOptions } from './format';
import { MonthGrid } from './MonthGrid';
import { buildCalendarMenus } from './menus';
import { coveredDays, expandEvents } from './recurrence';
import { DEFAULT_SCROLL_TOP, TimeGrid } from './TimeGrid';
import {
  type CalendarView,
  layoutFor,
  stepCursor,
  VIEW_LABELS,
  VIEWS,
  viewRange,
  viewTitle,
} from './view';

/** The clock only drives the current-time line, so a minute is close enough. */
const TICK_MS = 60_000;

export default function Calendar(_props: AppProps) {
  const kernel = useKernel();
  const settings = useSettings();
  const { container } = useApp();
  const { close } = useWindowControls();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const [data, setData] = useJsonFile<CalendarData>(
    join(kernel.home, '.config', 'calendar.json'),
    DEFAULT_DATA,
  );
  const { events, prefs } = useMemo(() => normalizeData(data), [data]);

  const [instant, setInstant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setInstant(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const now = useMemo(
    () => civilNow(instant, settings.region.timeZone),
    [instant, settings.region.timeZone],
  );

  const [cursor, setCursor] = useState<DateKey>(now.date);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const firstDay = settings.region.firstDayOfWeek;
  const o: FormatOptions = useMemo(
    () => ({ locale: settings.region.locale, hour12: !settings.menubar.clock24h }),
    [settings.region.locale, settings.menubar.clock24h],
  );

  const view = prefs.view;
  const layout = layoutFor(width, { showSidebar: prefs.showSidebar });
  const range = useMemo(() => viewRange(view, cursor, firstDay), [view, cursor, firstDay]);
  const occurrences = useMemo(
    () => sortOccurrences(expandEvents(events, range.from, range.to)),
    [events, range.from, range.to],
  );

  /**
   * Every day an occurrence shows on, not only the day it starts: an all-day
   * event over a long weekend belongs in all three cells.
   */
  const eventsByDay = useMemo(() => {
    const byDay = new Map<DateKey, Occurrence[]>();
    for (const occurrence of occurrences) {
      for (const date of coveredDays(occurrence)) {
        const bucket = byDay.get(date);
        if (bucket) bucket.push(occurrence);
        else byDay.set(date, [occurrence]);
      }
    }
    return byDay;
  }, [occurrences]);

  const dayEvents = useMemo(() => eventsByDay.get(cursor) ?? [], [eventsByDay, cursor]);
  const hits = useMemo(() => searchEvents(events, query), [events, query]);

  const title = viewTitle(view, cursor, firstDay, o);
  useTitle(`Calendar — ${title}`);

  // The hour grid opens on the working day rather than at midnight.
  useEffect(() => {
    if (view !== 'week' && view !== 'day') return;
    const scroller = gridRef.current?.querySelector('.lumen-scroll');
    if (scroller instanceof HTMLElement) scroller.scrollTop = DEFAULT_SCROLL_TOP;
  }, [view]);

  const setPrefs = useCallback(
    (patch: Partial<CalendarData['prefs']>) => {
      setData((current) => {
        const base = normalizeData(current);
        return { ...base, prefs: { ...base.prefs, ...patch } };
      });
    },
    [setData],
  );

  const dispatch = useCallback(
    (action: Parameters<typeof calendarReducer>[1]) => {
      setData((current) => {
        const base = normalizeData(current);
        return { ...base, events: calendarReducer(base.events, action) };
      });
    },
    [setData],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );

  const newEvent = useCallback(
    (seed?: { date: DateKey; start?: number; end?: number; allDay?: boolean }) => {
      setDraft(emptyDraft(seed ?? { date: cursor }));
    },
    [cursor],
  );

  const editEvent = useCallback(
    (event: CalendarEvent | null) => {
      if (event) setDraft(draftFromEvent(event));
      else if (selectedEvent) setDraft(draftFromEvent(selectedEvent));
    },
    [selectedEvent],
  );

  const saveDraft = useCallback(
    (input: EventInput, id: string | null) => {
      if (id) dispatch({ type: 'update', id, patch: input, now: Date.now() });
      else {
        const event = createEvent(input, newEventId(), Date.now());
        dispatch({ type: 'create', event });
        setSelectedId(event.id);
      }
      setCursor(input.date);
      setDraft(null);
    },
    [dispatch],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      dispatch({ type: 'delete', id });
      if (selectedId === id) setSelectedId(null);
      setDraft(null);
    },
    [dispatch, selectedId],
  );

  const openOccurrence = useCallback((occurrence: Occurrence) => {
    setSelectedId(occurrence.event.id);
    setDraft(draftFromEvent(occurrence.event));
  }, []);

  const moveOccurrence = useCallback(
    (occurrence: Occurrence, date: DateKey, start: number, end: number) => {
      const to = { date, start, end };
      const now_ = Date.now();
      // A single instance of a series moves as an exception; a one-off moves
      // itself, which is also what keeps its end date alongside its start.
      if (occurrence.event.recurrence) {
        dispatch({
          type: 'moveOccurrence',
          id: occurrence.event.id,
          on: occurrence.origin,
          to,
          now: now_,
        });
      } else {
        dispatch({ type: 'move', id: occurrence.event.id, to, now: now_ });
      }
    },
    [dispatch],
  );

  const latest = useLatest({
    newEvent,
    editEvent,
    deleteSelected: () => {
      if (selectedEvent) deleteEvent(selectedEvent.id);
    },
    close,
    find: () => {
      if (!prefs.showSidebar) setPrefs({ showSidebar: true });
      searchRef.current?.focus();
    },
    setView: (next: CalendarView) => setPrefs({ view: next }),
    today: () => setCursor(now.date),
    step: (direction: 1 | -1) => setCursor((current) => stepCursor(view, current, direction)),
    toggleSidebar: () => setPrefs({ showSidebar: !prefs.showSidebar }),
  });

  useAppMenus(
    buildCalendarMenus(
      { view, hasSelection: selectedEvent !== null, showSidebar: prefs.showSidebar },
      {
        newEvent: () => latest.current.newEvent(),
        editEvent: () => latest.current.editEvent(null),
        deleteEvent: () => latest.current.deleteSelected(),
        close: () => latest.current.close(),
        find: () => latest.current.find(),
        setView: (next) => latest.current.setView(next),
        today: () => latest.current.today(),
        next: () => latest.current.step(1),
        previous: () => latest.current.step(-1),
        toggleSidebar: () => latest.current.toggleSidebar(),
      },
    ),
    [view, selectedEvent !== null, prefs.showSidebar, close],
  );

  const days = useMemo(
    () => (view === 'week' ? weekDays(cursor, firstDay) : [cursor]),
    [view, cursor, firstDay],
  );

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense windowControls>
            <IconButton size="sm" label="Previous" onClick={() => latest.current.step(-1)}>
              <ChevronLeft className="size-3.5" />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => latest.current.today()}>
              Today
            </Button>
            <IconButton size="sm" label="Next" onClick={() => latest.current.step(1)}>
              <ChevronRight className="size-3.5" />
            </IconButton>
            {/* The window has no title bar of its own, so this line is what
                names it: the range in view, as the title used to read it. */}
            <span className="truncate-1 pl-1 text-md font-medium text-ink">{title}</span>
            <ToolbarSpacer />
            <SegmentedControl
              size="sm"
              aria-label="View"
              options={VIEWS.map((id) =>
                // Initials once the row is short of the width the controls took:
                // the tooltip and the accessible name stay the whole word.
                layout.compactViews
                  ? { value: id, icon: VIEW_LABELS[id].charAt(0), title: VIEW_LABELS[id] }
                  : { value: id, label: VIEW_LABELS[id] },
              )}
              value={view}
              onChange={(next) => setPrefs({ view: next })}
            />
            <IconButton size="sm" label="New event" onClick={() => latest.current.newEvent()}>
              <CalendarPlus className="size-3.5" />
            </IconButton>
          </Toolbar>
        }
        sidebar={
          layout.sidebar ? (
            <CalendarSidebar
              cursor={cursor}
              today={now.date}
              firstDay={firstDay}
              o={o}
              dayEvents={dayEvents}
              query={query}
              hits={hits}
              selectedEventId={selectedId}
              searchRef={searchRef}
              onQuery={setQuery}
              onCursor={setCursor}
              onSelectEvent={(occurrence) => setSelectedId(occurrence.event.id)}
              onOpenEvent={openOccurrence}
              onOpenHit={(event) => {
                setSelectedId(event.id);
                setCursor(event.date);
              }}
            />
          ) : undefined
        }
        statusBar={
          <>
            <span className="tabular-nums">
              {occurrences.length === 1 ? '1 event' : `${occurrences.length} events`}
            </span>
            {selectedEvent && (
              <span className="truncate-1 text-ink-3">{displayTitle(selectedEvent)}</span>
            )}
          </>
        }
      >
        <div ref={gridRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === 'month' && (
            <MonthGrid
              days={monthGrid(cursor, firstDay)}
              month={cursor}
              today={now.date}
              cursor={cursor}
              firstDay={firstDay}
              weekNumbers={layout.weekNumbers}
              narrowDays={layout.narrowDays}
              eventsByDay={eventsByDay}
              selectedEventId={selectedId}
              o={o}
              onCursor={setCursor}
              onOpenDay={(date) => {
                setCursor(date);
                setPrefs({ view: 'day' });
              }}
              onCreate={(date) => newEvent({ date })}
              onSelectEvent={(occurrence) => setSelectedId(occurrence.event.id)}
              onOpenEvent={openOccurrence}
            />
          )}
          {(view === 'week' || view === 'day') && (
            <TimeGrid
              days={days}
              today={now.date}
              nowMinutes={now.minutes}
              occurrences={occurrences}
              selectedEventId={selectedId}
              o={o}
              narrowDays={layout.narrowDays}
              onSelectEvent={(occurrence) => setSelectedId(occurrence.event.id)}
              onOpenEvent={openOccurrence}
              onOpenDay={(date) => {
                setCursor(date);
                setPrefs({ view: 'day' });
              }}
              onCreateRange={(date, start, end) => newEvent({ date, start, end })}
              onMoveOccurrence={moveOccurrence}
            />
          )}
          {view === 'agenda' && (
            <AgendaList
              occurrences={occurrences}
              today={now.date}
              selectedEventId={selectedId}
              o={o}
              onSelect={(occurrence) => setSelectedId(occurrence.event.id)}
              onOpen={openOccurrence}
            />
          )}
        </div>
      </AppFrame>

      <EventDialog
        open={draft !== null}
        draft={draft}
        firstDay={firstDay}
        o={o}
        container={container}
        onChange={setDraft}
        onSave={saveDraft}
        onDelete={deleteEvent}
        onClose={() => setDraft(null)}
      />
    </div>
  );
}
