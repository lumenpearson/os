import { describe, expect, it } from 'vitest';
import { CACHE_VERSION, fromCacheRecord, MAX_CACHED_FILES, toCacheRecord } from './cache';
import type { ScanResult } from './scan';

const HOME = '/Users/ada';

const result = (patch: Partial<ScanResult> = {}): ScanResult => ({
  root: HOME,
  files: [{ path: `${HOME}/a.txt`, size: 12, modifiedAt: 5 }],
  directories: 1,
  bytes: 12,
  errors: [],
  startedAt: 100,
  finishedAt: 200,
  complete: true,
  truncated: false,
  ...patch,
});

describe('toCacheRecord', () => {
  it('keeps a finished scan with its version', () => {
    expect(toCacheRecord(result())).toEqual({ version: CACHE_VERSION, result: result() });
  });

  it('refuses to cache a scan that was cancelled', () => {
    expect(toCacheRecord(result({ complete: false }))).toBeNull();
  });

  it('refuses to cache a result too large for a settings file', () => {
    const files = Array.from({ length: MAX_CACHED_FILES + 1 }, (_, i) => ({
      path: `${HOME}/f${i}`,
      size: 1,
      modifiedAt: 0,
    }));
    expect(toCacheRecord(result({ files }))).toBeNull();
  });
});

describe('fromCacheRecord', () => {
  it('round-trips a record it wrote', () => {
    const record = toCacheRecord(result());
    expect(fromCacheRecord(record, HOME)).toEqual(result());
  });

  it('keeps the errors the scan collected', () => {
    const errors = [{ path: `${HOME}/private`, message: 'EACCES' }];
    const record = toCacheRecord(result({ errors }));
    expect(fromCacheRecord(record, HOME)?.errors).toEqual(errors);
  });

  it('rejects a record written for another folder', () => {
    expect(fromCacheRecord(toCacheRecord(result()), '/Users/grace')).toBeNull();
  });

  it('rejects an older or unversioned record', () => {
    expect(fromCacheRecord({ version: 0, result: result() }, HOME)).toBeNull();
    expect(fromCacheRecord({ result: result() }, HOME)).toBeNull();
  });

  it('rejects anything that is not a record at all', () => {
    for (const value of [null, undefined, 7, 'cache', [], {}]) {
      expect(fromCacheRecord(value, HOME)).toBeNull();
    }
  });

  it('drops entries it cannot read rather than failing the whole file', () => {
    const restored = fromCacheRecord(
      {
        version: CACHE_VERSION,
        result: { ...result(), files: [{ size: 1 }, { path: `${HOME}/b.txt`, size: 3 }] },
      },
      HOME,
    );
    expect(restored?.files).toEqual([{ path: `${HOME}/b.txt`, size: 3, modifiedAt: 0 }]);
  });

  it('rejects a record with no time on it, since it could not be labelled', () => {
    expect(
      fromCacheRecord({ version: CACHE_VERSION, result: { ...result(), finishedAt: 0 } }, HOME),
    ).toBeNull();
  });
});
