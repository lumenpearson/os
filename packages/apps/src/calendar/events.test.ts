import { describe, expect, it } from 'vitest';
import {
  type CalendarEvent,
  calendarReducer,
  compareOccurrences,
  createEvent,
  DEFAULT_DATA,
  displayTitle,
  type EventInput,
  groupByDay,
  MIN_DURATION,
  normalizeData,
  normalizeEvent,
  type Occurrence,
  searchEvents,
  sortOccurrences,
  UNTITLED,
} from './events';
import { expandEvents } from './recurrence';

function event(input: EventInput & { id?: string }): CalendarEvent {
  return createEvent(input, input.id ?? 'e1', 1_000);
}

function occurrence(event: CalendarEvent, extra: Partial<Occurrence> = {}): Occurrence {
  return {
    id: `${event.id}@${event.date}`,
    event,
    origin: event.date,
    date: event.date,
    endDate: event.endDate,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    moved: false,
    ...extra,
  };
}

describe('createEvent', () => {
  it('fills in the parts the caller left out', () => {
    const e = event({ date: '2026-09-04' });
    expect(e).toMatchObject({
      title: '',
      notes: '',
      location: '',
      allDay: false,
      date: '2026-09-04',
      endDate: '2026-09-04',
      start: 9 * 60,
      end: 10 * 60,
      color: 'neutral',
      recurrence: null,
      exceptions: [],
    });
    expect(displayTitle(e)).toBe(UNTITLED);
    expect(displayTitle({ ...e, title: '  Standup ' })).toBe('Standup');
  });

  it('never ends before it starts', () => {
    const e = event({ date: '2026-09-04', start: 600, end: 300 });
    expect(e.end).toBe(600 + MIN_DURATION);
  });

  it('gives an end date only to an all-day event', () => {
    expect(event({ date: '2026-09-01', endDate: '2026-09-05', allDay: true }).endDate).toBe(
      '2026-09-05',
    );
    expect(event({ date: '2026-09-01', endDate: '2026-09-05' }).endDate).toBe('2026-09-01');
    expect(event({ date: '2026-09-05', endDate: '2026-09-01', allDay: true }).endDate).toBe(
      '2026-09-05',
    );
  });
});

describe('reading a stored file', () => {
  it('returns the empty calendar for anything unreadable', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('a calendar')).toEqual(DEFAULT_DATA);
    expect(normalizeData({ events: 'none' })).toEqual(DEFAULT_DATA);
  });

  it('drops events it cannot read and keeps the rest', () => {
    const data = normalizeData({
      events: [
        { id: 'a', date: '2026-09-04', title: 'Standup' },
        { id: 'b', date: 'whenever' },
        { date: '2026-09-04' },
        'nope',
      ],
    });
    expect(data.events.map((e) => e.id)).toEqual(['a']);
  });

  it('keeps preferences it understands', () => {
    expect(normalizeData({ prefs: { view: 'week', showSidebar: false } }).prefs).toEqual({
      view: 'week',
      showSidebar: false,
    });
    expect(normalizeData({ prefs: { view: 'timeline' } }).prefs.view).toBe('month');
  });

  it('repairs an event with impossible fields', () => {
    const e = normalizeEvent({
      id: 'a',
      date: '2026-09-04',
      start: -100,
      end: 5000,
      color: 'chartreuse',
      exceptions: [{ on: 'nope' }, { on: '2026-09-11', to: null }, 7],
    });
    expect(e).toMatchObject({ start: 0, end: 2880, color: 'neutral' });
    expect(e?.exceptions).toEqual([{ on: '2026-09-11', to: null }]);
  });

  it('reads a weekly rule with no weekdays as repeating on its own weekday', () => {
    // 4 September 2026 is a Friday.
    const e = normalizeEvent({ id: 'a', date: '2026-09-04', recurrence: { freq: 'weekly' } });
    expect(e?.recurrence?.weekdays).toEqual([5]);
  });
});

