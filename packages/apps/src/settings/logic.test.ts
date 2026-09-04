import { describe, expect, it, vi } from 'vitest';
import {
  addPinned,
  dateExample,
  formatDuration,
  listTimeZones,
  localeLabel,
  minuteLabel,
  movePinned,
  networkStatus,
  parseMinutes,
  removePinned,
  rotateCredentials,
  setMuted,
  storageBreakdown,
  updateStatus,
  viewportLabel,
} from './logic';

describe('minutes', () => {
  it('labels the idle options', () => {
    expect(minuteLabel(0)).toBe('Never');
    expect(minuteLabel(1)).toBe('1 minute');
    expect(minuteLabel(15)).toBe('15 minutes');
    expect(minuteLabel(60)).toBe('1 hour');
  });
  it('parses select values defensively', () => {
    expect(parseMinutes('5')).toBe(5);
    expect(parseMinutes('x')).toBe(0);
    expect(parseMinutes('-3')).toBe(0);
  });
});

describe('pinned apps', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves an item down and up', () => {
    expect(movePinned(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePinned(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('returns the same list for no-ops and out-of-range moves', () => {
    expect(movePinned(list, 1, 1)).toBe(list);
    expect(movePinned(list, -1, 0)).toBe(list);
    expect(movePinned(list, 0, 9)).toBe(list);
  });
  it('adds once and removes', () => {
    expect(addPinned(list, 'e')).toEqual([...list, 'e']);
    expect(addPinned(list, 'a')).toBe(list);
    expect(removePinned(list, 'b')).toEqual(['a', 'c', 'd']);
  });
});

describe('setMuted', () => {
  it('adds when disallowed and removes when allowed, without duplicates', () => {
    expect(setMuted([], 'x', false)).toEqual(['x']);
    expect(setMuted(['x'], 'x', false)).toEqual(['x']);
    expect(setMuted(['x', 'y'], 'x', true)).toEqual(['y']);
  });
});

describe('status strings', () => {
  it('describes the network', () => {
    const base = { wifi: true, bluetooth: false, airplane: false, ssid: 'Home' };
    expect(networkStatus(base)).toBe('Connected to Home');
    expect(networkStatus({ ...base, wifi: false })).toBe('Wi-Fi off');
    expect(networkStatus({ ...base, airplane: true })).toBe('Airplane mode');
  });
  it('describes the update state', () => {
    expect(updateStatus(null, '0.1.0', () => 'x')).toBe('Lumen OS 0.1.0 · not checked yet');
    expect(updateStatus(5, '0.1.0', () => 'just now')).toBe(
      'Lumen OS 0.1.0 is up to date · checked just now',
    );
  });
  it('formats the viewport', () => {
    expect(viewportLabel(1440, 900, 2)).toBe('1440 × 900 · 2×');
    expect(viewportLabel(1366, 768, 1.25)).toBe('1366 × 768 · 1.25×');
    expect(viewportLabel(800, 600, 1.5)).toBe('800 × 600 · 1.5×');
  });
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(12 * 60)).toBe('12 min');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 05 min');
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2 d 4 h');
  });
});

describe('storageBreakdown', () => {
  it('sorts largest first with fractions of the total', () => {
    const rows = storageBreakdown([
      { name: 'Users', path: '/Users', size: 300 },
      { name: 'System', path: '/System', size: 100 },
      { name: 'Trash', path: '/Trash', size: 0 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Users', 'System', 'Trash']);
    expect(rows[0]?.fraction).toBeCloseTo(0.75);
    expect(rows[2]?.fraction).toBe(0);
  });
  it('handles an empty file system', () => {
    expect(storageBreakdown([{ name: 'a', path: '/a', size: 0 }])[0]?.fraction).toBe(0);
  });
});

describe('rotateCredentials', () => {
  it('returns null when the current password is wrong', async () => {
    const kernel = { changePassword: vi.fn(async () => false), resetPassword: vi.fn() };
    expect(await rotateCredentials(kernel, 'bad', 'new')).toBeNull();
    expect(kernel.resetPassword).not.toHaveBeenCalled();
  });
  it('returns the fresh recovery key after a verified change', async () => {
    const kernel = {
      changePassword: vi.fn(async () => true),
      resetPassword: vi.fn(async () => 'ABCD-EFGH'),
    };
    expect(await rotateCredentials(kernel, 'old', 'new', 'hint')).toBe('ABCD-EFGH');
    expect(kernel.changePassword).toHaveBeenCalledWith('old', 'new', 'hint');
    expect(kernel.resetPassword).toHaveBeenCalledWith('new', 'hint');
  });
});

describe('region', () => {
  it('labels locales in their own language', () => {
    expect(localeLabel('en-US')).toMatch(/English/);
    expect(localeLabel('de-DE')).toMatch(/Deutsch/);
  });
  it('always includes the current time zone', () => {
    expect(listTimeZones('Mars/Olympus')).toContain('Mars/Olympus');
    expect(listTimeZones('UTC').length).toBeGreaterThan(0);
  });
  it('shows a date example per format', () => {
    const d = new Date(Date.UTC(2026, 8, 4, 12));
    expect(dateExample('iso', 'en-US', d)).toBe('2026-09-04');
    expect(dateExample('us', 'de-DE', d)).toBe('Sep 4, 2026');
    expect(dateExample('eu', 'en-US', d)).toBe('4 Sept 2026');
  });
});
