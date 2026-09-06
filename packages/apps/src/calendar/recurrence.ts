/**
 * Turning a recurrence rule into the days it lands on.
 *
 * Expansion is always bounded by the window being drawn, so a rule with no end
 * costs the same as one with ten occurrences. Rules never invent a date that
 * does not exist: a monthly event on the 31st simply has no February, and a
 * yearly one on 29 February appears only in leap years — the skipped turns do
 * not count against a `count` limit either.
 */
import {
  addDays,
  compareKeys,
  type DateKey,
  daysInMonth,
  diffDays,
  epochDayOf,
  fromEpochDay,
  keyFromEpochDay,
  MINUTES_PER_DAY,
  parseKey,
  toEpochDay,
  weekdayOf,
} from './dates';
import type { CalendarEvent, EventOverride, Occurrence, Recurrence } from './events';

/** A stop for runaway rules; no view asks for more days than this. */
const MAX_STEPS = 4000;

/** How many extra days an event reaches past the day it starts on. */
export function spanDays(
  event: Pick<CalendarEvent, 'allDay' | 'date' | 'endDate' | 'end'>,
): number {
  if (event.allDay) return Math.max(0, diffDays(event.date, event.endDate));
  return event.end > MINUTES_PER_DAY ? 1 : 0;
}

/** The last day an occurrence shows on, counting a run past midnight. */
export function occurrenceEnd(occurrence: Occurrence): DateKey {
  if (occurrence.allDay) return occurrence.endDate;
  return occurrence.end > MINUTES_PER_DAY ? addDays(occurrence.date, 1) : occurrence.date;
}

/** Every day an occurrence appears on, first to last. */
export function coveredDays(occurrence: Occurrence): DateKey[] {
  const last = occurrenceEnd(occurrence);
  const total = Math.max(0, diffDays(occurrence.date, last));
  return Array.from({ length: total + 1 }, (_, i) => addDays(occurrence.date, i));
}

function withinLimit(rule: Recurrence, date: DateKey): boolean {
  return rule.until === null || compareKeys(date, rule.until) <= 0;
}

/**
 * The dates the rule puts an occurrence on inside `[from, to]`, ignoring
 * overrides. The series start is always the first candidate.
 */
export function seriesDates(event: CalendarEvent, from: DateKey, to: DateKey): DateKey[] {
  const rule = event.recurrence;
  const startDay = epochDayOf(event.date);
  const fromDay = epochDayOf(from);
  const toDay = epochDayOf(to);
  if (toDay < startDay) return [];
  if (!rule) return startDay >= fromDay ? [event.date] : [];

  const limited = rule.count !== null;
  const out: DateKey[] = [];
  let emitted = 0;

  const take = (date: DateKey): 'stop' | 'skip' | 'ok' => {
    if (!withinLimit(rule, date)) return 'stop';
    emitted += 1;
    const day = epochDayOf(date);
    if (day >= fromDay && day <= toDay) out.push(date);
    if (rule.count !== null && emitted >= rule.count) return 'stop';
    return 'ok';
  };

  const interval = Math.max(1, rule.interval);

  if (rule.freq === 'daily') {
    // With no count to keep, jump straight to the window instead of walking.
    let step = 0;
    if (!limited && fromDay > startDay) {
      step = Math.floor((fromDay - startDay) / interval);
    }
    for (let i = 0; i < MAX_STEPS; i += 1, step += 1) {
      const day = startDay + step * interval;
      if (day > toDay) break;
      if (take(keyFromEpochDay(day)) === 'stop') break;
    }
    return out;
  }

  if (rule.freq === 'weekly') {
    const weekdays = [...rule.weekdays].sort((a, b) => a - b);
    const anchor = startDay - weekdayOf(event.date);
    let week = 0;
    if (!limited && fromDay > startDay) {
      week = Math.max(0, Math.floor((fromDay - anchor) / (7 * interval)));
    }
    for (let i = 0; i < MAX_STEPS; i += 1, week += 1) {
      const weekStart = anchor + week * interval * 7;
      if (weekStart > toDay) break;
      let stopped = false;
      for (const weekday of weekdays) {
        const day = weekStart + weekday;
        if (day < startDay) continue;
        if (day > toDay) {
          stopped = true;
          break;
        }
        if (take(keyFromEpochDay(day)) === 'stop') {
          stopped = true;
          break;
        }
      }
      if (stopped && (rule.count === null || emitted >= rule.count)) break;
      if (stopped && weekStart + 6 > toDay) break;
    }
    return out;
  }

  const start = parseKey(event.date);
  if (!start) return [];
  const monthStep = rule.freq === 'yearly' ? interval * 12 : interval;
  const startMonth = start.year * 12 + (start.month - 1);
  let step = 0;
  if (!limited && fromDay > startDay) {
    const fromCivil = fromEpochDay(fromDay);
    const fromMonth = fromCivil.year * 12 + (fromCivil.month - 1);
    step = Math.max(0, Math.floor((fromMonth - startMonth) / monthStep));
  }
  for (let i = 0; i < MAX_STEPS; i += 1, step += 1) {
    const index = startMonth + step * monthStep;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    if (toEpochDay({ year, month, day: 1 }) > toDay) break;
    // A month too short for this day of the month has no occurrence at all.
    if (start.day > daysInMonth(year, month)) continue;
    const day = toEpochDay({ year, month, day: start.day });
    if (day > toDay) break;
    if (day < startDay) continue;
    if (take(keyFromEpochDay(day)) === 'stop') break;
  }
  return out;
}

