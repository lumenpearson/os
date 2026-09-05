import { describe, expect, it } from 'vitest';
import { runDiff, runEncode, runJson, runRegex, runTime, TIME_ROWS } from './derive';
import { UTC } from './epoch';
import { DEFAULT_DATA } from './storage';

const json = (change: Partial<typeof DEFAULT_DATA.json> = {}) => ({
  ...DEFAULT_DATA.json,
  ...change,
});
const regex = (change: Partial<typeof DEFAULT_DATA.regex> = {}) => ({
  ...DEFAULT_DATA.regex,
  ...change,
});
const encode = (change: Partial<typeof DEFAULT_DATA.encode> = {}) => ({
  ...DEFAULT_DATA.encode,
  ...change,
});
const time = (change: Partial<typeof DEFAULT_DATA.time> = {}) => ({
  ...DEFAULT_DATA.time,
  ...change,
});

describe('runJson', () => {
  it('produces nothing for an empty document', () => {
    expect(runJson(json())).toEqual({
      output: '',
      parseError: null,
      queryError: null,
      note: null,
    });
    expect(runJson(json({ input: '   \n ' })).output).toBe('');
  });

  it('formats with the chosen indent', () => {
    expect(runJson(json({ input: '{"a":[1]}', indent: '2' })).output).toBe(
      '{\n  "a": [\n    1\n  ]\n}',
    );
    expect(runJson(json({ input: '{ "a" : [ 1 ] }', indent: 'minified' })).output).toBe(
      '{"a":[1]}',
    );
  });

  it('sorts keys when asked', () => {
    expect(
      runJson(json({ input: '{"b":1,"a":2}', indent: 'minified', sortKeys: true })).output,
    ).toBe('{"a":2,"b":1}');
  });

  it('reports a parse error with a line and a column and no output', () => {
    const result = runJson(json({ input: '{\n  "a": ,\n}' }));
    expect(result.parseError).toBe("Line 2, column 8: Unexpected character ','");
    expect(result.output).toBe('');
  });

  it('runs a path and names the single match', () => {
    const result = runJson(json({ input: '{"a":{"b":[7,8]}}', query: ' $.a.b[1] ' }));
    expect(result.output).toBe('8');
    expect(result.note).toBe('$.a.b[1]');
  });

  it('counts several matches', () => {
    const result = runJson(json({ input: '{"a":[1,2,3]}', query: '$.a[*]' }));
    expect(result.output).toBe('1\n2\n3');
    expect(result.note).toBe('3 matches');
  });

  it('reports a path error against the path field, not the document', () => {
    const result = runJson(json({ input: '{"a":1}', query: '$[' }));
    expect(result.queryError).toBe("Column 2: Expected ']'");
    expect(result.parseError).toBeNull();
  });

  it('says nothing matched rather than failing', () => {
    const result = runJson(json({ input: '{"a":1}', query: '$.zzz' }));
    expect(result.note).toBe('0 matches');
    expect(result.output).toBe('');
  });
});

describe('runRegex', () => {
  it('produces nothing without a pattern', () => {
    expect(runRegex(regex({ subject: 'aaa' }))).toEqual({
      matches: [],
      error: null,
      note: null,
      output: '',
    });
  });

  it('lists matches and counts them', () => {
    const result = runRegex(regex({ pattern: '\\d+', subject: 'a1 b22' }));
    expect(result.matches.map((m) => m.text)).toEqual(['1', '22']);
    expect(result.note).toBe('2 matches');
  });

  it('uses the singular for one match', () => {
    expect(runRegex(regex({ pattern: 'a', subject: 'a', flags: 'g' })).note).toBe('1 match');
  });

  it('says when only the first match counts', () => {
    expect(runRegex(regex({ pattern: 'a', flags: '', subject: 'aaa' })).note).toBe(
      '1 match · no g flag',
    );
  });

  it('names the cap in the note when the scan stopped early', () => {
    const result = runRegex(regex({ pattern: '.', subject: 'x'.repeat(50) }), {
      limits: { maxMatches: 5 },
    });
    expect(result.note).toBe('5 matches · Stopped at 5 matches.');
  });

  it('previews the replacement', () => {
    const result = runRegex(
      regex({ pattern: '(?<k>\\w+)=(\\d+)', subject: 'a=1 b=2', replacement: '$<k>:$2' }),
    );
    expect(result.output).toBe('a:1 b:2');
  });

  it('reports a bad pattern and shows no matches', () => {
    const result = runRegex(regex({ pattern: '(', subject: 'x' }));
    expect(result.error).not.toBeNull();
    expect(result.matches).toEqual([]);
    expect(result.output).toBe('');
  });
});

