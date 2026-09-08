import { describe, expect, it } from 'vitest';
import {
  clearTool,
  DEFAULT_DATA,
  MAX_FIELD,
  MAX_IDS,
  normalizeData,
  normalizeFlags,
  resolveZone,
} from './storage';
import { TOOLS } from './tools';

describe('normalizeData', () => {
  it('falls back completely for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('{}')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
    expect(normalizeData(undefined)).toEqual(DEFAULT_DATA);
  });

  it('keeps values it recognises', () => {
    const stored = normalizeData({
      tool: 'regex',
      json: { input: '{"a":1}', indent: 'tab', sortKeys: true, query: '$.a' },
      regex: { pattern: '\\d+', flags: 'gi', subject: 'a1', replacement: '[$&]' },
      diff: { left: 'a', right: 'b' },
      encode: { codec: 'hex', direction: 'decode', input: '6162' },
      ids: { kind: 'ulid', count: 12 },
      time: { input: '0', unit: 'seconds', zone: 'Europe/Paris' },
      hash: { algorithm: 'SHA-512', input: 'abc' },
    });
    expect(stored.tool).toBe('regex');
    expect(stored.json).toEqual({ input: '{"a":1}', indent: 'tab', sortKeys: true, query: '$.a' });
    expect(stored.encode).toEqual({ codec: 'hex', direction: 'decode', input: '6162' });
    expect(stored.ids).toEqual({ kind: 'ulid', count: 12 });
    expect(stored.hash).toEqual({ algorithm: 'SHA-512', input: 'abc' });
  });

  it('replaces a value outside its set with the default', () => {
    const stored = normalizeData({
      tool: 'browser',
      json: { indent: '8', sortKeys: 'yes' },
      encode: { codec: 'rot13', direction: 'sideways' },
      time: { unit: 'fortnights' },
      hash: { algorithm: 'MD5' },
      ids: { kind: 'snowflake' },
    });
    expect(stored.tool).toBe(DEFAULT_DATA.tool);
    expect(stored.json.indent).toBe(DEFAULT_DATA.json.indent);
    expect(stored.json.sortKeys).toBe(false);
    expect(stored.encode).toEqual(DEFAULT_DATA.encode);
    expect(stored.time.unit).toBe(DEFAULT_DATA.time.unit);
    expect(stored.hash.algorithm).toBe(DEFAULT_DATA.hash.algorithm);
    expect(stored.ids.kind).toBe(DEFAULT_DATA.ids.kind);
  });

  it('clamps the id count into the range the panel offers', () => {
    expect(normalizeData({ ids: { count: 0 } }).ids.count).toBe(1);
    expect(normalizeData({ ids: { count: 9999 } }).ids.count).toBe(MAX_IDS);
    expect(normalizeData({ ids: { count: 7.6 } }).ids.count).toBe(8);
    expect(normalizeData({ ids: { count: Number.NaN } }).ids.count).toBe(DEFAULT_DATA.ids.count);
  });

  it('caps a field so an edited settings file cannot grow without limit', () => {
    const huge = 'x'.repeat(MAX_FIELD + 500);
    expect(normalizeData({ json: { input: huge } }).json.input).toHaveLength(MAX_FIELD);
  });

  it('accepts a section that is missing entirely', () => {
    expect(normalizeData({ tool: 'diff' })).toEqual({ ...DEFAULT_DATA, tool: 'diff' });
  });

  it('ignores a section that is not an object', () => {
    expect(normalizeData({ json: 'nope', ids: 5 })).toEqual(DEFAULT_DATA);
  });

  it('is stable: normalizing twice changes nothing', () => {
    const once = normalizeData({ tool: 'hash', regex: { flags: 'ggxi' } });
    expect(normalizeData(once)).toEqual(once);
  });
});

describe('normalizeFlags', () => {
  it('drops characters that are not regular-expression flags', () => {
    expect(normalizeFlags('gix!', 'g')).toBe('gi');
  });

  it('keeps each flag once', () => {
    expect(normalizeFlags('gggm', 'g')).toBe('gm');
  });

  it('allows no flags at all', () => {
    expect(normalizeFlags('', 'g')).toBe('');
    expect(normalizeFlags('xyz', 'g')).toBe('y');
  });

  it('falls back when the value is not text', () => {
    expect(normalizeFlags(7, 'gi')).toBe('gi');
  });
});

describe('clearTool', () => {
  const filled = normalizeData({
    json: { input: '{"a":1}', query: '$.a', indent: 'tab', sortKeys: true },
    regex: { pattern: 'a', subject: 'b', replacement: 'c', flags: 'gim' },
    diff: { left: 'l', right: 'r' },
    encode: { codec: 'hex', direction: 'decode', input: 'ff' },
    time: { input: '0', unit: 'seconds', zone: 'UTC' },
    hash: { algorithm: 'SHA-1', input: 'x' },
  });

  it('empties the fields and keeps the options', () => {
    const cleared = clearTool(filled, 'json');
    expect(cleared.json).toEqual({ input: '', query: '', indent: 'tab', sortKeys: true });
    expect(clearTool(filled, 'regex').regex).toEqual({
      pattern: '',
      subject: '',
      replacement: '',
      flags: 'gim',
    });
    expect(clearTool(filled, 'encode').encode).toEqual({
      codec: 'hex',
      direction: 'decode',
      input: '',
    });
    expect(clearTool(filled, 'time').time).toEqual({ input: '', unit: 'seconds', zone: 'UTC' });
    expect(clearTool(filled, 'hash').hash).toEqual({ algorithm: 'SHA-1', input: '' });
    expect(clearTool(filled, 'diff').diff).toEqual({ left: '', right: '' });
  });

  it('leaves the other tools alone', () => {
    const cleared = clearTool(filled, 'json');
    expect(cleared.regex).toEqual(filled.regex);
    expect(cleared.diff).toEqual(filled.diff);
  });

  it('has nothing to clear for the generator', () => {
    expect(clearTool(filled, 'ids')).toBe(filled);
  });

  it('handles every tool in the list', () => {
    for (const tool of TOOLS) expect(() => clearTool(filled, tool)).not.toThrow();
  });
});

describe('resolveZone', () => {
  it('prefers the stored zone', () => {
    expect(resolveZone('Europe/Paris', 'America/New_York')).toBe('Europe/Paris');
  });

  it('falls back to the machine zone, then to UTC', () => {
    expect(resolveZone('', 'America/New_York')).toBe('America/New_York');
    expect(resolveZone('', '')).toBe('UTC');
  });
});
