import { describe, expect, it } from 'vitest';
import {
  describeInstant,
  type EpochUnit,
  formatHuman,
  formatIso,
  formatOffset,
  formatSince,
  instantFromWallClock,
  isRealDate,
  isValidZone,
  listZones,
  MS_THRESHOLD,
  parseTimeInput,
  UTC,
  wallClockAt,
  zoneOffsetMinutes,
} from './epoch';

const PARIS = 'Europe/Paris';
const NEW_YORK = 'America/New_York';
const KOLKATA = 'Asia/Kolkata';

const at = (text: string, unit: EpochUnit = 'auto', zone = UTC): number => {
  const result = parseTimeInput(text, unit, zone);
  if (!result.ok) throw new Error(`expected a time: ${result.error}`);
  return result.ms;
};

const errorFor = (text: string, unit: EpochUnit = 'auto', zone = UTC): string => {
  const result = parseTimeInput(text, unit, zone);
  if (result.ok) throw new Error('expected a failure');
  return result.error;
};

describe('isValidZone and listZones', () => {
  it('knows a real zone from a made-up one', () => {
    expect(isValidZone(UTC)).toBe(true);
    expect(isValidZone(PARIS)).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
    expect(isValidZone('')).toBe(false);
  });

  it('always offers UTC', () => {
    expect(listZones()).toContain(UTC);
  });
});

describe('isRealDate', () => {
  it('knows the length of each month', () => {
    expect(isRealDate(2023, 2, 28)).toBe(true);
    expect(isRealDate(2023, 2, 29)).toBe(false);
    expect(isRealDate(2024, 2, 29)).toBe(true);
    expect(isRealDate(1900, 2, 29)).toBe(false);
    expect(isRealDate(2000, 2, 29)).toBe(true);
    expect(isRealDate(2024, 4, 31)).toBe(false);
    expect(isRealDate(2024, 13, 1)).toBe(false);
    expect(isRealDate(2024, 0, 1)).toBe(false);
  });
});

describe('wallClockAt and zoneOffsetMinutes', () => {
  it('reads the wall clock in a zone', () => {
    expect(wallClockAt(0, KOLKATA)).toEqual({
      year: 1970,
      month: 1,
      day: 1,
      hour: 5,
      minute: 30,
      second: 0,
    });
  });

  it('reports offsets east and west, and a half-hour one', () => {
    expect(zoneOffsetMinutes(0, UTC)).toBe(0);
    expect(zoneOffsetMinutes(0, KOLKATA)).toBe(330);
    expect(zoneOffsetMinutes(Date.UTC(2024, 0, 15), NEW_YORK)).toBe(-300);
  });

  it('follows a zone across a daylight-saving change', () => {
    expect(zoneOffsetMinutes(Date.UTC(2024, 0, 15), PARIS)).toBe(60);
    expect(zoneOffsetMinutes(Date.UTC(2024, 6, 15), PARIS)).toBe(120);
  });

  it('is not thrown off by a sub-second instant', () => {
    expect(zoneOffsetMinutes(Date.UTC(2024, 0, 15) + 750, PARIS)).toBe(60);
    expect(zoneOffsetMinutes(-1, UTC)).toBe(0);
  });
});

describe('formatOffset', () => {
  it('writes Z only for UTC itself', () => {
    expect(formatOffset(0, UTC)).toBe('Z');
    expect(formatOffset(0, 'Europe/London')).toBe('+00:00');
  });

  it('writes hours and minutes with a sign', () => {
    expect(formatOffset(-300, NEW_YORK)).toBe('-05:00');
    expect(formatOffset(330, KOLKATA)).toBe('+05:30');
    expect(formatOffset(-570, 'Pacific/Marquesas')).toBe('-09:30');
  });
});

describe('formatIso', () => {
  it('writes UTC with a Z and no milliseconds when there are none', () => {
    expect(formatIso(0, UTC)).toBe('1970-01-01T00:00:00Z');
    expect(formatIso(1_700_000_000_000, UTC)).toBe('2023-11-14T22:13:20Z');
  });

  it('writes milliseconds when the instant has them', () => {
    expect(formatIso(1_700_000_000_123, UTC)).toBe('2023-11-14T22:13:20.123Z');
    expect(formatIso(1_700_000_000_020, UTC)).toBe('2023-11-14T22:13:20.020Z');
  });

  it('writes the zone offset for a named zone', () => {
    expect(formatIso(0, PARIS)).toBe('1970-01-01T01:00:00+01:00');
    expect(formatIso(0, KOLKATA)).toBe('1970-01-01T05:30:00+05:30');
    expect(formatIso(1_700_000_000_000, NEW_YORK)).toBe('2023-11-14T17:13:20-05:00');
  });

  it('handles an instant before the epoch', () => {
    expect(formatIso(-1, UTC)).toBe('1969-12-31T23:59:59.999Z');
  });
});

describe('formatHuman', () => {
  it('names the day, the date and the zone', () => {
    expect(formatHuman(0, UTC)).toContain('Thursday');
    expect(formatHuman(0, UTC)).toContain('1970');
    expect(formatHuman(1_700_000_000_000, NEW_YORK)).toContain('EST');
  });
});

describe('formatSince', () => {
  const now = 1_700_000_000_000;

  it('uses the largest unit that reads as a whole number', () => {
    expect(formatSince(now - 2 * 3600_000, now)).toBe('2 hours ago');
    expect(formatSince(now + 3 * 86_400_000, now)).toBe('in 3 days');
    expect(formatSince(now - 45_000, now)).toBe('45 seconds ago');
  });

  it('says now for the same instant', () => {
    expect(formatSince(now, now)).toBe('now');
  });
});

