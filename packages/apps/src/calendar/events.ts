/**
 * The calendar's document: what an event is, how one is read back off disk,
 * how the store changes, and how a day's entries are ordered and searched.
 * Recurrence rules are described here and expanded in `recurrence.ts`.
 */
import {
  addDays,
  clampMinutes,
  compareKeys,
  type DateKey,
  diffDays,
  isDateKey,
  MINUTES_PER_DAY,
  weekdayOf,
} from './dates';

/**
 * Event colours: the neutral ramp plus the one accent, so a calendar full of
 * events stays a calendar and not a paint chart.
 */
export const EVENT_COLORS = ['neutral', 'accent', 'ink', 'outline'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export const COLOR_LABELS: Record<EventColor, string> = {
  neutral: 'Neutral',
  accent: 'Accent',
  ink: 'Ink',
  outline: 'Outline',
};

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Recurrence {
  freq: Frequency;
  /** Every `interval` days / weeks / months / years. At least 1. */
  interval: number;
  /** Weekly only: the weekdays it lands on (Sunday = 0). Never empty. */
  weekdays: number[];
  /** Stop after this many occurrences, counting the first. */
  count: number | null;
  /** Last date an occurrence may fall on, inclusive. */
  until: DateKey | null;
}

/**
 * One occurrence pulled out of its series: deleted when `to` is null,
 * otherwise moved to another day or time.
 */
export interface EventOverride {
  /** The date the rule put the occurrence on. */
  on: DateKey;
  to: { date: DateKey; start: number; end: number } | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  notes: string;
  location: string;
  allDay: boolean;
  /** First day of the event, and the first day of a series. */
  date: DateKey;
  /** Last day of an all-day event; equal to `date` for a single day. */
  endDate: DateKey;
  /** Minutes from midnight on `date`. Timed events only. */
  start: number;
  /** Minutes from the same midnight; over 1440 when the event runs past it. */
  end: number;
  color: EventColor;
  recurrence: Recurrence | null;
  exceptions: EventOverride[];
  createdAt: number;
  updatedAt: number;
}

/** One appearance of an event on the calendar. */
export interface Occurrence {
  /** `${event.id}@${origin}` — stable across a re-expansion. */
  id: string;
  event: CalendarEvent;
  /** The date the recurrence rule chose, before any override. */
  origin: DateKey;
  date: DateKey;
  endDate: DateKey;
  start: number;
  end: number;
  allDay: boolean;
  /** True when an override moved this one away from the rule. */
  moved: boolean;
}

export interface CalendarPrefs {
  view: 'month' | 'week' | 'day' | 'agenda';
  showSidebar: boolean;
}

export interface CalendarData {
  version: 1;
  events: CalendarEvent[];
  prefs: CalendarPrefs;
}

export const DEFAULT_PREFS: CalendarPrefs = { view: 'month', showSidebar: true };

export const DEFAULT_DATA: CalendarData = { version: 1, events: [], prefs: DEFAULT_PREFS };

/** Shortest event the editor will accept, in minutes. */
export const MIN_DURATION = 5;
/** New events land here when a day is clicked rather than a time. */
export const DEFAULT_START = 9 * 60;
export const DEFAULT_DURATION = 60;

// ── reading stored JSON ───────────────────────────────────────────────────

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeWeekdays(value: unknown, fallback: number): number[] {
  const list = Array.isArray(value)
    ? value
        .filter((d): d is number => typeof d === 'number' && Number.isInteger(d))
        .map((d) => ((d % 7) + 7) % 7)
    : [];
  const unique = [...new Set(list)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [fallback];
}

/** Recurrence rules are capped so a broken file cannot spin the expander. */
export const MAX_COUNT = 999;
export const MAX_INTERVAL = 999;

export function normalizeRecurrence(value: unknown, startWeekday: number): Recurrence | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const freq = FREQUENCIES.find((f) => f === raw.freq);
  if (!freq) return null;
  const count = typeof raw.count === 'number' && raw.count >= 1 ? Math.floor(raw.count) : null;
  const until = isDateKey(raw.until) ? raw.until : null;
  return {
    freq,
    interval: Math.min(MAX_INTERVAL, Math.max(1, Math.floor(num(raw.interval, 1)))),
    weekdays: normalizeWeekdays(raw.weekdays, startWeekday),
    count: count === null ? null : Math.min(MAX_COUNT, count),
    // A rule cannot both count and run until a date; the count wins.
    until: count === null ? until : null,
  };
}

function normalizeOverride(value: unknown): EventOverride | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!isDateKey(raw.on)) return null;
  const to = raw.to;
  if (to === null || to === undefined) return { on: raw.on, to: null };
  if (typeof to !== 'object') return null;
  const target = to as Record<string, unknown>;
  if (!isDateKey(target.date)) return null;
  const start = clampMinutes(num(target.start, 0));
  const end = clampMinutes(num(target.end, start + DEFAULT_DURATION), MINUTES_PER_DAY * 2);
  return { on: raw.on, to: { date: target.date, start, end: Math.max(start + MIN_DURATION, end) } };
}

