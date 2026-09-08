import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from './dates';
import {
  crossesMidnight,
  draftFromEvent,
  draftToInput,
  type EventDraft,
  emptyDraft,
  toggleWeekday,
} from './draft';
import { createEvent } from './events';

function draft(patch: Partial<EventDraft> = {}): EventDraft {
  return { ...emptyDraft({ date: '2026-09-04' }), ...patch };
}

function input(patch: Partial<EventDraft> = {}) {
  const result = draftToInput(draft(patch));
  if (!result.ok) throw new Error(`expected a valid draft: ${result.error.message}`);
  return result.input;
}

function error(patch: Partial<EventDraft>) {
  const result = draftToInput(draft(patch));
  if (result.ok) throw new Error('expected the draft to be rejected');
  return result.error;
}

describe('emptyDraft', () => {
  it('starts on the day and slot it was given', () => {
    const d = emptyDraft({ date: '2026-09-04', start: 600, end: 690 });
    expect(d).toMatchObject({ id: null, date: '2026-09-04', start: '10:00', end: '11:30' });
    // 4 September 2026 is a Friday, so a weekly rule would start there.
    expect(d.weekdays).toEqual([5]);
  });

  it('defaults to a one-hour event in the morning', () => {
    expect(emptyDraft({ date: '2026-09-04' })).toMatchObject({ start: '09:00', end: '10:00' });
  });
});

describe('draftFromEvent', () => {
  it('reads an event back into the fields that made it', () => {
    const event = createEvent(
      {
        date: '2026-09-04',
        title: 'Standup',
        start: 540,
        end: 570,
        color: 'accent',
        recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 3], count: 8, until: null },
      },
      'e1',
      0,
    );
    expect(draftFromEvent(event)).toMatchObject({
      id: 'e1',
      title: 'Standup',
      start: '09:00',
      end: '09:30',
      color: 'accent',
      repeat: 'weekly',
      interval: '2',
      weekdays: [1, 3],
      ends: 'after',
      count: '8',
    });
  });

  it('reads an until date as the date ending', () => {
    const event = createEvent(
      {
        date: '2026-09-04',
        recurrence: { freq: 'daily', interval: 1, weekdays: [5], count: null, until: '2026-10-01' },
      },
      'e1',
      0,
    );
    expect(draftFromEvent(event)).toMatchObject({ ends: 'on', until: '2026-10-01' });
  });

  it('survives a round trip through the editor', () => {
    const event = createEvent(
      { date: '2026-09-01', endDate: '2026-09-05', allDay: true, title: 'Leave' },
      'e1',
      0,
    );
    const result = draftToInput(draftFromEvent(event));
    expect(result.ok && result.input).toMatchObject({
      allDay: true,
      date: '2026-09-01',
      endDate: '2026-09-05',
      title: 'Leave',
    });
  });
});

describe('draftToInput', () => {
  it('builds a timed event', () => {
    expect(input({ title: 'Call', start: '10:00', end: '11:00' })).toMatchObject({
      allDay: false,
      date: '2026-09-04',
      start: 600,
      end: 660,
    });
  });

  it('reads an end before the start as running into the next day', () => {
    expect(input({ start: '23:00', end: '01:00' })).toMatchObject({
      start: 23 * 60,
      end: 25 * 60,
    });
    expect(crossesMidnight(draft({ start: '23:00', end: '01:00' }))).toBe(true);
    expect(crossesMidnight(draft({ start: '09:00', end: '10:00' }))).toBe(false);
  });

  it('refuses an end time that repeats the start', () => {
    expect(error({ start: '09:00', end: '09:00' }).field).toBe('time');
  });

  it('refuses a time it cannot read', () => {
    expect(error({ start: '', end: '10:00' }).field).toBe('time');
  });

  it('builds an all-day event over several days', () => {
    expect(input({ allDay: true, endDate: '2026-09-06' })).toMatchObject({
      allDay: true,
      date: '2026-09-04',
      endDate: '2026-09-06',
      start: 0,
      end: MINUTES_PER_DAY,
    });
  });

  it('refuses an all-day event that ends before it starts', () => {
    expect(error({ allDay: true, endDate: '2026-09-01' }).field).toBe('date');
    expect(error({ allDay: true, endDate: 'someday' }).field).toBe('date');
  });

  it('refuses a date it cannot read', () => {
    expect(error({ date: '2026-02-30' }).field).toBe('date');
  });
});

describe('recurrence in a draft', () => {
  it('leaves a one-off event without a rule', () => {
    expect(input().recurrence).toBeNull();
  });

  it('builds a weekly rule on the chosen days', () => {
    expect(input({ repeat: 'weekly', interval: '2', weekdays: [3, 1] }).recurrence).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [1, 3],
      count: null,
      until: null,
    });
  });

  it('takes a count or an end date, whichever the editor is showing', () => {
    expect(input({ repeat: 'daily', ends: 'after', count: '12' }).recurrence).toMatchObject({
      count: 12,
      until: null,
    });
    expect(input({ repeat: 'daily', ends: 'on', until: '2026-10-01' }).recurrence).toMatchObject({
      count: null,
      until: '2026-10-01',
    });
  });

  it('says what is wrong with a rule', () => {
    expect(error({ repeat: 'weekly', weekdays: [] }).message).toBe('Pick at least one weekday.');
    expect(error({ repeat: 'daily', interval: '0' }).field).toBe('repeat');
    expect(error({ repeat: 'daily', interval: 'often' }).field).toBe('repeat');
    expect(error({ repeat: 'daily', ends: 'after', count: '0' }).field).toBe('repeat');
    expect(error({ repeat: 'daily', ends: 'on', until: '2026-01-01' }).message).toBe(
      'The series ends before it starts.',
    );
  });
});

describe('toggleWeekday', () => {
  it('adds a day, removes it again, and keeps the order', () => {
    expect(toggleWeekday([1, 3], 5)).toEqual([1, 3, 5]);
    expect(toggleWeekday([1, 3], 1)).toEqual([3]);
    expect(toggleWeekday([5, 1], 3)).toEqual([1, 3, 5]);
  });
});
