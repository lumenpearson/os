import { describe, expect, it } from 'vitest';
import type { DateKey } from './dates';
import {
  type CalendarEvent,
  createEvent,
  type EventInput,
  normalizeRecurrence,
  type Recurrence,
} from './events';
import {
  coveredDays,
  describeRecurrence,
  expandEvent,
  expandEvents,
  occurrenceEnd,
  occursOn,
  seriesDates,
  spanDays,
} from './recurrence';

function rule(partial: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence {
  return {
    interval: 1,
    weekdays: [0],
    count: null,
    until: null,
    ...partial,
  };
}

function event(input: EventInput & { id?: string }): CalendarEvent {
  return createEvent(input, input.id ?? 'e1', 0);
}

const dates = (e: CalendarEvent, from: DateKey, to: DateKey) => seriesDates(e, from, to);

describe('single events', () => {
  it('shows on its own day only', () => {
    const e = event({ date: '2026-09-04' });
    expect(dates(e, '2026-09-01', '2026-09-30')).toEqual(['2026-09-04']);
    expect(dates(e, '2026-09-05', '2026-09-30')).toEqual([]);
    expect(dates(e, '2026-08-01', '2026-09-03')).toEqual([]);
  });

  it('is found through the middle of a multi-day all-day run', () => {
    const e = event({ date: '2026-09-01', endDate: '2026-09-05', allDay: true });
    const [occurrence] = expandEvent(e, '2026-09-03', '2026-09-03');
    if (!occurrence) throw new Error('the run should cover 3 September');
    expect(occurrence.endDate).toBe('2026-09-05');
    expect(spanDays(e)).toBe(4);
    expect(coveredDays(occurrence)).toHaveLength(5);
  });

  it('reaches into the next day when it runs past midnight', () => {
    const e = event({ date: '2026-09-04', start: 23 * 60, end: 25 * 60 });
    const [occurrence] = expandEvent(e, '2026-09-04', '2026-09-04');
    if (!occurrence) throw new Error('the event should show on its own day');
    expect(occurrenceEnd(occurrence)).toBe('2026-09-05');
    expect(expandEvent(e, '2026-09-05', '2026-09-05')).toHaveLength(1);
    expect(expandEvent(e, '2026-09-06', '2026-09-06')).toHaveLength(0);
  });
});

describe('daily rules', () => {
  const daily = event({ date: '2026-09-01', recurrence: rule({ freq: 'daily' }) });

  it('lands on every day inside the window', () => {
    expect(dates(daily, '2026-09-03', '2026-09-06')).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  it('never starts before the series does', () => {
    expect(dates(daily, '2026-08-01', '2026-09-02')).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('honours an interval', () => {
    const every3 = event({
      date: '2026-09-01',
      recurrence: rule({ freq: 'daily', interval: 3 }),
    });
    expect(dates(every3, '2026-09-01', '2026-09-10')).toEqual([
      '2026-09-01',
      '2026-09-04',
      '2026-09-07',
      '2026-09-10',
    ]);
    // Windows that start mid-series stay on the same footing.
    expect(dates(every3, '2026-09-05', '2026-09-08')).toEqual(['2026-09-07']);
  });

  it('stops after a count, even when the window opens later', () => {
    const five = event({ date: '2026-09-01', recurrence: rule({ freq: 'daily', count: 5 }) });
    expect(dates(five, '2026-09-01', '2026-09-30')).toHaveLength(5);
    expect(dates(five, '2026-09-04', '2026-09-30')).toEqual(['2026-09-04', '2026-09-05']);
    expect(dates(five, '2026-09-06', '2026-09-30')).toEqual([]);
  });

  it('stops on the until date, inclusive', () => {
    const until = event({
      date: '2026-09-01',
      recurrence: rule({ freq: 'daily', until: '2026-09-03' }),
    });
    expect(dates(until, '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('keeps the same time on both sides of a clock change', () => {
    const e = event({
      date: '2026-03-06',
      start: 9 * 60,
      end: 10 * 60,
      recurrence: rule({ freq: 'daily' }),
    });
    const found = expandEvent(e, '2026-03-07', '2026-03-09');
    expect(found.map((o) => o.date)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(found.every((o) => o.start === 540 && o.end === 600)).toBe(true);
  });
});

describe('weekly rules', () => {
  it('lands on the chosen weekdays', () => {
    // 4 September 2026 is a Friday; Monday the 31st is before the series.
    const e = event({
      date: '2026-09-04',
      recurrence: rule({ freq: 'weekly', weekdays: [1, 5] }),
    });
    expect(dates(e, '2026-08-24', '2026-09-18')).toEqual([
      '2026-09-04',
      '2026-09-07',
      '2026-09-11',
      '2026-09-14',
      '2026-09-18',
    ]);
  });

  it('skips whole weeks for an interval', () => {
    const e = event({
      date: '2026-09-04',
      recurrence: rule({ freq: 'weekly', weekdays: [1, 5], interval: 2 }),
    });
    expect(dates(e, '2026-09-01', '2026-10-05')).toEqual([
      '2026-09-04',
      '2026-09-14',
      '2026-09-18',
      '2026-09-28',
      '2026-10-02',
    ]);
  });

  it('counts every weekday it lands on', () => {
    const e = event({
      date: '2026-09-04',
      recurrence: rule({ freq: 'weekly', weekdays: [1, 5], count: 3 }),
    });
    expect(dates(e, '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-04',
      '2026-09-07',
      '2026-09-11',
    ]);
  });

  it('reads a window far from the start without walking every week', () => {
    const e = event({
      date: '2020-01-06',
      recurrence: rule({ freq: 'weekly', weekdays: [1] }),
    });
    expect(dates(e, '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });
});

describe('monthly rules', () => {
  it('skips months that are too short for the day', () => {
    const e = event({ date: '2026-01-31', recurrence: rule({ freq: 'monthly' }) });
    expect(dates(e, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
  });

  it('does not spend a count on a month it skipped', () => {
    const e = event({ date: '2026-01-31', recurrence: rule({ freq: 'monthly', count: 3 }) });
    expect(dates(e, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('honours an interval', () => {
    const e = event({ date: '2026-01-15', recurrence: rule({ freq: 'monthly', interval: 3 }) });
    expect(dates(e, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });

  it('finds the right month from a window years later', () => {
    const e = event({ date: '2000-03-15', recurrence: rule({ freq: 'monthly', interval: 2 }) });
    expect(dates(e, '2026-09-01', '2026-09-30')).toEqual(['2026-09-15']);
    expect(dates(e, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('yearly rules', () => {
  it('repeats on the same date each year', () => {
    const e = event({ date: '2026-09-04', recurrence: rule({ freq: 'yearly' }) });
    expect(dates(e, '2026-01-01', '2029-12-31')).toEqual([
      '2026-09-04',
      '2027-09-04',
      '2028-09-04',
      '2029-09-04',
    ]);
  });

  it('gives 29 February only to leap years', () => {
    const e = event({ date: '2024-02-29', recurrence: rule({ freq: 'yearly' }) });
    expect(dates(e, '2024-01-01', '2033-12-31')).toEqual([
      '2024-02-29',
      '2028-02-29',
      '2032-02-29',
    ]);
  });
});

describe('exceptions', () => {
  const series = event({
    date: '2026-09-01',
    start: 9 * 60,
    end: 10 * 60,
    recurrence: rule({ freq: 'daily' }),
  });

  it('drops a deleted occurrence and keeps the rest', () => {
    const e = { ...series, exceptions: [{ on: '2026-09-03', to: null }] };
    const found = expandEvent(e, '2026-09-01', '2026-09-04');
    expect(found.map((o) => o.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-04']);
  });

  it('moves one occurrence to another day and time', () => {
    const e = {
      ...series,
      exceptions: [{ on: '2026-09-03', to: { date: '2026-09-05', start: 780, end: 840 } }],
    };
    const found = expandEvent(e, '2026-09-01', '2026-09-06');
    const moved = found.find((o) => o.origin === '2026-09-03');
    expect(moved?.date).toBe('2026-09-05');
    expect(moved?.start).toBe(780);
    expect(moved?.moved).toBe(true);
    expect(found.filter((o) => o.date === '2026-09-03')).toHaveLength(0);
  });

  it('brings an occurrence moved in from outside the window', () => {
    const e = {
      ...series,
      recurrence: rule({ freq: 'weekly', weekdays: [2] }),
      date: '2026-09-01',
      exceptions: [{ on: '2026-09-15', to: { date: '2026-09-03', start: 600, end: 660 } }],
    };
    const found = expandEvent(e, '2026-09-03', '2026-09-03');
    expect(found).toHaveLength(1);
    expect(found[0]?.origin).toBe('2026-09-15');
    expect(found[0]?.moved).toBe(true);
  });

  it('ignores an override on a date the rule never produced', () => {
    const e = {
      ...series,
      recurrence: rule({ freq: 'weekly', weekdays: [2] }),
      exceptions: [{ on: '2026-09-04', to: { date: '2026-09-03', start: 600, end: 660 } }],
    };
    expect(expandEvent(e, '2026-09-03', '2026-09-03')).toHaveLength(0);
  });

  it('does not duplicate an occurrence moved inside the window', () => {
    const e = {
      ...series,
      exceptions: [{ on: '2026-09-02', to: { date: '2026-09-04', start: 600, end: 660 } }],
    };
    const found = expandEvent(e, '2026-09-01', '2026-09-06');
    expect(found.filter((o) => o.origin === '2026-09-02')).toHaveLength(1);
    expect(found.filter((o) => o.date === '2026-09-04')).toHaveLength(2);
  });
});

describe('occursOn', () => {
  it('answers for the rule, not the overrides', () => {
    const e = event({ date: '2026-09-01', recurrence: rule({ freq: 'weekly', weekdays: [2] }) });
    expect(occursOn(e, '2026-09-01')).toBe(true);
    expect(occursOn(e, '2026-09-08')).toBe(true);
    expect(occursOn(e, '2026-09-09')).toBe(false);
  });
});

describe('expandEvents', () => {
  it('gathers every event in the window', () => {
    const a = event({ id: 'a', date: '2026-09-04' });
    const b = event({ id: 'b', date: '2026-09-01', recurrence: rule({ freq: 'daily' }) });
    const found = expandEvents([a, b], '2026-09-03', '2026-09-05');
    expect(found).toHaveLength(4);
    expect(found.filter((o) => o.event.id === 'a')).toHaveLength(1);
    expect(found[1]?.id).toBe('b@2026-09-03');
  });
});

describe('describeRecurrence', () => {
  const words = {
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    formatDate: (d: DateKey) => d,
  };

  it('says what a rule does', () => {
    expect(describeRecurrence(null, '2026-09-04', words)).toBe('Does not repeat');
    expect(describeRecurrence(rule({ freq: 'daily' }), '2026-09-04', words)).toBe('Every day');
    expect(
      describeRecurrence(
        rule({ freq: 'weekly', interval: 2, weekdays: [4, 1] }),
        '2026-09-04',
        words,
      ),
    ).toBe('Every 2 weeks on Mon, Thu');
    expect(describeRecurrence(rule({ freq: 'monthly' }), '2026-01-31', words)).toBe(
      'Every month on day 31',
    );
    expect(describeRecurrence(rule({ freq: 'yearly', count: 10 }), '2026-09-04', words)).toBe(
      'Every year, 10 times',
    );
    expect(
      describeRecurrence(rule({ freq: 'daily', until: '2026-12-25' }), '2026-09-04', words),
    ).toBe('Every day, until 2026-12-25');
  });
});

describe('normalizeRecurrence', () => {
  it('keeps a rule it understands and rejects one it does not', () => {
    expect(normalizeRecurrence({ freq: 'weekly', interval: 2, weekdays: [5, 1, 1] }, 5)).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [1, 5],
      count: null,
      until: null,
    });
    expect(normalizeRecurrence({ freq: 'hourly' }, 0)).toBeNull();
    expect(normalizeRecurrence(null, 0)).toBeNull();
  });

  it('falls back to the start weekday and drops an impossible limit', () => {
    expect(normalizeRecurrence({ freq: 'weekly' }, 3)?.weekdays).toEqual([3]);
    expect(normalizeRecurrence({ freq: 'daily', interval: 0 }, 0)?.interval).toBe(1);
    expect(normalizeRecurrence({ freq: 'daily', until: 'soon' }, 0)?.until).toBeNull();
    // A count and an until cannot both hold; the count wins.
    expect(normalizeRecurrence({ freq: 'daily', count: 4, until: '2026-09-30' }, 0)).toMatchObject({
      count: 4,
      until: null,
    });
  });
});
