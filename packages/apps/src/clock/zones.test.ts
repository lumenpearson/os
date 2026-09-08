import { describe, expect, it } from 'vitest';
import {
  clockParts,
  dayDifference,
  dayLabel,
  FALLBACK_ZONES,
  formatOffset,
  formatOffsetDifference,
  formatZoneTime,
  handAngles,
  isValidTimeZone,
  listTimeZones,
  offsetDifference,
  offsetMinutes,
  searchZones,
  zoneLabel,
  zoneRegion,
} from './zones';

/** Northern winter, so the southern-hemisphere zones are on summer time. */
const JANUARY = Date.UTC(2026, 0, 15, 12, 0, 0);
/** Northern summer. */
const JULY = Date.UTC(2026, 6, 15, 12, 0, 0);

describe('the offset of a zone', () => {
  it('is zero for UTC', () => {
    expect(offsetMinutes('UTC', JANUARY)).toBe(0);
  });

  it('follows daylight saving', () => {
    expect(offsetMinutes('America/New_York', JANUARY)).toBe(-300);
    expect(offsetMinutes('America/New_York', JULY)).toBe(-240);
    expect(offsetMinutes('Europe/London', JANUARY)).toBe(0);
    expect(offsetMinutes('Europe/London', JULY)).toBe(60);
  });

  // The zones an hour-based implementation gets wrong.
  it('is exact for the half-hour and quarter-hour zones', () => {
    expect(offsetMinutes('Asia/Kolkata', JANUARY)).toBe(330);
    expect(offsetMinutes('Asia/Kathmandu', JANUARY)).toBe(345);
    expect(offsetMinutes('Australia/Eucla', JANUARY)).toBe(525);
    expect(offsetMinutes('Pacific/Marquesas', JANUARY)).toBe(-570);
  });

  it('keeps the 45 minutes across a daylight-saving change', () => {
    expect(offsetMinutes('Pacific/Chatham', JANUARY)).toBe(825); // +13:45
    expect(offsetMinutes('Pacific/Chatham', JULY)).toBe(765); // +12:45
  });

  it('reads as a signed clock offset', () => {
    expect(formatOffset(330)).toBe('+05:30');
    expect(formatOffset(525)).toBe('+08:45');
    expect(formatOffset(-300)).toBe('−05:00');
    expect(formatOffset(0)).toBe('+00:00');
    expect(formatOffset(-570)).toBe('−09:30');
  });
});

describe('the difference from the local zone', () => {
  it('is the gap between two offsets, not a count of hours', () => {
    expect(offsetDifference('Asia/Kolkata', 'UTC', JANUARY)).toBe(330);
    expect(offsetDifference('Asia/Kolkata', 'Europe/London', JULY)).toBe(270);
    expect(offsetDifference('Australia/Eucla', 'Asia/Kolkata', JANUARY)).toBe(195);
    expect(offsetDifference('UTC', 'UTC', JANUARY)).toBe(0);
  });

  it('says it in minutes when the minutes matter', () => {
    expect(formatOffsetDifference(0)).toBe('Same time');
    expect(formatOffsetDifference(180)).toBe('3 h ahead');
    expect(formatOffsetDifference(-300)).toBe('5 h behind');
    expect(formatOffsetDifference(330)).toBe('5 h 30 min ahead');
    expect(formatOffsetDifference(525)).toBe('8 h 45 min ahead');
    expect(formatOffsetDifference(-570)).toBe('9 h 30 min behind');
    expect(formatOffsetDifference(45)).toBe('45 min ahead');
    expect(formatOffsetDifference(-45)).toBe('45 min behind');
  });

  it('phrases the real zones the same way', () => {
    const phrase = (zone: string, at: number) =>
      formatOffsetDifference(offsetDifference(zone, 'UTC', at));
    expect(phrase('Asia/Kolkata', JANUARY)).toBe('5 h 30 min ahead');
    expect(phrase('Australia/Eucla', JANUARY)).toBe('8 h 45 min ahead');
    expect(phrase('Pacific/Chatham', JULY)).toBe('12 h 45 min ahead');
    expect(phrase('America/Los_Angeles', JULY)).toBe('7 h behind');
  });
});

describe('which day it is over there', () => {
  const evening = Date.UTC(2026, 2, 10, 22, 30, 0); // 22:30 UTC

  it('is tomorrow east of the date line-ish', () => {
    expect(dayDifference('Asia/Tokyo', 'UTC', evening)).toBe(1);
    expect(dayDifference('Pacific/Auckland', 'UTC', evening)).toBe(1);
  });

  it('is the same day where the offset does not cross midnight', () => {
    expect(dayDifference('Europe/Paris', 'UTC', evening)).toBe(0);
    expect(dayDifference('America/New_York', 'UTC', evening)).toBe(0);
  });

  it('is yesterday when the local zone has already turned over', () => {
    const justAfterMidnight = Date.UTC(2026, 2, 11, 0, 30, 0);
    expect(dayDifference('America/New_York', 'UTC', justAfterMidnight)).toBe(-1);
  });

  it('crosses on the 45-minute zones at the right minute, not the right hour', () => {
    // 23:30 UTC: Chatham (+13:45) has been on the 11th for hours; Eucla (+08:45)
    // turns over at 15:15 UTC and Kolkata (+05:30) at 18:30 UTC.
    const late = Date.UTC(2026, 2, 10, 23, 30, 0);
    expect(dayDifference('Pacific/Chatham', 'UTC', late)).toBe(1);
    expect(dayDifference('Australia/Eucla', 'UTC', late)).toBe(1);
    expect(dayDifference('Asia/Kolkata', 'UTC', late)).toBe(1);
    // Fifteen minutes before Eucla's midnight it is still the same day there.
    const before = Date.UTC(2026, 2, 10, 15, 0, 0);
    expect(dayDifference('Australia/Eucla', 'UTC', before)).toBe(0);
    expect(dayDifference('Australia/Eucla', 'UTC', before + 15 * 60_000)).toBe(1);
  });

  it('names the difference', () => {
    expect(dayLabel(0)).toBe('Today');
    expect(dayLabel(1)).toBe('Tomorrow');
    expect(dayLabel(-1)).toBe('Yesterday');
    expect(dayLabel(2)).toBe('2 days ahead');
    expect(dayLabel(-2)).toBe('2 days behind');
  });
});