/** Read one event out of unknown JSON, or reject it. */
export function normalizeEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id);
  if (!id || !isDateKey(raw.date)) return null;
  const date = raw.date;
  const allDay = raw.allDay === true;
  const endDate =
    isDateKey(raw.endDate) && compareKeys(raw.endDate, date) >= 0 ? raw.endDate : date;
  const start = clampMinutes(num(raw.start, DEFAULT_START));
  const rawEnd = clampMinutes(num(raw.end, start + DEFAULT_DURATION), MINUTES_PER_DAY * 2);
  const color = EVENT_COLORS.find((c) => c === raw.color) ?? 'neutral';
  const weekday = weekdayOf(date);
  const overrides = Array.isArray(raw.exceptions)
    ? raw.exceptions.map(normalizeOverride).filter((o): o is EventOverride => o !== null)
    : [];
  return {
    id,
    title: str(raw.title),
    notes: str(raw.notes),
    location: str(raw.location),
    allDay,
    date,
    endDate: allDay ? endDate : date,
    start,
    end: Math.max(start + MIN_DURATION, rawEnd),
    color,
    recurrence: normalizeRecurrence(raw.recurrence, weekday),
    exceptions: overrides,
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0),
  };
}

function normalizePrefs(value: unknown): CalendarPrefs {
  const raw = (value ?? {}) as Record<string, unknown>;
  const view = raw.view;
  return {
    view: view === 'week' || view === 'day' || view === 'agenda' ? view : 'month',
    showSidebar: typeof raw.showSidebar === 'boolean' ? raw.showSidebar : true,
  };
}

/** The whole file, with anything unreadable dropped rather than guessed at. */
export function normalizeData(value: unknown): CalendarData {
  const raw = (value ?? {}) as Record<string, unknown>;
  const events = Array.isArray(raw.events)
    ? raw.events.map(normalizeEvent).filter((e): e is CalendarEvent => e !== null)
    : [];
  return { version: 1, events, prefs: normalizePrefs(raw.prefs) };
}

// ── building an event ─────────────────────────────────────────────────────

export interface EventInput {
  title?: string;
  notes?: string;
  location?: string;
  allDay?: boolean;
  date: DateKey;
  endDate?: DateKey;
  start?: number;
  end?: number;
  color?: EventColor;
  recurrence?: Recurrence | null;
}

