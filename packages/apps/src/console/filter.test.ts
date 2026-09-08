import { describe, expect, it } from 'vitest';
import {
  collectSources,
  compileFilter,
  matchRanges,
  parseQuery,
  queryMatches,
  splitRanges,
} from './filter';
import type { LogLevel, LogRecord } from './types';

function record(patch: Partial<LogRecord> = {}): LogRecord {
  return { id: 1, timestamp: 0, level: 'info', source: 'kernel', message: 'launch', ...patch };
}

const levels = (...list: LogLevel[]) => new Set<LogLevel>(list);
const ALL = levels('debug', 'info', 'warn', 'error');

describe('parseQuery', () => {
  it('reads an empty box as no query', () => {
    expect(parseQuery('')).toEqual({ query: { kind: 'empty' }, error: null });
  });

  it('reads plain text as a substring', () => {
    expect(parseQuery('launch')).toEqual({
      query: { kind: 'text', needle: 'launch' },
      error: null,
    });
  });

  it('reads a path as text, not as a pattern', () => {
    const parsed = parseQuery('/home/user');
    expect(parsed.error).toBeNull();
    expect(parsed.query).toEqual({ kind: 'text', needle: '/home/user' });
  });

  it('reads delimited text as a pattern and keeps the flags', () => {
    const parsed = parseQuery('/pid=\\d+/i');
    expect(parsed.error).toBeNull();
    if (parsed.query.kind !== 'regex') throw new Error('expected a regex query');
    expect(parsed.query.source).toBe('pid=\\d+');
    expect(parsed.query.flags).toBe('i');
    expect(parsed.query.regex.flags).toBe('gi');
  });

  it('takes the last slash as the delimiter', () => {
    const parsed = parseQuery('/a/b/');
    if (parsed.query.kind !== 'regex') throw new Error('expected a regex query');
    expect(parsed.query.source).toBe('a/b');
  });

  it('drives lastIndex itself, so g and y are dropped from the scan flags', () => {
    const parsed = parseQuery('/x/gy');
    if (parsed.query.kind !== 'regex') throw new Error('expected a regex query');
    expect(parsed.query.regex.flags).toBe('g');
    expect(parsed.query.flags).toBe('gy');
  });

  it('reads a trailing segment that is not a run of flags as text', () => {
    expect(parseQuery('/x/zebra')).toEqual({
      query: { kind: 'text', needle: '/x/zebra' },
      error: null,
    });
  });

  it('reads an empty pattern as the two characters it is', () => {
    expect(parseQuery('//')).toEqual({ query: { kind: 'text', needle: '//' }, error: null });
  });

  it('reports a pattern that will not compile instead of throwing', () => {
    const parsed = parseQuery('/(unclosed/');
    expect(parsed.query.kind).toBe('empty');
    expect(parsed.error).toBeTruthy();
    expect(parsed.error).not.toMatch(/^Invalid regular expression/);
  });
});

describe('matchRanges', () => {
  const query = (input: string) => parseQuery(input).query;

  it('finds nothing without a query', () => {
    expect(matchRanges('launch', query(''))).toEqual([]);
  });

  it('finds every substring, ignoring case', () => {
    expect(matchRanges('Launch launch', query('launch'))).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
    ]);
  });

  it('finds pattern matches', () => {
    expect(matchRanges('pid=3 pid=42', query('/pid=\\d+/'))).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 12 },
    ]);
  });

  it('honours the case-insensitive flag', () => {
    expect(matchRanges('ERROR', query('/error/i'))).toEqual([{ start: 0, end: 5 }]);
    expect(matchRanges('ERROR', query('/error/'))).toEqual([]);
  });

  it('does not stand still on a pattern that matches nothing', () => {
    expect(matchRanges('abc', query('/x*/'))).toEqual([]);
  });

  it('can be run twice with the same query', () => {
    const q = query('/a/');
    expect(matchRanges('abca', q)).toHaveLength(2);
    expect(matchRanges('abca', q)).toHaveLength(2);
  });

  it('stops after a hundred hits on one line', () => {
    expect(matchRanges('a'.repeat(500), query('a'))).toHaveLength(100);
  });
});