describe('the reducer', () => {
  const base = event({ id: 'a', date: '2026-09-04', title: 'Standup' });

  it('creates, updates and deletes', () => {
    let events = calendarReducer([], { type: 'create', event: base });
    expect(events).toHaveLength(1);
    events = calendarReducer(events, {
      type: 'update',
      id: 'a',
      patch: { title: 'Retro', start: 600, end: 660 },
      now: 2_000,
    });
    expect(events[0]).toMatchObject({ title: 'Retro', start: 600, end: 660, updatedAt: 2_000 });
    expect(calendarReducer(events, { type: 'delete', id: 'a' })).toEqual([]);
    expect(calendarReducer(events, { type: 'delete', id: 'other' })).toHaveLength(1);
  });

  it('leaves other events alone', () => {
    const other = event({ id: 'b', date: '2026-09-05' });
    const events = calendarReducer([base, other], {
      type: 'update',
      id: 'a',
      patch: { title: 'Retro' },
      now: 2_000,
    });
    expect(events[1]).toBe(other);
  });

  it('shifts a multi-day event by the days it moved', () => {
    const trip = event({
      id: 't',
      date: '2026-09-01',
      endDate: '2026-09-05',
      allDay: true,
    });
    const [moved] = calendarReducer([trip], {
      type: 'move',
      id: 't',
      to: { date: '2026-09-08', start: 0, end: 60 },
      now: 2_000,
    });
    expect(moved).toMatchObject({ date: '2026-09-08', endDate: '2026-09-12' });
  });

  it('records a deleted occurrence as an exception', () => {
    const [after] = calendarReducer([base], {
      type: 'deleteOccurrence',
      id: 'a',
      on: '2026-09-11',
      now: 2_000,
    });
    expect(after?.exceptions).toEqual([{ on: '2026-09-11', to: null }]);
  });

  it('replaces an earlier exception for the same day', () => {
    const first = calendarReducer([base], {
      type: 'deleteOccurrence',
      id: 'a',
      on: '2026-09-11',
      now: 2_000,
    });
    const [after] = calendarReducer(first, {
      type: 'moveOccurrence',
      id: 'a',
      on: '2026-09-11',
      to: { date: '2026-09-12', start: 600, end: 660 },
      now: 3_000,
    });
    expect(after?.exceptions).toEqual([
      { on: '2026-09-11', to: { date: '2026-09-12', start: 600, end: 660 } },
    ]);
  });

  it('keeps exceptions in date order', () => {
    let events = calendarReducer([base], {
      type: 'deleteOccurrence',
      id: 'a',
      on: '2026-09-18',
      now: 2_000,
    });
    events = calendarReducer(events, {
      type: 'deleteOccurrence',
      id: 'a',
      on: '2026-09-11',
      now: 2_000,
    });
    expect(events[0]?.exceptions.map((e) => e.on)).toEqual(['2026-09-11', '2026-09-18']);
  });

  it('clears the end date when an event stops being all-day', () => {
    const trip = event({ id: 't', date: '2026-09-01', endDate: '2026-09-05', allDay: true });
    const [after] = calendarReducer([trip], {
      type: 'update',
      id: 't',
      patch: { allDay: false },
      now: 2_000,
    });
    expect(after?.endDate).toBe('2026-09-01');
  });
});

describe('ordering', () => {
  const allDay = occurrence(event({ id: 'a', date: '2026-09-04', allDay: true, title: 'Leave' }));
  const early = occurrence(event({ id: 'b', date: '2026-09-04', start: 540, end: 600 }));
  const late = occurrence(event({ id: 'c', date: '2026-09-04', start: 780, end: 840 }));
  const long = occurrence(event({ id: 'd', date: '2026-09-04', start: 540, end: 720 }));

  it('puts all-day events before timed ones', () => {
    expect(sortOccurrences([late, early, allDay]).map((o) => o.event.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts the longer event first when two start together', () => {
    expect(compareOccurrences(long, early)).toBeLessThan(0);
  });

  it('groups by day and skips the days with nothing on them', () => {
    const next = occurrence(event({ id: 'e', date: '2026-09-06', start: 540, end: 600 }));
    const groups = groupByDay([next, early, allDay]);
    expect(groups.map((g) => g.date)).toEqual(['2026-09-04', '2026-09-06']);
    expect(groups[0]?.items.map((o) => o.event.id)).toEqual(['a', 'b']);
  });
});

describe('search', () => {
  const events = [
    event({ id: 'a', date: '2026-09-04', title: 'Dentist', location: 'Church Street' }),
    event({ id: 'b', date: '2026-09-02', title: 'Standup', notes: 'dentist appointment moved' }),
    event({ id: 'c', date: '2026-09-03', title: 'Lunch', location: 'Dentist Cafe' }),
  ];

  it('finds nothing for an empty query', () => {
    expect(searchEvents(events, '   ')).toEqual([]);
  });

  it('ranks a title match over a location, and a location over notes', () => {
    expect(searchEvents(events, 'dentist').map((h) => [h.event.id, h.field])).toEqual([
      ['a', 'title'],
      ['c', 'location'],
      ['b', 'notes'],
    ]);
  });

  it('ignores case and matches inside a word', () => {
    expect(searchEvents(events, 'STAND').map((h) => h.event.id)).toEqual(['b']);
    expect(searchEvents(events, 'zzz')).toEqual([]);
  });

  it('finds an event whose series has not started yet', () => {
    const future = event({ id: 'f', date: '2030-01-01', title: 'Party' });
    expect(searchEvents([...events, future], 'party').map((h) => h.event.id)).toEqual(['f']);
  });
});

describe('a day in the calendar', () => {
  it('reads the way the agenda prints it', () => {
    const events = [
      event({ id: 'a', date: '2026-09-04', allDay: true, title: 'Public holiday' }),
      event({ id: 'b', date: '2026-09-04', start: 600, end: 660, title: 'Call' }),
      event({ id: 'c', date: '2026-09-04', start: 540, end: 600, title: 'Standup' }),
    ];
    const found = sortOccurrences(expandEvents(events, '2026-09-04', '2026-09-04'));
    expect(found.map((o) => displayTitle(o.event))).toEqual(['Public holiday', 'Standup', 'Call']);
  });
});