describe('instantFromWallClock', () => {
  it('reads a wall clock in its zone', () => {
    const ms = instantFromWallClock(
      { year: 2024, month: 1, day: 15, hour: 12, minute: 0, second: 0 },
      PARIS,
    );
    expect(formatIso(ms, UTC)).toBe('2024-01-15T11:00:00Z');
  });

  it('uses the summer offset for a summer wall clock', () => {
    const ms = instantFromWallClock(
      { year: 2024, month: 7, day: 15, hour: 12, minute: 0, second: 0 },
      PARIS,
    );
    expect(formatIso(ms, UTC)).toBe('2024-07-15T10:00:00Z');
  });

  it('lands on the right side of a spring-forward change', () => {
    // New York moves 02:00 to 03:00 on 10 March 2024; 03:00 local is EDT.
    const ms = instantFromWallClock(
      { year: 2024, month: 3, day: 10, hour: 3, minute: 0, second: 0 },
      NEW_YORK,
    );
    expect(formatIso(ms, UTC)).toBe('2024-03-10T07:00:00Z');
  });
});

describe('parseTimeInput', () => {
  it('detects seconds and milliseconds around the threshold', () => {
    expect(at(String(MS_THRESHOLD - 1))).toBe((MS_THRESHOLD - 1) * 1000);
    expect(at(String(MS_THRESHOLD))).toBe(MS_THRESHOLD);
    expect(parseTimeInput('1700000000', 'auto', UTC)).toEqual({
      ok: true,
      ms: 1_700_000_000_000,
      source: 'seconds',
    });
    expect(parseTimeInput('1700000000000', 'auto', UTC)).toEqual({
      ok: true,
      ms: 1_700_000_000_000,
      source: 'milliseconds',
    });
  });

  it('obeys the unit when it is not left to detection', () => {
    expect(at('1700000000', 'milliseconds')).toBe(1_700_000_000);
    expect(at('1700000000000', 'seconds')).toBe(1_700_000_000_000_000);
  });

  it('reads fractional seconds and a negative epoch', () => {
    expect(at('1700000000.5', 'seconds')).toBe(1_700_000_000_500);
    expect(at('-1', 'seconds')).toBe(-1000);
  });

  it('reads an ISO instant with an explicit offset', () => {
    expect(at('2024-03-01T12:30:00Z')).toBe(Date.UTC(2024, 2, 1, 12, 30));
    expect(at('2024-03-01T12:30:00+05:30')).toBe(Date.UTC(2024, 2, 1, 7, 0));
    expect(at('2024-03-01T12:30:00-0500')).toBe(Date.UTC(2024, 2, 1, 17, 30));
  });

  it('reads an ISO wall clock in the chosen zone', () => {
    expect(at('2024-03-01T12:30:00', 'auto', PARIS)).toBe(Date.UTC(2024, 2, 1, 11, 30));
    expect(at('2024-07-01T12:30:00', 'auto', PARIS)).toBe(Date.UTC(2024, 6, 1, 10, 30));
  });

  it('accepts a date alone, a space instead of a T, and milliseconds', () => {
    expect(at('2024-03-01')).toBe(Date.UTC(2024, 2, 1));
    expect(at('2024-03-01 12:30')).toBe(Date.UTC(2024, 2, 1, 12, 30));
    expect(at('2024-03-01T12:30:45.5Z')).toBe(Date.UTC(2024, 2, 1, 12, 30, 45, 500));
  });

  it('round-trips its own ISO output in every zone it prints', () => {
    for (const zone of [UTC, PARIS, NEW_YORK, KOLKATA]) {
      for (const ms of [0, 1_700_000_000_000, Date.UTC(2024, 6, 4, 3, 2, 1)]) {
        expect(at(formatIso(ms, zone), 'auto', zone)).toBe(ms);
      }
    }
  });

  it('names what it wanted when the text is not a time', () => {
    expect(errorFor('hello')).toContain('Not a time');
    expect(errorFor('2024-03-01T')).toContain('Not a time');
  });

  it('says so when there is nothing to convert', () => {
    expect(errorFor('   ')).toBe('Nothing to convert');
  });

  it('refuses a date that does not exist', () => {
    expect(errorFor('2023-02-29')).toBe('2023-02-29 is not a date');
    expect(errorFor('2024-13-01')).toBe('2024-13-01 is not a date');
  });

  it('refuses a clock time that does not exist', () => {
    expect(errorFor('2024-03-01T25:00')).toBe('That clock time does not exist');
    expect(errorFor('2024-03-01T12:61')).toBe('That clock time does not exist');
  });

  it('refuses an instant further out than a date can reach', () => {
    expect(errorFor('99999999999999999')).toContain('further from 1970');
  });

  it('refuses a zone it does not know', () => {
    expect(errorFor('0', 'seconds', 'Mars/Olympus')).toBe(
      "'Mars/Olympus' is not a time zone this knows",
    );
  });
});

describe('describeInstant', () => {
  it('gives every form of one instant', () => {
    const view = describeInstant(1_700_000_000_000, NEW_YORK);
    expect(view).toMatchObject({
      epochSeconds: '1700000000',
      epochMilliseconds: '1700000000000',
      iso: '2023-11-14T17:13:20-05:00',
      isoUtc: '2023-11-14T22:13:20Z',
      offset: '-05:00',
    });
    expect(view.human).toContain('2023');
  });

  it('floors the seconds of an instant before the epoch', () => {
    expect(describeInstant(-1, UTC).epochSeconds).toBe('-1');
  });
});
