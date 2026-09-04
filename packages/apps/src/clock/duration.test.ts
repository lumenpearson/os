import { describe, expect, it } from 'vitest';
import {
  clampDuration,
  describeDuration,
  formatCountdown,
  formatDelta,
  formatStopwatch,
  fromFields,
  HOUR,
  MAX_DURATION,
  MINUTE,
  parseField,
  roundTo,
  SECOND,
  stepField,
  toFields,
} from './duration';

describe('the stopwatch reading', () => {
  it('starts at two minute digits and grows an hour only when there is one', () => {
    expect(formatStopwatch(0)).toBe('00:00.00');
    expect(formatStopwatch(9 * SECOND + 420)).toBe('00:09.42');
    expect(formatStopwatch(59 * MINUTE + 59 * SECOND + 990)).toBe('59:59.99');
    expect(formatStopwatch(HOUR)).toBe('1:00:00.00');
    expect(formatStopwatch(25 * HOUR + 3 * MINUTE)).toBe('25:03:00.00');
  });

  it('truncates to the 10 ms step rather than rounding up to a time not reached', () => {
    expect(formatStopwatch(1239)).toBe('00:01.23');
    expect(formatStopwatch(999)).toBe('00:00.99');
    expect(roundTo(1239, 10)).toBe(1230);
  });

  it('reads a negative or broken value as zero', () => {
    expect(formatStopwatch(-500)).toBe('00:00.00');
    expect(formatStopwatch(Number.NaN)).toBe('00:00.00');
  });

  it('prefixes a lap delta with a sign so it is not read as a total', () => {
    expect(formatDelta(12_340)).toBe('+00:12.34');
  });
});

describe('the countdown reading', () => {
  it('rounds up, so a running second still shows and zero means over', () => {
    expect(formatCountdown(5 * MINUTE)).toBe('05:00');
    expect(formatCountdown(1)).toBe('00:01');
    expect(formatCountdown(999)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-4000)).toBe('00:00');
  });

  it('shows hours only above the hour', () => {
    expect(formatCountdown(90 * MINUTE)).toBe('1:30:00');
    expect(formatCountdown(59 * MINUTE + 59 * SECOND)).toBe('59:59');
  });
});

describe('the typed fields', () => {
  it('round-trips a duration', () => {
    expect(toFields(90 * MINUTE + 5 * SECOND)).toEqual({ hours: 1, minutes: 30, seconds: 5 });
    expect(fromFields({ hours: 1, minutes: 30, seconds: 5 })).toBe(90 * MINUTE + 5 * SECOND);
  });

  it('rounds a part-second up, so the fields agree with the countdown reading', () => {
    expect(formatCountdown(3 * SECOND + 750)).toBe('00:04');
    expect(toFields(3 * SECOND + 750)).toEqual({ hours: 0, minutes: 0, seconds: 4 });
  });

  it('takes digits, an empty field as zero, and nothing else', () => {
    expect(parseField('7', 'minutes')).toBe(7);
    expect(parseField('07', 'minutes')).toBe(7);
    expect(parseField('  9 ', 'seconds')).toBe(9);
    expect(parseField('', 'hours')).toBe(0);
    expect(parseField('-3', 'minutes')).toBeNull();
    expect(parseField('1.5', 'minutes')).toBeNull();
    expect(parseField('two', 'minutes')).toBeNull();
  });

  it('clamps an over-large entry to the field rather than refusing it', () => {
    expect(parseField('90', 'minutes')).toBe(59);
    expect(parseField('120', 'seconds')).toBe(59);
    expect(parseField('400', 'hours')).toBe(99);
  });

  it('wraps at both ends when stepped', () => {
    expect(stepField(58, 'minutes', 1)).toBe(59);
    expect(stepField(59, 'minutes', 1)).toBe(0);
    expect(stepField(0, 'minutes', -1)).toBe(59);
    expect(stepField(0, 'hours', -1)).toBe(99);
  });
});

describe('clamping', () => {
  it('keeps a duration inside the range the fields can show', () => {
    expect(clampDuration(-1)).toBe(0);
    expect(clampDuration(MAX_DURATION + HOUR)).toBe(MAX_DURATION);
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDuration(1234.6)).toBe(1235);
  });

  it('caps at 99:59:59', () => {
    expect(toFields(MAX_DURATION)).toEqual({ hours: 99, minutes: 59, seconds: 59 });
    expect(fromFields({ hours: 200, minutes: 0, seconds: 0 })).toBe(MAX_DURATION);
  });
});

describe('spoken durations', () => {
  it('names only the units that are there', () => {
    expect(describeDuration(45 * SECOND)).toBe('45 s');
    expect(describeDuration(10 * MINUTE)).toBe('10 min');
    expect(describeDuration(HOUR)).toBe('1 h');
    expect(describeDuration(90 * MINUTE)).toBe('1 h 30 min');
    expect(describeDuration(HOUR + 90 * SECOND)).toBe('1 h 1 min 30 s');
    expect(describeDuration(0)).toBe('0 s');
  });
});
