import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampTime,
  formatPercent,
  formatRate,
  formatRemaining,
  formatTimecode,
  isKnownDuration,
  parseTimecode,
  progress,
  remainingTime,
  seekBy,
  timeAtFraction,
  UNKNOWN_TIME,
} from './time';

describe('formatTimecode', () => {
  it('writes m:ss under an hour', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(9)).toBe('0:09');
    expect(formatTimecode(61)).toBe('1:01');
    expect(formatTimecode(599)).toBe('9:59');
    expect(formatTimecode(3599)).toBe('59:59');
  });

  it('writes h:mm:ss from an hour', () => {
    expect(formatTimecode(3600)).toBe('1:00:00');
    expect(formatTimecode(3661)).toBe('1:01:01');
    expect(formatTimecode(36000)).toBe('10:00:00');
  });

  it('floors fractional seconds and floors negatives at zero', () => {
    expect(formatTimecode(1.99)).toBe('0:01');
    expect(formatTimecode(-4)).toBe('0:00');
  });

  it('reports unknown times instead of guessing', () => {
    expect(formatTimecode(Number.NaN)).toBe(UNKNOWN_TIME);
    expect(formatTimecode(Number.POSITIVE_INFINITY)).toBe(UNKNOWN_TIME);
  });
});

describe('remaining time', () => {
  it('counts down and never goes below zero', () => {
    expect(remainingTime(10, 100)).toBe(90);
    expect(remainingTime(120, 100)).toBe(0);
    expect(remainingTime(Number.NaN, 100)).toBe(100);
  });

  it('is null when the duration is unknown', () => {
    expect(remainingTime(10, Number.NaN)).toBeNull();
    expect(remainingTime(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(remainingTime(10, 0)).toBeNull();
  });

  it('formats with a leading minus', () => {
    expect(formatRemaining(30, 90)).toBe('-1:00');
    expect(formatRemaining(0, Number.NaN)).toBe(UNKNOWN_TIME);
  });
});

describe('parseTimecode', () => {
  it('reads seconds, m:ss and h:mm:ss', () => {
    expect(parseTimecode('42')).toBe(42);
    expect(parseTimecode('1:23')).toBe(83);
    expect(parseTimecode('1:02:03')).toBe(3723);
    expect(parseTimecode(' 2:30 ')).toBe(150);
    expect(parseTimecode('0:01.5')).toBe(1.5);
    expect(parseTimecode('-0:30')).toBe(-30);
  });

  it('rejects what it cannot read', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:2:3:4')).toBeNull();
    expect(parseTimecode('1::2')).toBeNull();
  });
});

describe('clamping and seeking', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('clamps a time to the media and refuses to seek an unknown duration', () => {
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(500, 100)).toBe(100);
    expect(clampTime(-5, 100)).toBe(0);
    expect(clampTime(50, Number.NaN)).toBe(0);
  });

  it('skips forward and back within the media', () => {
    expect(seekBy(10, 5, 100)).toBe(15);
    expect(seekBy(10, -30, 100)).toBe(0);
    expect(seekBy(98, 30, 100)).toBe(100);
    expect(seekBy(Number.NaN, 5, 100)).toBe(5);
  });

  it('maps the number keys to a time', () => {
    expect(timeAtFraction(0, 200)).toBe(0);
    expect(timeAtFraction(0.5, 200)).toBe(100);
    expect(timeAtFraction(0.9, 200)).toBe(180);
    expect(timeAtFraction(2, 200)).toBe(200);
    expect(timeAtFraction(0.5, Number.NaN)).toBe(0);
  });

  it('reports progress as a fraction', () => {
    expect(progress(25, 100)).toBe(0.25);
    expect(progress(200, 100)).toBe(1);
    expect(progress(10, Number.NaN)).toBe(0);
  });

  it('knows which durations are usable', () => {
    expect(isKnownDuration(12)).toBe(true);
    expect(isKnownDuration(0)).toBe(false);
    expect(isKnownDuration(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('readouts', () => {
  it('formats playback rates without trailing zeros', () => {
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(1.5)).toBe('1.5×');
    expect(formatRate(0.75)).toBe('0.75×');
    expect(formatRate(Number.NaN)).toBe('1×');
  });

  it('formats volume as a whole percentage', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.725)).toBe('73%');
    expect(formatPercent(4)).toBe('100%');
  });
});