export function createEvent(input: EventInput, id: string, now: number): CalendarEvent {
  const allDay = input.allDay ?? false;
  const start = clampMinutes(input.start ?? DEFAULT_START);
  const end = clampMinutes(input.end ?? start + DEFAULT_DURATION, MINUTES_PER_DAY * 2);
  const endDate =
    input.endDate && compareKeys(input.endDate, input.date) >= 0 ? input.endDate : input.date;
  return {
    id,
    title: input.title ?? '',
    notes: input.notes ?? '',
    location: input.location ?? '',
    allDay,
    date: input.date,
    endDate: allDay ? endDate : input.date,
    start,
    end: Math.max(start + MIN_DURATION, end),
    color: input.color ?? 'neutral',
    recurrence: input.recurrence ?? null,
    exceptions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A fresh event id. The clock alone is not enough — two events made in the
 * same millisecond would collide — so a counter rides along with it.
 */
let sequence = 0;
export function newEventId(): string {
  sequence += 1;
  return `e${Date.now().toString(36)}${sequence.toString(36)}`;
}

/** The title as shown when the field was left empty. */
export const UNTITLED = 'New Event';

export function displayTitle(event: CalendarEvent): string {
  return event.title.trim() || UNTITLED;
}

// ── the store ─────────────────────────────────────────────────────────────

export type CalendarAction =
  | { type: 'create'; event: CalendarEvent }
  | { type: 'update'; id: string; patch: Partial<EventInput>; now: number }
  | { type: 'delete'; id: string }
  /** Move a single event, or shift a whole series by the same number of days. */
  | { type: 'move'; id: string; to: { date: DateKey; start: number; end: number }; now: number }
  | { type: 'deleteOccurrence'; id: string; on: DateKey; now: number }
  | {
      type: 'moveOccurrence';
      id: string;
      on: DateKey;
      to: { date: DateKey; start: number; end: number };
      now: number;
    };

function withOverride(event: CalendarEvent, override: EventOverride, now: number): CalendarEvent {
  const exceptions = event.exceptions.filter((e) => e.on !== override.on);
  exceptions.push(override);
  exceptions.sort((a, b) => compareKeys(a.on, b.on));
  return { ...event, exceptions, updatedAt: now };
}

function applyPatch(event: CalendarEvent, patch: Partial<EventInput>, now: number): CalendarEvent {
  const allDay = patch.allDay ?? event.allDay;
  const date = patch.date ?? event.date;
  const start = clampMinutes(patch.start ?? event.start);
  const end = clampMinutes(patch.end ?? event.end, MINUTES_PER_DAY * 2);
  const wantedEnd = patch.endDate ?? event.endDate;
  const endDate = compareKeys(wantedEnd, date) >= 0 ? wantedEnd : date;
  return {
    ...event,
    title: patch.title ?? event.title,
    notes: patch.notes ?? event.notes,
    location: patch.location ?? event.location,
    allDay,
    date,
    endDate: allDay ? endDate : date,
    start,
    end: Math.max(start + MIN_DURATION, end),
    color: patch.color ?? event.color,
    recurrence: patch.recurrence === undefined ? event.recurrence : patch.recurrence,
    updatedAt: now,
  };
}

export function calendarReducer(events: CalendarEvent[], action: CalendarAction): CalendarEvent[] {
  switch (action.type) {
    case 'create':
      return [...events, action.event];
    case 'delete':
      return events.filter((e) => e.id !== action.id);
    case 'update':
      return events.map((e) => (e.id === action.id ? applyPatch(e, action.patch, action.now) : e));
    case 'move':
      return events.map((e) => {
        if (e.id !== action.id) return e;
        const shift = diffDays(e.date, action.to.date);
        return applyPatch(
          e,
          {
            date: action.to.date,
            endDate: addDays(e.endDate, shift),
            start: action.to.start,
            end: action.to.end,
          },
          action.now,
        );
      });
    case 'deleteOccurrence':
      return events.map((e) =>
        e.id === action.id ? withOverride(e, { on: action.on, to: null }, action.now) : e,
      );
    case 'moveOccurrence':
      return events.map((e) =>
        e.id === action.id ? withOverride(e, { on: action.on, to: action.to }, action.now) : e,
      );
    default:
      return events;
  }
}

// ── ordering and search ───────────────────────────────────────────────────

/** All-day first, then by start, then by the longer event, then by title. */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byDate = compareKeys(a.date, b.date);
  if (byDate !== 0) return byDate;
  if (!a.allDay && a.start !== b.start) return a.start - b.start;
  const lengthA = a.allDay ? diffDays(a.date, a.endDate) : a.end - a.start;
  const lengthB = b.allDay ? diffDays(b.date, b.endDate) : b.end - b.start;
  if (lengthA !== lengthB) return lengthB - lengthA;
  const byTitle = displayTitle(a.event).localeCompare(displayTitle(b.event));
  return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
}

export function sortOccurrences(list: Occurrence[]): Occurrence[] {
  return [...list].sort(compareOccurrences);
}

/** Group occurrences by the day they show on, in date order. */
export function groupByDay(list: Occurrence[]): Array<{ date: DateKey; items: Occurrence[] }> {
  const byDay = new Map<DateKey, Occurrence[]>();
  for (const item of sortOccurrences(list)) {
    const bucket = byDay.get(item.date);
    if (bucket) bucket.push(item);
    else byDay.set(item.date, [item]);
  }
  return [...byDay.entries()]
    .sort((a, b) => compareKeys(a[0], b[0]))
    .map(([date, items]) => ({ date, items }));
}

export interface SearchHit {
  event: CalendarEvent;
  /** Where the query matched, for the result line. */
  field: 'title' | 'location' | 'notes';
}

/**
 * Search every event, series included, over title, location and notes. Title
 * matches come first, then location, then notes; ties break by date.
 */
export function searchEvents(events: CalendarEvent[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rank: Record<SearchHit['field'], number> = { title: 0, location: 1, notes: 2 };
  const hits: SearchHit[] = [];
  for (const event of events) {
    const field = (['title', 'location', 'notes'] as const).find((f) =>
      event[f].toLowerCase().includes(needle),
    );
    if (field) hits.push({ event, field });
  }
  return hits.sort((a, b) => {
    const byField = rank[a.field] - rank[b.field];
    if (byField !== 0) return byField;
    const byDate = compareKeys(a.event.date, b.event.date);
    if (byDate !== 0) return byDate;
    return displayTitle(a.event).localeCompare(displayTitle(b.event));
  });
}
