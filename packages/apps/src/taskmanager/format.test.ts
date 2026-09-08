import { describe, expect, it } from 'vitest';
import {
  EM_DASH,
  formatCount,
  formatFrameRate,
  formatInterval,
  formatPercent,
  formatSpan,
  formatUptime,
} from './format';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatUptime', () => {
  it('counts minutes and seconds in the first hour', () => {
    expect(formatUptime(0)).toBe('0:00');
    expect(formatUptime(999)).toBe('0:00');
    expect(formatUptime(9 * SECOND)).toBe('0:09');
    expect(formatUptime(61 * SECOND)).toBe('1:01');
    expect(formatUptime(59 * MINUTE + 59 * SECOND)).toBe('59:59');
  });

  it('adds hours past the hour', () => {
    expect(formatUptime(HOUR)).toBe('1:00:00');
    expect(formatUptime(2 * HOUR + 3 * MINUTE + 4 * SECOND)).toBe('2:03:04');
  });

  it('adds days past the day, and restarts the hours', () => {
    expect(formatUptime(DAY)).toBe('1d 0:00:00');
    expect(formatUptime(DAY + HOUR + MINUTE + SECOND)).toBe('1d 1:01:01');
    expect(formatUptime(3 * DAY + 23 * HOUR)).toBe('3d 23:00:00');
  });

  it('has no reading for a duration that is not one', () => {
    expect(formatUptime(-1)).toBe(EM_DASH);
    expect(formatUptime(Number.NaN)).toBe(EM_DASH);
    expect(formatUptime(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
  });
});

describe('formatPercent', () => {
  it('rounds to whole percent by default', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(42.4)).toBe('42%');
    expect(formatPercent(100)).toBe('100%');
  });

  it('keeps the digits it is asked for', () => {
    expect(formatPercent(42.44, 1)).toBe('42.4%');
  });

  it('has no reading for a number that is not one', () => {
    expect(formatPercent(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatFrameRate', () => {
  it('keeps one decimal, because it is a measured ratio', () => {
    expect(formatFrameRate(60)).toBe('60.0');
    expect(formatFrameRate(59.94)).toBe('59.9');
    expect(formatFrameRate(0)).toBe('0.0');
  });

  it('has no reading for a rate that is not one', () => {
    expect(formatFrameRate(-1)).toBe(EM_DASH);
    expect(formatFrameRate(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatCount', () => {
  it('prints whole things', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(12)).toBe('12');
    expect(formatCount(12.6)).toBe('13');
  });

  it('has no reading for a count that is not one', () => {
    expect(formatCount(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatInterval', () => {
  it('prints seconds, with a decimal only when there is one', () => {
    expect(formatInterval(1000)).toBe('1 s');
    expect(formatInterval(5000)).toBe('5 s');
    expect(formatInterval(500)).toBe('0.5 s');
  });

  it('has no reading for an interval that is not one', () => {
    expect(formatInterval(0)).toBe(EM_DASH);
    expect(formatInterval(-1000)).toBe(EM_DASH);
    expect(formatInterval(Number.NaN)).toBe(EM_DASH);
  });
});

describe('formatSpan', () => {
  it('counts seconds up to two minutes', () => {
    expect(formatSpan(60, 1000)).toBe('last 60 s');
    expect(formatSpan(119, 1000)).toBe('last 119 s');
  });

  it('switches to minutes past that', () => {
    expect(formatSpan(60, 2000)).toBe('last 2 min');
    expect(formatSpan(60, 5000)).toBe('last 5 min');
  });

  it('has no reading for a span that is not one', () => {
    expect(formatSpan(0, 1000)).toBe(EM_DASH);
    expect(formatSpan(60, 0)).toBe(EM_DASH);
  });
});
