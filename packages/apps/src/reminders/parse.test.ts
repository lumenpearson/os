import { describe, expect, it } from 'vitest';
import { type ParseNow, parseReminderInput } from './parse';

/** Friday 4 September 2026, 10:30 in the morning. */
const now: ParseNow = { date: '2026-09-04', minutes: 10 * 60 + 30 };

const parse = (text: string, at: ParseNow = now) => parseReminderInput(text, at);

describe('nothing to read', () => {
  it('leaves the title exactly as typed', () => {
    const result = parse('  Buy milk  ');
    expect(result).toEqual({
      title: '  Buy milk  ',
      due: null,
      dueTime: null,
      repeat: null,
      matched: [],
    });
  });

  it('is not fooled by a number that is not a date', () => {
    expect(parse('Buy 2 pints of milk').due).toBeNull();
    expect(parse('Read chapter 12').due).toBeNull();
    expect(parse('Order 3 chairs').due).toBeNull();
  });

  it('keeps a date the calendar does not have', () => {
    const result = parse('Ship on 31 Feb');
    expect(result.due).toBeNull();
    expect(result.title).toBe('Ship on 31 Feb');
  });
});

describe('days', () => {
  it('reads the words for the days around today', () => {
    expect(parse('Call the dentist tomorrow')).toMatchObject({
      title: 'Call the dentist',
      due: '2026-09-05',
      dueTime: null,
      matched: ['tomorrow'],
    });
    expect(parse('File the return today').due).toBe('2026-09-04');
    expect(parse('Log yesterday').due).toBe('2026-09-03');
    expect(parse('Ship the day after tomorrow').due).toBe('2026-09-06');
  });

  it('reads a weekday as the coming one, and today when today is it', () => {
    // 2026-09-04 is a Friday.
    expect(parse('Standup monday').due).toBe('2026-09-07');
    expect(parse('Gym friday').due).toBe('2026-09-04');
    expect(parse('Pay rent on thursday').due).toBe('2026-09-10');
  });

  it('steps "next" past today', () => {
    expect(parse('Retro next monday')).toMatchObject({
      title: 'Retro',
      due: '2026-09-07',
      matched: ['next monday'],
    });
    expect(parse('Gym next friday').due).toBe('2026-09-11');
  });

  it('counts forward from today', () => {
    expect(parse('Chase the invoice in 3 days').due).toBe('2026-09-07');
    expect(parse('Water the plants in a week').due).toBe('2026-09-11');
    expect(parse('Review in 2 months').due).toBe('2026-11-04');
    expect(parse('Renew in 1 year').due).toBe('2027-09-04');
    expect(parse('Post next week').due).toBe('2026-09-11');
    expect(parse('Invoice next month').due).toBe('2026-10-04');
  });

  it('reads a day and a month either way round', () => {
    expect(parse('Renew the passport on 5 Sep')).toMatchObject({
      title: 'Renew the passport',
      due: '2026-09-05',
      matched: ['on 5 Sep'],
    });
    expect(parse('Renew on Sep 5').due).toBe('2026-09-05');
    expect(parse('Renew on 5 September 2027').due).toBe('2027-09-05');
    expect(parse('Renew on September 5, 2027').due).toBe('2027-09-05');
    expect(parse('Renew 1st Oct').due).toBe('2026-10-01');
  });

  it('rolls a day and month that have gone by into next year', () => {
    expect(parse('Tax on 1 Jan').due).toBe('2027-01-01');
    expect(parse('Birthday on 3 Sep').due).toBe('2027-09-03');
    expect(parse('Birthday on 4 Sep').due).toBe('2026-09-04');
    // Written with a year, it stays where it was written.
    expect(parse('Filed on 1 Jan 2026').due).toBe('2026-01-01');
  });

  it('keeps a 29 February on a year that has one', () => {
    expect(parse('Leap day on 29 Feb').due).toBe('2028-02-29');
  });
});