describe('runDiff', () => {
  it('produces nothing when both sides are empty', () => {
    expect(runDiff({ left: '', right: '' })).toEqual({
      rows: [],
      output: '',
      note: null,
      capped: false,
    });
  });

  it('says identical when the texts match', () => {
    const result = runDiff({ left: 'a\nb', right: 'a\nb' });
    expect(result.note).toBe('identical');
    expect(result.rows).toHaveLength(2);
  });

  it('counts additions and removals', () => {
    const result = runDiff({ left: 'a\nb', right: 'a\nc\nd' });
    expect(result.note).toBe('+2 −1');
    expect(result.output).toBe('  a\n- b\n+ c\n+ d');
  });

  it('reports a one-sided text as all added or all removed', () => {
    expect(runDiff({ left: '', right: 'a' }).note).toBe('+1 −0');
    expect(runDiff({ left: 'a', right: '' }).note).toBe('+0 −1');
  });
});

describe('runEncode', () => {
  it('produces nothing for an empty field', () => {
    expect(runEncode(encode())).toEqual({ output: '', error: null });
  });

  it('encodes and decodes in the chosen direction', () => {
    expect(runEncode(encode({ codec: 'hex', direction: 'encode', input: 'ab' })).output).toBe(
      '6162',
    );
    expect(runEncode(encode({ codec: 'hex', direction: 'decode', input: '6162' })).output).toBe(
      'ab',
    );
  });

  it('reports a decode failure and shows no output', () => {
    const result = runEncode(encode({ codec: 'hex', direction: 'decode', input: 'zz' }));
    expect(result.output).toBe('');
    expect(result.error).toBe("'zz' is not a pair of hex digits");
  });
});

describe('runTime', () => {
  const now = 1_700_000_000_000;

  it('produces nothing for an empty field', () => {
    expect(runTime(time(), UTC, now)).toEqual({
      view: null,
      relative: null,
      error: null,
      output: '',
    });
  });

  it('describes an instant in the chosen zone', () => {
    const result = runTime(time({ input: '1700000000' }), 'America/New_York', now);
    expect(result.view).toMatchObject({
      epochSeconds: '1700000000',
      iso: '2023-11-14T17:13:20-05:00',
      isoUtc: '2023-11-14T22:13:20Z',
    });
    expect(result.relative).toBe('now');
  });

  it('writes one line per row for Copy Output', () => {
    const result = runTime(time({ input: '0' }), UTC, now);
    expect(result.output.split('\n')).toHaveLength(TIME_ROWS.length);
    expect(result.output).toContain('Epoch seconds: 0');
    expect(result.output).toContain('ISO 8601 UTC: 1970-01-01T00:00:00Z');
  });

  it('reports a bad input and shows no view', () => {
    const result = runTime(time({ input: 'nope' }), UTC, now);
    expect(result.view).toBeNull();
    expect(result.error).toContain('Not a time');
  });

  it('reads the unit the user chose', () => {
    expect(runTime(time({ input: '1700000000', unit: 'milliseconds' }), UTC, now).view?.iso).toBe(
      '1970-01-20T16:13:20Z',
    );
  });
});