describe('queryMatches', () => {
  it('matches everything when there is no query', () => {
    expect(queryMatches('anything', parseQuery('').query)).toBe(true);
  });

  it('matches text without regard to case', () => {
    expect(queryMatches('Launch', parseQuery('launch').query)).toBe(true);
    expect(queryMatches('exit', parseQuery('launch').query)).toBe(false);
  });

  it('matches a pattern repeatedly, unaffected by the last scan', () => {
    const q = parseQuery('/a/').query;
    expect(queryMatches('a', q)).toBe(true);
    expect(queryMatches('a', q)).toBe(true);
  });
});

describe('splitRanges', () => {
  it('returns the whole line when nothing matched', () => {
    expect(splitRanges('launch', [])).toEqual([{ text: 'launch', hit: false }]);
  });

  it('cuts the line into marked and unmarked pieces', () => {
    expect(splitRanges('pid=3 ok', [{ start: 0, end: 5 }])).toEqual([
      { text: 'pid=3', hit: true },
      { text: ' ok', hit: false },
    ]);
  });

  it('keeps the text between two matches', () => {
    expect(
      splitRanges('a-b', [
        { start: 0, end: 1 },
        { start: 2, end: 3 },
      ]),
    ).toEqual([
      { text: 'a', hit: true },
      { text: '-', hit: false },
      { text: 'b', hit: true },
    ]);
  });

  it('clamps a range that runs off the end', () => {
    expect(splitRanges('ab', [{ start: 1, end: 99 }])).toEqual([
      { text: 'a', hit: false },
      { text: 'b', hit: true },
    ]);
  });

  it('drops an empty or overlapping range', () => {
    expect(
      splitRanges('abc', [
        { start: 1, end: 1 },
        { start: 0, end: 2 },
        { start: 1, end: 2 },
      ]),
    ).toEqual([
      { text: 'ab', hit: true },
      { text: 'c', hit: false },
    ]);
  });
});

describe('compileFilter', () => {
  const rows = [
    record({ id: 1, level: 'debug', source: 'settings', message: 'settings changed: theme' }),
    record({ id: 2, level: 'info', source: 'kernel', message: 'launch lumen.notes pid=3' }),
    record({ id: 3, level: 'error', source: 'runtime', message: 'TypeError: x is not a function' }),
  ];
  const keep = (state: Parameters<typeof compileFilter>[0]) =>
    rows.filter(compileFilter(state).predicate).map((r) => r.id);

  it('keeps only the levels asked for', () => {
    expect(keep({ levels: levels('error'), sources: null, search: '' })).toEqual([3]);
    expect(keep({ levels: new Set<LogLevel>(), sources: null, search: '' })).toEqual([]);
  });

  it('keeps only the sources asked for', () => {
    expect(keep({ levels: ALL, sources: new Set(['kernel']), search: '' })).toEqual([2]);
  });

  it('searches the message and the source', () => {
    expect(keep({ levels: ALL, sources: null, search: 'notes' })).toEqual([2]);
    expect(keep({ levels: ALL, sources: null, search: 'runtime' })).toEqual([3]);
  });

  it('searches with a pattern', () => {
    expect(keep({ levels: ALL, sources: null, search: '/pid=\\d+/' })).toEqual([2]);
  });

  it('keeps the level filter working when the pattern is broken', () => {
    const compiled = compileFilter({ levels: levels('error'), sources: null, search: '/(/' });
    expect(compiled.error).toBeTruthy();
    expect(rows.filter(compiled.predicate).map((r) => r.id)).toEqual([3]);
  });

  it('combines every filter', () => {
    expect(
      keep({
        levels: levels('info', 'error'),
        sources: new Set(['kernel', 'runtime']),
        search: 'x',
      }),
    ).toEqual([3]);
  });
});

describe('collectSources', () => {
  it('lists each source once, in order', () => {
    expect(
      collectSources([
        record({ source: 'window' }),
        record({ source: 'kernel' }),
        record({ source: 'window' }),
      ]),
    ).toEqual(['kernel', 'window']);
  });

  it('has nothing to list for an empty log', () => {
    expect(collectSources([])).toEqual([]);
  });
});