describe('naming a zone', () => {
  it('shows the city and keeps the region behind it', () => {
    expect(zoneLabel('Asia/Kolkata')).toBe('Kolkata');
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneLabel('UTC')).toBe('UTC');
    expect(zoneRegion('Asia/Kolkata')).toBe('Asia');
    expect(zoneRegion('America/Argentina/Buenos_Aires')).toBe('America / Argentina');
    expect(zoneRegion('UTC')).toBe('');
  });

  it('accepts the zones it offers and rejects made-up ones', () => {
    expect(isValidTimeZone('Australia/Eucla')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('offers a list of zones the runtime accepts', () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(20);
    for (const zone of FALLBACK_ZONES) expect(isValidTimeZone(zone)).toBe(true);
  });
});

describe('searching for a zone', () => {
  const zones = [
    'America/New_York',
    'America/North_Dakota/Center',
    'Asia/Kolkata',
    'Australia/Eucla',
    'Europe/London',
    'Pacific/Chatham',
    'America/Sao_Paulo',
  ];

  it('matches the city first', () => {
    expect(searchZones(zones, 'kolkata')).toEqual(['Asia/Kolkata']);
    expect(searchZones(zones, 'chatham')).toEqual(['Pacific/Chatham']);
  });

  it('reads the underscore as a space', () => {
    expect(searchZones(zones, 'new york')).toEqual(['America/New_York']);
  });

  it('puts a city that starts with the query above one that merely contains it', () => {
    expect(searchZones(zones, 'york')).toEqual(['America/New_York']);
    expect(searchZones(['Asia/Kolkata', 'Asia/Kathmandu'], 'ka')).toEqual([
      'Asia/Kathmandu',
      'Asia/Kolkata',
    ]);
  });

  it('falls back to the region', () => {
    expect(searchZones(zones, 'australia')).toEqual(['Australia/Eucla']);
    expect(searchZones(zones, 'america')).toContain('America/Sao_Paulo');
  });

  it('ignores case and accents', () => {
    expect(searchZones(['America/Sao_Paulo'], 'São')).toEqual(['America/Sao_Paulo']);
  });

  it('returns the whole list, capped, for an empty query', () => {
    expect(searchZones(zones, '   ', 3)).toEqual(zones.slice(0, 3));
  });

  it('finds nothing for nonsense', () => {
    expect(searchZones(zones, 'zzzz')).toEqual([]);
  });
});

describe('the clock reading', () => {
  const at = Date.UTC(2026, 0, 15, 14, 35, 9);

  it('splits the day period off the digits on a 12-hour clock', () => {
    expect(clockParts('UTC', at, { locale: 'en-US', hour12: true, seconds: true })).toEqual({
      time: '2:35:09',
      suffix: 'PM',
    });
  });

  it('has no day period on a 24-hour clock', () => {
    expect(clockParts('UTC', at, { locale: 'en-GB', hour12: false, seconds: true })).toEqual({
      time: '14:35:09',
      suffix: '',
    });
  });

  it('drops the seconds when they are not asked for', () => {
    expect(clockParts('Asia/Kolkata', at, { locale: 'en-GB', hour12: false }).time).toBe('20:05');
  });

  it('reads midnight as 00, not 24', () => {
    const midnight = Date.UTC(2026, 0, 15, 0, 0, 0);
    expect(clockParts('UTC', midnight, { locale: 'en-GB', hour12: false }).time).toBe('00:00');
  });

  it('joins the parts back together for a single line', () => {
    expect(formatZoneTime('UTC', at, { locale: 'en-US', hour12: true })).toBe('2:35 PM');
    expect(formatZoneTime('UTC', at, { locale: 'en-GB', hour12: false })).toBe('14:35');
  });
});

describe('the analogue hands', () => {
  it('point straight up at midnight', () => {
    const angles = handAngles('UTC', Date.UTC(2026, 0, 15, 0, 0, 0));
    expect(angles).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('put the hour hand between the hours as the minutes pass', () => {
    const angles = handAngles('UTC', Date.UTC(2026, 0, 15, 3, 30, 0));
    expect(angles.hours).toBeCloseTo(105, 10); // 3.5 × 30°
    expect(angles.minutes).toBe(180);
  });

  it('reads the same clock the digits read, in the zone asked for', () => {
    const at = Date.UTC(2026, 0, 15, 14, 35, 9);
    expect(handAngles('Asia/Kolkata', at).minutes).toBeCloseTo(5 * 6 + 9 / 10, 10);
  });

  it('sweeps the second hand from the sub-second part of the instant', () => {
    const at = Date.UTC(2026, 0, 15, 12, 0, 0) + 500;
    expect(handAngles('UTC', at).seconds).toBeCloseTo(3, 10);
  });

  it('wraps twice round the face in a day', () => {
    const noon = handAngles('UTC', Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(noon.hours).toBe(0);
  });
});
