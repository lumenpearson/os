/**
 * Dates typed into the title of a new reminder.
 *
 * "Call the dentist tomorrow at 9am" is one line to type and three fields to
 * fill in, so the line is read here: the phrases that name a day, a time or a
 * repeat are lifted out and the rest is the title. Nothing understood means
 * nothing changed — the title comes back exactly as it was typed.
 *
 * The clock is never read in this file. "Today" arrives as an argument, which
 * is what makes the tests deterministic and what keeps a reminder typed at
 * 23:59 from landing on the wrong day.
 *
 * Two readings need naming, because English does not settle them:
 *   • "friday" is the coming Friday, and today when today is Friday;
 *     "next friday" always steps past today, to the Friday of next week.
 *   • "at 9" is 09:00 — a bare hour is read on the 24-hour clock rather than
 *     guessed at. "9am", "9:30" and "at 21:00" all say it plainly.
 */

import {
  addDays,
  addMonths,
  compareKeys,
  type DateKey,
  nextWeekday,
  parseKey,
  toKey,
  type Weekday,
} from './date';
import type { Frequency, Repeat } from './store';

export interface ParseNow {
  date: DateKey;
  /** Minutes since midnight, used to decide whether a bare time is today. */
  minutes: number;
}

export interface ParseResult {
  /** The title with the phrases that were understood taken out. */
  title: string;
  due: DateKey | null;
  dueTime: number | null;
  repeat: Repeat | null;
  /** The phrases understood, in the order they were written. */
  matched: string[];
}

const WEEKDAYS: Record<string, Weekday> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  weds: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** Longest first, so "sunday" wins over "sun" wherever both could start. */
function alternation(names: string[]): string {
  return [...names].sort((a, b) => b.length - a.length).join('|');
}

const WEEKDAY_NAMES = alternation(Object.keys(WEEKDAYS));
const MONTH_NAMES = alternation(Object.keys(MONTHS));
/** The words that introduce a date and belong to it, not to the title. */
const LEAD = String.raw`(?:\b(?:on|at|by|due(?:\s+on)?)\s+)?`;
const DAY = String.raw`(3[01]|[12]\d|0?[1-9])(?:st|nd|rd|th)?`;

interface Hit<T> {
  start: number;
  end: number;
  text: string;
  value: T;
}

/**
 * The first match a pattern makes that the reader can turn into a value. A
 * reader returning null keeps the search going, so "31 Feb" — a date the
 * calendar does not have — is left in the title instead of being swallowed.
 */
function firstHit<T>(
  text: string,
  pattern: RegExp,
  read: (match: RegExpExecArray) => T | null,
): Hit<T> | null {
  const re = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  let match = re.exec(text);
  while (match) {
    const value = read(match);
    if (value !== null) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0].trim(),
        value,
      };
    }
    match = re.exec(text);
  }
  return null;
}

type Matcher<T> = [RegExp, (match: RegExpExecArray) => T | null];

/** The earliest hit; ties go to the earlier — more specific — pattern. */
function earliest<T>(text: string, matchers: Array<Matcher<T>>): Hit<T> | null {
  let best: Hit<T> | null = null;
  for (const [pattern, read] of matchers) {
    const hit = firstHit(text, pattern, read);
    if (hit && (best === null || hit.start < best.start)) best = hit;
  }
  return best;
}

/** Replace a hit with spaces, keeping every other index where it was. */
function blank(text: string, hit: Hit<unknown>): string {
  return text.slice(0, hit.start) + ' '.repeat(hit.end - hit.start) + text.slice(hit.end);
}

/**
 * A day and month with no year: this year, or the next year it exists in. The
 * search runs a few years out so that "29 Feb" finds the next leap day rather
 * than reading as nothing.
 */
function resolveMonthDay(
  day: number,
  month: number,
  year: number | null,
  today: DateKey,
): DateKey | null {
  const startYear = year ?? Number(today.slice(0, 4));
  for (let step = 0; step < 5; step += 1) {
    const key = toKey({ year: startYear + step, month, day });
    if (!parseKey(key)) continue;
    if (year !== null || compareKeys(key, today) >= 0) return key;
  }
  return null;
}

