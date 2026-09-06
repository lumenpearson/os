import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig, REFRESH_RATES, SERIES_CAPACITY, TAB_IDS } from './config';

describe('normalizeConfig', () => {
  it('falls back to the defaults for anything that is not a config', () => {
    for (const value of [null, undefined, 7, 'processes', [], true]) {
      expect(normalizeConfig(value)).toEqual(DEFAULT_CONFIG);
    }
  });

  it('keeps a config it wrote itself', () => {
    const config = { tab: 'apps', refreshMs: 5000, sort: { column: 'pid', direction: 'desc' } };
    expect(normalizeConfig(config)).toEqual(config);
  });

  it('accepts every tab and every offered rate', () => {
    for (const tab of TAB_IDS) expect(normalizeConfig({ tab }).tab).toBe(tab);
    for (const refreshMs of REFRESH_RATES) {
      expect(normalizeConfig({ refreshMs }).refreshMs).toBe(refreshMs);
    }
  });

  it('rejects a rate that is not on the menu', () => {
    expect(normalizeConfig({ refreshMs: 16 }).refreshMs).toBe(DEFAULT_CONFIG.refreshMs);
    expect(normalizeConfig({ refreshMs: '1000' }).refreshMs).toBe(DEFAULT_CONFIG.refreshMs);
  });

  it('rejects a tab and a column it cannot show', () => {
    expect(normalizeConfig({ tab: 'network' }).tab).toBe(DEFAULT_CONFIG.tab);
    expect(normalizeConfig({ sort: { column: 'cpu' } }).sort.column).toBe(
      DEFAULT_CONFIG.sort.column,
    );
  });

  it('treats any direction other than desc as ascending', () => {
    expect(normalizeConfig({ sort: { column: 'pid', direction: 'desc' } }).sort.direction).toBe(
      'desc',
    );
    expect(normalizeConfig({ sort: { column: 'pid', direction: 'sideways' } }).sort.direction).toBe(
      'asc',
    );
    expect(normalizeConfig({ sort: 'pid' }).sort).toEqual(DEFAULT_CONFIG.sort);
  });

  it('repairs a half-written file field by field', () => {
    expect(normalizeConfig({ tab: 'apps', refreshMs: 'often' })).toEqual({
      ...DEFAULT_CONFIG,
      tab: 'apps',
    });
  });
});

describe('defaults', () => {
  it('are themselves valid', () => {
    expect(normalizeConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
    expect(REFRESH_RATES).toContain(DEFAULT_CONFIG.refreshMs);
    expect(TAB_IDS).toContain(DEFAULT_CONFIG.tab);
  });

  it('keep a minute of samples at the fastest rate', () => {
    expect(SERIES_CAPACITY * Math.min(...REFRESH_RATES)).toBe(60_000);
  });
});
