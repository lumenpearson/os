import { describe, expect, it } from 'vitest';
import {
  buildRegex,
  capNote,
  captureNames,
  cleanRegexError,
  DEFAULT_LIMITS,
  expandReplacement,
  findMatches,
  type MatchRun,
  type RegexMatch,
  replaceMatches,
} from './regex';

const run = (pattern: string, flags: string, subject: string, options = {}): MatchRun => {
  const result = findMatches(pattern, flags, subject, options);
  if (!result.ok) throw new Error(`expected a scan: ${result.error}`);
  return result.run;
};

describe('buildRegex', () => {
  it('compiles a valid pattern', () => {
    const result = buildRegex('a+', 'gi');
    expect(result.ok && result.regex.source).toBe('a+');
    expect(result.ok && result.regex.flags).toBe('gi');
  });

  it('returns the reason instead of throwing on a bad pattern', () => {
    const result = buildRegex('(', '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain('Invalid regular expression');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('names an unknown or repeated flag', () => {
    expect(buildRegex('a', 'q')).toEqual({ ok: false, error: "Unknown flag 'q'" });
    expect(buildRegex('a', 'gg')).toEqual({ ok: false, error: "Repeated flag 'g'" });
  });

  it('rejects a quantifier with nothing to repeat', () => {
    expect(buildRegex('*a', '').ok).toBe(false);
  });

  it('accepts an empty pattern', () => {
    expect(buildRegex('', '').ok).toBe(true);
  });
});

describe('cleanRegexError', () => {
  it('strips the wrapper that repeats the pattern back', () => {
    expect(cleanRegexError('Invalid regular expression: /(/: Unterminated group')).toBe(
      'Unterminated group',
    );
  });

  it('leaves an unrecognised message alone', () => {
    expect(cleanRegexError('Something else went wrong')).toBe('Something else went wrong');
  });
});

describe('captureNames', () => {
  it('numbers capturing groups and names the named ones', () => {
    expect(captureNames('(a)(?<year>\\d{4})(b)')).toEqual([null, 'year', null]);
  });

  it('skips non-capturing groups and lookarounds', () => {
    expect(captureNames('(?:a)(?=b)(?!c)(?<=d)(?<!e)(f)')).toEqual([null]);
  });

  it('is not fooled by an escaped paren or one inside a character class', () => {
    expect(captureNames('\\((a)[(](?<b>x)')).toEqual([null, 'b']);
  });

  it('does not read a lookbehind as a group name', () => {
    expect(captureNames('(?<=x)(?<name>y)')).toEqual(['name']);
  });

  it('returns nothing for a pattern with no groups', () => {
    expect(captureNames('abc')).toEqual([]);
  });
});

describe('findMatches', () => {
  it('reports the index, length and text of each match', () => {
    const found = run('\\d+', 'g', 'a12b345');
    expect(found.matches.map((m) => [m.index, m.length, m.text])).toEqual([
      [1, 2, '12'],
      [4, 3, '345'],
    ]);
    expect(found.cap).toBeNull();
  });

  it('returns numbered and named groups with their offsets', () => {
    const found = run('(?<key>\\w+)=(\\w+)', 'g', 'a=1 bb=22');
    expect(found.matches).toHaveLength(2);
    expect(found.matches[1]?.groups).toEqual([
      { number: 1, name: 'key', value: 'bb', index: 4 },
      { number: 2, name: null, value: '22', index: 7 },
    ]);
  });

  it('reports a group that did not participate as null', () => {
    const found = run('(a)|(b)', 'g', 'b');
    expect(found.matches[0]?.groups).toEqual([
      { number: 1, name: null, value: null, index: null },
      { number: 2, name: null, value: 'b', index: 0 },
    ]);
  });

  it('stops after the first match without g or y', () => {
    const found = run('a', '', 'aaa');
    expect(found.single).toBe(true);
    expect(found.matches).toHaveLength(1);
  });

  it('walks past a zero-length match instead of looping forever', () => {
    const found = run('a*', 'g', 'bb');
    expect(found.matches.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(found.matches.every((m) => m.length === 0)).toBe(true);
  });

  it('caps the number of matches and says so', () => {
    const found = run('.', 'g', 'x'.repeat(50), { limits: { maxMatches: 10 } });
    expect(found.matches).toHaveLength(10);
    expect(found.cap).toBe('matches');
  });

  it('caps the subject it scans and says so', () => {
    const found = run('x', 'g', 'x'.repeat(50), { limits: { maxSubject: 5 } });
    expect(found.matches).toHaveLength(5);
    expect(found.scanned).toBe(5);
    expect(found.cap).toBe('subject');
  });

  it('caps on elapsed time using the clock it is given', () => {
    let tick = 0;
    const found = run('.', 'g', 'x'.repeat(100), {
      now: () => {
        tick += 10;
        return tick;
      },
      limits: { timeBudgetMs: 25 },
    });
    expect(found.cap).toBe('time');
    expect(found.matches.length).toBeLessThan(100);
  });

  it('does not cap a scan that finishes inside its budget', () => {
    const found = run('.', 'g', 'xxx', { now: () => 0, limits: { timeBudgetMs: 1 } });
    expect(found.cap).toBeNull();
    expect(found.matches).toHaveLength(3);
  });

  it('passes a bad pattern back as an error', () => {
    expect(findMatches('(', '', 'x').ok).toBe(false);
  });

  it('matches astral characters under the u flag', () => {
    const found = run('.', 'gu', '\u{1f680}a');
    expect(found.matches.map((m) => m.text)).toEqual(['\u{1f680}', 'a']);
  });
});

describe('capNote', () => {
  const empty: MatchRun = { matches: [], cap: null, scanned: 0, single: false };

  it('says nothing when nothing was capped', () => {
    expect(capNote(empty)).toBeNull();
  });

  it('names the cap that stopped the scan', () => {
    expect(capNote({ ...empty, cap: 'matches' })).toBe(
      `Stopped at ${DEFAULT_LIMITS.maxMatches} matches.`,
    );
    expect(capNote({ ...empty, cap: 'time' })).toBe(
      `Stopped after ${DEFAULT_LIMITS.timeBudgetMs} ms.`,
    );
    expect(capNote({ ...empty, cap: 'subject' })).toContain('characters');
  });
});

describe('expandReplacement', () => {
  const match: RegexMatch = {
    index: 4,
    length: 5,
    text: 'World',
    groups: [
      { number: 1, name: 'who', value: 'World', index: 4 },
      { number: 2, name: null, value: null, index: null },
    ],
  };
  const subject = 'aaa World zzz';

  it('expands numbered and named groups', () => {
    expect(expandReplacement('[$1]', match, subject)).toBe('[World]');
    expect(expandReplacement('[$<who>]', match, subject)).toBe('[World]');
  });

  it('expands the whole match, the prefix and the suffix', () => {
    expect(expandReplacement('$&', match, subject)).toBe('World');
    expect(expandReplacement('$`', match, subject)).toBe('aaa ');
    expect(expandReplacement("$'", match, subject)).toBe(' zzz');
  });

  it('writes a literal dollar for $$', () => {
    expect(expandReplacement('$$1', match, subject)).toBe('$1');
  });

  it('expands a group that did not participate to nothing', () => {
    expect(expandReplacement('[$2]', match, subject)).toBe('[]');
  });

  it('leaves a reference to a group that does not exist as literal text', () => {
    expect(expandReplacement('$9', match, subject)).toBe('$9');
    expect(expandReplacement('$<nope>', match, subject)).toBe('$<nope>');
    expect(expandReplacement('$<unclosed', match, subject)).toBe('$<unclosed');
  });

  it('prefers a two-digit group only when that group exists', () => {
    const many: RegexMatch = {
      index: 0,
      length: 1,
      text: 'x',
      groups: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        name: null,
        value: `g${i + 1}`,
        index: 0,
      })),
    };
    expect(expandReplacement('$12', many, 'x')).toBe('g12');
    expect(expandReplacement('$12', match, subject)).toBe('World2');
  });

  it('leaves a trailing dollar alone', () => {
    expect(expandReplacement('cost$', match, subject)).toBe('cost$');
  });
});

describe('replaceMatches', () => {
  it('replaces every match and counts them', () => {
    const result = replaceMatches('(\\w)\\1', 'g', 'aabbc', '[$1]');
    expect(result.ok && result.run).toEqual({ text: '[a][b]c', count: 2, cap: null });
  });

  it('replaces only the first match without the g flag', () => {
    const result = replaceMatches('a', '', 'aaa', 'X');
    expect(result.ok && result.run.text).toBe('Xaa');
  });

  it('copies text past the scan cap through untouched', () => {
    const result = replaceMatches('x', 'g', `${'x'.repeat(6)}TAIL`, 'y', {
      limits: { maxSubject: 3 },
    });
    expect(result.ok && result.run).toEqual({ text: 'yyyxxxTAIL', count: 3, cap: 'subject' });
  });

  it('returns the subject unchanged when nothing matches', () => {
    const result = replaceMatches('z', 'g', 'abc', 'X');
    expect(result.ok && result.run).toEqual({ text: 'abc', count: 0, cap: null });
  });

  it('passes a bad pattern back as an error', () => {
    const result = replaceMatches('[', '', 'abc', 'X');
    expect(result.ok).toBe(false);
  });
});