describe('times', () => {
  it('reads a clock time in either notation', () => {
    expect(parse('Call today 9am')).toMatchObject({
      title: 'Call',
      due: '2026-09-04',
      dueTime: 540,
    });
    expect(parse('Call friday at 17:30')).toMatchObject({
      title: 'Call',
      due: '2026-09-04',
      dueTime: 17 * 60 + 30,
      matched: ['friday', 'at 17:30'],
    });
    expect(parse('Standup at 9').dueTime).toBe(540);
    expect(parse('Lunch at noon').dueTime).toBe(720);
    expect(parse('Backup at midnight').dueTime).toBe(0);
    expect(parse('Call at 12am').dueTime).toBe(0);
    expect(parse('Call at 12pm').dueTime).toBe(720);
    expect(parse('Call at 9:05 pm').dueTime).toBe(21 * 60 + 5);
  });

  it('gives a bare time today, or tomorrow once the hour has gone', () => {
    expect(parse('Call at 5pm').due).toBe('2026-09-04');
    expect(parse('Call at 9am').due).toBe('2026-09-05');
    expect(parse('Call at 10:30').due).toBe('2026-09-05');
  });

  it('will not read a bare number as a time', () => {
    expect(parse('Buy 9 eggs').dueTime).toBeNull();
    expect(parse('Room 12 booking').dueTime).toBeNull();
  });

  it('refuses a clock that does not exist', () => {
    expect(parse('Call at 25:00').dueTime).toBeNull();
    expect(parse('Call at 13pm').dueTime).toBeNull();
  });
});

describe('repeats', () => {
  it('reads a rule and gives it a day to repeat from', () => {
    expect(parse('Water the plants every week')).toMatchObject({
      title: 'Water the plants',
      repeat: { freq: 'weekly', interval: 1 },
      due: '2026-09-04',
    });
    expect(parse('Bins every 2 weeks').repeat).toEqual({ freq: 'weekly', interval: 2 });
    expect(parse('Bins every other week').repeat).toEqual({ freq: 'weekly', interval: 2 });
    expect(parse('Standup daily').repeat).toEqual({ freq: 'daily', interval: 1 });
    expect(parse('Rent monthly').repeat).toEqual({ freq: 'monthly', interval: 1 });
    expect(parse('Renew yearly').repeat).toEqual({ freq: 'yearly', interval: 1 });
    expect(parse('Backup every 3 days').repeat).toEqual({ freq: 'daily', interval: 3 });
  });

  it('reads a weekday rule as both the rule and the first day', () => {
    expect(parse('Bins out every tuesday')).toMatchObject({
      title: 'Bins out',
      repeat: { freq: 'weekly', interval: 1 },
      due: '2026-09-08',
    });
  });

  it('takes a date and a time alongside the rule', () => {
    expect(parse('Standup every week on monday at 9:15')).toMatchObject({
      title: 'Standup',
      repeat: { freq: 'weekly', interval: 1 },
      due: '2026-09-07',
      dueTime: 9 * 60 + 15,
    });
  });
});

describe('the title that comes back', () => {
  it('takes the phrase out and tidies what is left', () => {
    expect(parse('Call mum on friday at 17:30').title).toBe('Call mum');
    expect(parse('tomorrow buy milk').title).toBe('buy milk');
    expect(parse('Pay the bill,  tomorrow ').title).toBe('Pay the bill');
  });

  it('keeps the words when the line was nothing else', () => {
    expect(parse('tomorrow')).toMatchObject({ title: 'tomorrow', due: '2026-09-05' });
    expect(parse('  every week  ')).toMatchObject({ title: 'every week' });
  });

  it('reads the same line the same way whatever the hour', () => {
    const late: ParseNow = { date: '2026-09-04', minutes: 23 * 60 + 59 };
    expect(parse('Call tomorrow at 9am', late)).toMatchObject({
      due: '2026-09-05',
      dueTime: 540,
    });
  });

  it('lists what it understood, in the order it was written', () => {
    expect(parse('Standup every week tomorrow at 9am').matched).toEqual([
      'every week',
      'tomorrow',
      'at 9am',
    ]);
  });
});
