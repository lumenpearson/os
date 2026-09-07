import { describe, expect, it } from 'vitest';
import { describeOrigin, SYNC_INTERVALS, syncedAt } from './storeSettings';

describe('SYNC_INTERVALS', () => {
  it('offers only intervals the setting can hold, as whole minutes', () => {
    for (const option of SYNC_INTERVALS) {
      expect(Number.isInteger(Number(option.value))).toBe(true);
      expect(Number(option.value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('has a way to turn refreshing off', () => {
    expect(SYNC_INTERVALS.some((o) => o.value === '0')).toBe(true);
  });
});

describe('syncedAt', () => {
  it('says so rather than printing an epoch when there has been no fetch', () => {
    expect(syncedAt(null, 'en-GB')).toBe('Not yet fetched');
  });

  it('reads a moment in the region format it was given', () => {
    const at = Date.UTC(2026, 8, 7, 12, 0);
    expect(syncedAt(at, 'en-GB')).toContain('2026');
  });

  it('takes the caller words for the absence, because absences differ', () => {
    expect(syncedAt(null, 'en-GB', 'Not checked yet')).toBe('Not checked yet');
  });
});

describe('describeOrigin', () => {
  it('names the address when the catalogue came from it', () => {
    expect(describeOrigin('network', Date.UTC(2026, 8, 7), 'en-GB')).toContain('address above');
  });

  it('leaves the date as the locale wrote it, month and all', () => {
    const line = describeOrigin('network', Date.UTC(2026, 8, 7, 12), 'en-GB');
    expect(line, 'a lower-cased sentence turns Sep into a word').toContain(
      syncedAt(Date.UTC(2026, 8, 7, 12), 'en-GB'),
    );
  });

  it('says a kept copy is kept', () => {
    expect(describeOrigin('cache', Date.UTC(2026, 8, 7), 'en-GB')).toContain('previous session');
  });

  it('says why the bundled copy is the one on screen', () => {
    expect(describeOrigin('bundled', null, 'en-GB')).toContain('did not answer');
  });

  it('has a sentence for a store that has never been asked', () => {
    expect(describeOrigin(null, null, 'en-GB')).toBe('Nothing has been fetched yet.');
  });
});