/** Does the rule land on this exact date? Used to validate a stored override. */
export function occursOn(event: CalendarEvent, date: DateKey): boolean {
  return seriesDates(event, date, date).length > 0;
}

function overrideFor(event: CalendarEvent, date: DateKey): EventOverride | undefined {
  return event.exceptions.find((e) => e.on === date);
}

function build(event: CalendarEvent, origin: DateKey): Occurrence | null {
  const override = overrideFor(event, origin);
  if (override && override.to === null) return null;
  const span = spanDays(event);
  const date = override?.to ? override.to.date : origin;
  return {
    id: `${event.id}@${origin}`,
    event,
    origin,
    date,
    endDate: event.allDay ? addDays(date, span) : date,
    start: override?.to ? override.to.start : event.start,
    end: override?.to ? override.to.end : event.end,
    allDay: event.allDay,
    moved: Boolean(override?.to),
  };
}

function intersects(occurrence: Occurrence, fromDay: number, toDay: number): boolean {
  const first = epochDayOf(occurrence.date);
  const last = epochDayOf(occurrenceEnd(occurrence));
  return last >= fromDay && first <= toDay;
}

/**
 * Every appearance of one event inside `[from, to]`, overrides applied. An
 * occurrence moved into the window from outside it comes along too.
 */
export function expandEvent(event: CalendarEvent, from: DateKey, to: DateKey): Occurrence[] {
  const fromDay = epochDayOf(from);
  const toDay = epochDayOf(to);
  const reach = addDays(from, -spanDays(event));
  const origins = seriesDates(event, reach, to);
  const seen = new Set(origins);
  const out: Occurrence[] = [];
  for (const origin of origins) {
    const occurrence = build(event, origin);
    if (occurrence && intersects(occurrence, fromDay, toDay)) out.push(occurrence);
  }
  for (const override of event.exceptions) {
    if (!override.to || seen.has(override.on)) continue;
    const occurrence = build(event, override.on);
    if (!occurrence || !intersects(occurrence, fromDay, toDay)) continue;
    if (!occursOn(event, override.on)) continue;
    out.push(occurrence);
  }
  return out;
}

export function expandEvents(events: CalendarEvent[], from: DateKey, to: DateKey): Occurrence[] {
  return events.flatMap((event) => expandEvent(event, from, to));
}

export interface RecurrenceWords {
  /** Weekday names in Sunday-first order, as the summary should print them. */
  weekdays: string[];
  /** How the limit date should read, e.g. "5 Sep 2026". */
  formatDate: (date: DateKey) => string;
}

const UNIT: Record<Recurrence['freq'], [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

/** A one-line summary of a rule, e.g. "Every 2 weeks on Mon, Thu, until 5 Sep 2026". */
export function describeRecurrence(
  rule: Recurrence | null,
  start: DateKey,
  words: RecurrenceWords,
): string {
  if (!rule) return 'Does not repeat';
  const unit = UNIT[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit[0]}` : `Every ${rule.interval} ${unit[1]}`;
  const parts: string[] = [every];
  if (rule.freq === 'weekly') {
    const names = [...rule.weekdays]
      .sort((a, b) => a - b)
      .map((d) => words.weekdays[d] ?? String(d));
    if (names.length > 0) parts.push(`on ${names.join(', ')}`);
  }
  if (rule.freq === 'monthly') {
    const day = parseKey(start)?.day;
    if (day) parts.push(`on day ${day}`);
  }
  let text = parts.join(' ');
  if (rule.count !== null) text += `, ${rule.count} times`;
  else if (rule.until) text += `, until ${words.formatDate(rule.until)}`;
  return text;
}
