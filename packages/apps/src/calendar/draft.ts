/**
 * The editor's working copy of an event. The dialog holds fields exactly as
 * they are typed — times as `HH:MM`, numbers as text — and this file turns
 * them into an event, or says what is wrong with them.
 */
import {
  addDays,
  compareKeys,
  type DateKey,
  fromTimeValue,
  isDateKey,
  MINUTES_PER_DAY,
  toTimeValue,
  weekdayOf,
} from './dates';
import {
  type CalendarEvent,
  DEFAULT_DURATION,
  DEFAULT_START,
  type EventColor,
  type EventInput,
  type Frequency,
  MAX_COUNT,
  MAX_INTERVAL,
  type Recurrence,
} from './events';

export type RepeatChoice = 'none' | Frequency;
export type EndsChoice = 'never' | 'on' | 'after';

export interface EventDraft {
  /** The event being edited, or null for a new one. */
  id: string | null;
  title: string;
  notes: string;
  location: string;
  allDay: boolean;
  date: DateKey;
  endDate: DateKey;
  /** `HH:MM`, the value of a time input. */
  start: string;
  end: string;
  color: EventColor;
  repeat: RepeatChoice;
  interval: string;
  weekdays: number[];
  ends: EndsChoice;
  until: DateKey;
  count: string;
}

export type DraftField = 'title' | 'date' | 'time' | 'repeat';

export interface DraftError {
  field: DraftField;
  message: string;
}

export interface DraftSeed {
  date: DateKey;
  start?: number;
  end?: number;
  allDay?: boolean;
}

/** A blank event on a day, or on the slot a drag drew. */
export function emptyDraft(seed: DraftSeed): EventDraft {
  const start = seed.start ?? DEFAULT_START;
  const end = seed.end ?? start + DEFAULT_DURATION;
  return {
    id: null,
    title: '',
    notes: '',
    location: '',
    allDay: seed.allDay ?? false,
    date: seed.date,
    endDate: seed.date,
    start: toTimeValue(start),
    end: toTimeValue(end),
    color: 'neutral',
    repeat: 'none',
    interval: '1',
    weekdays: [weekdayOf(seed.date)],
    ends: 'never',
    until: addDays(seed.date, 30),
    count: '10',
  };
}

export function draftFromEvent(event: CalendarEvent): EventDraft {
  const rule = event.recurrence;
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    allDay: event.allDay,
    date: event.date,
    endDate: event.endDate,
    start: toTimeValue(event.start),
    end: toTimeValue(event.end),
    color: event.color,
    repeat: rule ? rule.freq : 'none',
    interval: String(rule?.interval ?? 1),
    weekdays: rule && rule.weekdays.length > 0 ? [...rule.weekdays] : [weekdayOf(event.date)],
    ends: rule?.count ? 'after' : rule?.until ? 'on' : 'never',
    until: rule?.until ?? addDays(event.date, 30),
    count: String(rule?.count ?? 10),
  };
}

function parseCount(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_COUNT, n);
}

function parseInterval(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_INTERVAL, n);
}

export function draftRecurrence(draft: EventDraft): Recurrence | DraftError | null {
  if (draft.repeat === 'none') return null;
  const interval = parseInterval(draft.interval);
  if (interval === null) {
    return { field: 'repeat', message: 'Repeat every needs a whole number of 1 or more.' };
  }
  if (draft.repeat === 'weekly' && draft.weekdays.length === 0) {
    return { field: 'repeat', message: 'Pick at least one weekday.' };
  }
  let count: number | null = null;
  let until: DateKey | null = null;
  if (draft.ends === 'after') {
    count = parseCount(draft.count);
    if (count === null) return { field: 'repeat', message: 'Enter how many times it repeats.' };
  }
  if (draft.ends === 'on') {
    if (!isDateKey(draft.until)) return { field: 'repeat', message: 'Enter an end date.' };
    if (compareKeys(draft.until, draft.date) < 0) {
      return { field: 'repeat', message: 'The series ends before it starts.' };
    }
    until = draft.until;
  }
  return {
    freq: draft.repeat,
    interval,
    weekdays:
      draft.weekdays.length > 0
        ? [...draft.weekdays].sort((a, b) => a - b)
        : [weekdayOf(draft.date)],
    count,
    until,
  };
}

function isError(value: unknown): value is DraftError {
  return typeof value === 'object' && value !== null && 'field' in value && 'message' in value;
}

export type DraftResult = { ok: true; input: EventInput } | { ok: false; error: DraftError };

/** The event a draft describes, or the first thing that stops it being one. */
export function draftToInput(draft: EventDraft): DraftResult {
  if (!isDateKey(draft.date)) {
    return { ok: false, error: { field: 'date', message: 'Enter a date.' } };
  }
  const recurrence = draftRecurrence(draft);
  if (isError(recurrence)) return { ok: false, error: recurrence };

  if (draft.allDay) {
    if (!isDateKey(draft.endDate)) {
      return { ok: false, error: { field: 'date', message: 'Enter an end date.' } };
    }
    if (compareKeys(draft.endDate, draft.date) < 0) {
      return { ok: false, error: { field: 'date', message: 'The event ends before it starts.' } };
    }
    return {
      ok: true,
      input: {
        title: draft.title,
        notes: draft.notes,
        location: draft.location,
        allDay: true,
        date: draft.date,
        endDate: draft.endDate,
        start: 0,
        end: MINUTES_PER_DAY,
        color: draft.color,
        recurrence,
      },
    };
  }

  const start = fromTimeValue(draft.start);
  const end = fromTimeValue(draft.end);
  if (start === null || end === null) {
    return { ok: false, error: { field: 'time', message: 'Enter a start and an end time.' } };
  }
  if (start === end) {
    return { ok: false, error: { field: 'time', message: 'The end time repeats the start time.' } };
  }
  return {
    ok: true,
    input: {
      title: draft.title,
      notes: draft.notes,
      location: draft.location,
      allDay: false,
      date: draft.date,
      endDate: draft.date,
      start,
      // An end before the start means the event runs into the next day.
      end: end < start ? end + MINUTES_PER_DAY : end,
      color: draft.color,
      recurrence,
    },
  };
}

/** True when the times say the event crosses midnight, so the dialog can say so. */
export function crossesMidnight(draft: EventDraft): boolean {
  if (draft.allDay) return false;
  const start = fromTimeValue(draft.start);
  const end = fromTimeValue(draft.end);
  return start !== null && end !== null && end < start;
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  return weekdays.includes(day)
    ? weekdays.filter((d) => d !== day)
    : [...weekdays, day].sort((a, b) => a - b);
}