function countOf(word: string | undefined): number {
  if (!word) return 1;
  if (/^an?$/i.test(word)) return 1;
  const value = Number(word);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function stepBy(today: DateKey, unit: string, count: number): DateKey {
  switch (unit.toLowerCase()) {
    case 'day':
    case 'days':
      return addDays(today, count);
    case 'week':
    case 'weeks':
      return addDays(today, count * 7);
    case 'month':
    case 'months':
      return addMonths(today, count);
    default:
      return addMonths(today, count * 12);
  }
}

function freqOf(unit: string): Frequency {
  switch (unit.toLowerCase()) {
    case 'day':
    case 'days':
    case 'daily':
      return 'daily';
    case 'month':
    case 'months':
    case 'monthly':
      return 'monthly';
    case 'year':
    case 'years':
    case 'yearly':
    case 'annually':
      return 'yearly';
    default:
      return 'weekly';
  }
}

/** The next date a weekday falls on. "next" always steps past today. */
function weekdayDate(today: DateKey, weekday: Weekday, qualifier: string | undefined): DateKey {
  return nextWeekday(today, weekday, (qualifier ?? '').toLowerCase() !== 'next');
}

interface RepeatHit {
  repeat: Repeat;
  /** "every friday" names a day as well as a rule. */
  due: DateKey | null;
}

function repeatMatchers(today: DateKey): Array<Matcher<RepeatHit>> {
  return [
    [
      new RegExp(String.raw`\bevery\s+(${WEEKDAY_NAMES})\b`, 'i'),
      (m) => {
        const weekday = WEEKDAYS[(m[1] ?? '').toLowerCase()];
        if (weekday === undefined) return null;
        return {
          repeat: { freq: 'weekly', interval: 1 },
          due: weekdayDate(today, weekday, undefined),
        };
      },
    ],
    [
      /\bevery\s+(?:(\d{1,3}|other)\s+)?(days?|weeks?|months?|years?)\b/i,
      (m) => {
        const word = m[1];
        const unit = m[2];
        if (!unit) return null;
        const interval = word && /^other$/i.test(word) ? 2 : countOf(word);
        return { repeat: { freq: freqOf(unit), interval }, due: null };
      },
    ],
    [
      /\b(daily|weekly|monthly|yearly|annually)\b/i,
      (m) => {
        const word = m[1];
        if (!word) return null;
        return { repeat: { freq: freqOf(word), interval: 1 }, due: null };
      },
    ],
  ];
}

function dateMatchers(today: DateKey): Array<Matcher<DateKey>> {
  return [
    [
      new RegExp(String.raw`${LEAD}\b${DAY}\s+(${MONTH_NAMES})\.?(?:,?\s+(\d{4}))?\b`, 'i'),
      (m) => {
        const month = MONTHS[(m[2] ?? '').toLowerCase()];
        if (month === undefined) return null;
        return resolveMonthDay(Number(m[1]), month, m[3] ? Number(m[3]) : null, today);
      },
    ],
    [
      new RegExp(String.raw`${LEAD}\b(${MONTH_NAMES})\.?\s+${DAY}(?:,?\s+(\d{4}))?\b`, 'i'),
      (m) => {
        const month = MONTHS[(m[1] ?? '').toLowerCase()];
        if (month === undefined) return null;
        return resolveMonthDay(Number(m[2]), month, m[3] ? Number(m[3]) : null, today);
      },
    ],
    [/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => addDays(today, 2)],
    [
      /\b(today|tomorrow|yesterday)\b/i,
      (m) => {
        switch ((m[1] ?? '').toLowerCase()) {
          case 'tomorrow':
            return addDays(today, 1);
          case 'yesterday':
            return addDays(today, -1);
          default:
            return today;
        }
      },
    ],
    [
      /\bin\s+(\d{1,3}|an?)\s+(days?|weeks?|months?|years?)\b/i,
      (m) => (m[2] ? stepBy(today, m[2], countOf(m[1])) : null),
    ],
    [/\bnext\s+(week|month|year)\b/i, (m) => (m[1] ? stepBy(today, `${m[1]}s`, 1) : null)],
    [
      new RegExp(String.raw`(?:\b(on|next|this|coming|by|at)\s+)?\b(${WEEKDAY_NAMES})\b`, 'i'),
      (m) => {
        const weekday = WEEKDAYS[(m[2] ?? '').toLowerCase()];
        if (weekday === undefined) return null;
        return weekdayDate(today, weekday, m[1]);
      },
    ],
  ];
}

const TIME_MATCHERS: Array<Matcher<number>> = [
  [
    /(?:\b(?:at|@)\s*)?\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?(?![a-z])/i,
    (m) => {
      const hour = Number(m[1]) % 12;
      const minutes = m[2] ? Number(m[2]) : 0;
      const pm = (m[3] ?? '').toLowerCase() === 'p';
      return (pm ? hour + 12 : hour) * 60 + minutes;
    },
  ],
  [/\b(noon|midday|midnight)\b/i, (m) => ((m[1] ?? '').toLowerCase() === 'midnight' ? 0 : 12 * 60)],
  [/(?:\bat\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => Number(m[1]) * 60 + Number(m[2])],
  [/\bat\s+([01]?\d|2[0-3])\b(?!\s*[:.]\d)/i, (m) => Number(m[1]) * 60],
];

/** Whitespace left by the phrases taken out, and any word left dangling. */
function cleanTitle(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,;:–—-]+$/, '')
    .replace(/\s+\b(on|at|by|due|from|every|in)$/i, '')
    .trim();
}

/**
 * Read a typed line into a reminder. `now` is the user's own wall clock: the
 * date it is there, and the minute, which decides whether a bare time such as
 * "at 9am" means today or tomorrow.
 */
export function parseReminderInput(text: string, now: ParseNow): ParseResult {
  const today = now.date;
  let rest = text;
  const hits: Array<Hit<unknown>> = [];

  const repeat = earliest(rest, repeatMatchers(today));
  if (repeat) {
    rest = blank(rest, repeat);
    hits.push(repeat);
  }

  const date = earliest(rest, dateMatchers(today));
  if (date) {
    rest = blank(rest, date);
    hits.push(date);
  }

  const time = earliest(rest, TIME_MATCHERS);
  if (time) {
    rest = blank(rest, time);
    hits.push(time);
  }

  if (hits.length === 0) {
    return { title: text, due: null, dueTime: null, repeat: null, matched: [] };
  }

  let due = date?.value ?? repeat?.value.due ?? null;
  const dueTime = time?.value ?? null;
  // A time alone means today, unless the hour has already gone by.
  if (due === null && dueTime !== null) {
    due = dueTime > now.minutes ? today : addDays(today, 1);
  }
  // A rule has to repeat from somewhere.
  if (due === null && repeat) due = today;

  const cleaned = cleanTitle(rest);
  return {
    // A line that was nothing but a date keeps its words as the title.
    title: cleaned || text.trim(),
    due,
    dueTime,
    repeat: repeat?.value.repeat ?? null,
    matched: hits.sort((a, b) => a.start - b.start).map((h) => h.text),
  };
}
