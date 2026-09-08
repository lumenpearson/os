import { describe, expect, it } from 'vitest';
import { MAX_DURATION, MINUTE } from './duration';
import {
  addPreset,
  addZone,
  type ClockData,
  DEFAULT_DATA,
  DEFAULT_PRESETS,
  moveZone,
  normalizeData,
  PRESET_LIMIT,
  removePreset,
  removeZone,
  ZONE_LIMIT,
} from './storage';

describe('reading the file', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('clock')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
  });

  it('keeps a valid document as it is', () => {
    const data: ClockData = {
      tab: 'timer',
      face: 'analogue',
      zones: ['Asia/Kolkata', 'Pacific/Chatham'],
      presets: [MINUTE, 5 * MINUTE],
      timer: 90 * MINUTE,
    };
    expect(normalizeData(data)).toEqual(data);
  });

  it('drops a tab or face it does not have', () => {
    expect(normalizeData({ tab: 'alarms', face: 'sundial' })).toMatchObject({
      tab: 'clock',
      face: 'digital',
    });
  });

  it('drops zones the runtime cannot resolve, so nothing throws at render', () => {
    expect(
      normalizeData({ zones: ['Asia/Kolkata', 'Mars/Olympus_Mons', 7, null, 'Australia/Eucla'] })
        .zones,
    ).toEqual(['Asia/Kolkata', 'Australia/Eucla']);
  });

  it('drops a repeated zone and caps the list', () => {
    expect(normalizeData({ zones: ['UTC', 'UTC'] }).zones).toEqual(['UTC']);
    const many = Array.from({ length: ZONE_LIMIT + 10 }, () => 'UTC');
    expect(normalizeData({ zones: many }).zones).toHaveLength(1);
  });

  it('sorts and cleans the presets', () => {
    expect(normalizeData({ presets: [5 * MINUTE, MINUTE, -1, 'ten', MINUTE] }).presets).toEqual([
      MINUTE,
      5 * MINUTE,
    ]);
  });

  it('clamps a timer duration out of range', () => {
    expect(normalizeData({ timer: -5 }).timer).toBe(0);
    expect(normalizeData({ timer: MAX_DURATION * 3 }).timer).toBe(MAX_DURATION);
    expect(normalizeData({ timer: 'soon' }).timer).toBe(DEFAULT_DATA.timer);
  });

  it('hands back a fresh copy of the default lists', () => {
    const first = normalizeData(null);
    first.zones.push('UTC');
    first.presets.push(MINUTE * 99);
    expect(normalizeData(null).zones).toEqual([]);
    expect(normalizeData(null).presets).toEqual([...DEFAULT_PRESETS]);
  });
});

describe('the world list', () => {
  const zones = ['Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];

  it('adds to the end and never twice', () => {
    expect(addZone(zones, 'UTC')).toEqual([...zones, 'UTC']);
    expect(addZone(zones, 'Asia/Tokyo')).toEqual(zones);
  });

  it('stops at the limit', () => {
    const full = Array.from({ length: ZONE_LIMIT }, (_, i) => `Zone/${i}`);
    expect(addZone(full, 'UTC')).toHaveLength(ZONE_LIMIT);
  });

  it('removes by name', () => {
    expect(removeZone(zones, 'Asia/Kolkata')).toEqual(['Europe/London', 'Asia/Tokyo']);
    expect(removeZone(zones, 'UTC')).toEqual(zones);
  });

  it('reorders by index', () => {
    expect(moveZone(zones, 2, 0)).toEqual(['Asia/Tokyo', 'Europe/London', 'Asia/Kolkata']);
    expect(moveZone(zones, 0, 1)).toEqual(['Asia/Kolkata', 'Europe/London', 'Asia/Tokyo']);
  });

  it('holds still at the ends and on a nonsense index', () => {
    expect(moveZone(zones, 0, -1)).toEqual(zones);
    expect(moveZone(zones, 2, 9)).toEqual(zones);
    expect(moveZone(zones, 7, 0)).toEqual(zones);
  });

  it('does not mutate the list it is given', () => {
    const original = [...zones];
    moveZone(zones, 0, 2);
    addZone(zones, 'UTC');
    expect(zones).toEqual(original);
  });
});

describe('timer presets', () => {
  it('keeps them shortest first and unique', () => {
    expect(addPreset([5 * MINUTE], MINUTE)).toEqual([MINUTE, 5 * MINUTE]);
    expect(addPreset([MINUTE], MINUTE)).toEqual([MINUTE]);
  });

  it('refuses an empty duration', () => {
    expect(addPreset([MINUTE], 0)).toEqual([MINUTE]);
    expect(addPreset([MINUTE], -60)).toEqual([MINUTE]);
  });

  it('caps the row', () => {
    let presets: number[] = [];
    for (let i = 1; i <= PRESET_LIMIT + 4; i += 1) presets = addPreset(presets, i * MINUTE);
    expect(presets).toHaveLength(PRESET_LIMIT);
    expect(presets[0]).toBe(MINUTE);
  });

  it('removes by value', () => {
    expect(removePreset([MINUTE, 5 * MINUTE], MINUTE)).toEqual([5 * MINUTE]);
  });
});
