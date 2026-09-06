import { describe, expect, it } from 'vitest';
import {
  formatJson,
  isJsonNumber,
  type JsonValue,
  numberValue,
  parseJson,
  parsePath,
  positionAt,
  queryJson,
  quoteJsonString,
  renderMatches,
  sliceIndices,
  stringifyJson,
  toPlain,
} from './json';

const parsed = (text: string): JsonValue => {
  const result = parseJson(text);
  if (!result.ok) throw new Error(`expected a parse: ${result.error.message}`);
  return result.value;
};

const failure = (text: string) => {
  const result = parseJson(text);
  if (result.ok) throw new Error('expected a failure');
  return result.error;
};

describe('positionAt', () => {
  it('counts lines from one and columns from one', () => {
    expect(positionAt('ab\ncd', 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt('ab\ncd', 2)).toEqual({ line: 1, column: 3 });
    expect(positionAt('ab\ncd', 3)).toEqual({ line: 2, column: 1 });
    expect(positionAt('ab\ncd', 5)).toEqual({ line: 2, column: 3 });
  });

  it('clamps an offset past the end onto the last position', () => {
    expect(positionAt('ab', 99)).toEqual({ line: 1, column: 3 });
  });
});

describe('parseJson', () => {
  it('reads every kind of value', () => {
    expect(toPlain(parsed('{"a":[1,true,null,"x"],"b":{"c":-2.5e3}}'))).toEqual({
      a: [1, true, null, 'x'],
      b: { c: -2500 },
    });
  });

  it('keeps object keys in the order they were written', () => {
    const value = parsed('{"2":"two","1":"one","b":"bee"}');
    expect([...(value as Map<string, JsonValue>).keys()]).toEqual(['2', '1', 'b']);
  });

  it('keeps number literals exactly as written', () => {
    const value = parsed('[12345678901234567890, 1e999, 1.50]');
    const items = value as JsonValue[];
    expect(items.map((n) => (isJsonNumber(n) ? n.raw : null))).toEqual([
      '12345678901234567890',
      '1e999',
      '1.50',
    ]);
    expect(numberValue(items[1] as never)).toBe(Number.POSITIVE_INFINITY);
  });

  it('takes the last of duplicate keys, as JSON.parse does', () => {
    expect(toPlain(parsed('{"a":1,"a":2}'))).toEqual({ a: 2 });
  });

  it('decodes escapes including a surrogate pair', () => {
    expect(parsed('"\\ud83d\\ude80 \\u00e9\\t\\\\"')).toBe('\u{1f680} é\t\\');
  });

  it('reports the line and column of a value missing after a comma', () => {
    const error = failure('{\n  "a": 1,\n  "b": ,\n}');
    expect(error.message).toBe("Unexpected character ','");
    expect(error.line).toBe(3);
    expect(error.column).toBe(8);
  });

  it('reports a trailing comma at the comma, not at the brace', () => {
    const error = failure('{\n  "a": 1,\n}');
    expect(error.message).toBe("Trailing comma before '}'");
    expect({ line: error.line, column: error.column }).toEqual({ line: 2, column: 9 });
  });

  it('reports a missing colon where the colon belongs', () => {
    const error = failure('{"a" 1}');
    expect(error.message).toBe("Expected ':' after the property name, found '1'");
    expect(error.column).toBe(6);
  });

  it('reports a single-quoted key as a missing double quote', () => {
    const error = failure("{'a': 1}");
    expect(error.message).toBe("Expected a property name in double quotes, found '''");
    expect(error.column).toBe(2);
  });

  it('reports an unterminated string at the opening quote', () => {
    const error = failure('{"a": "oops}');
    expect(error.message).toBe('Unterminated string');
    expect(error.line).toBe(1);
  });

  it('reports a raw newline inside a string', () => {
    const error = failure('"a\nb"');
    expect(error.message).toBe('Control character in a string: write it as an escape');
    expect({ line: error.line, column: error.column }).toEqual({ line: 1, column: 3 });
  });

  it('rejects a bare word and points at it', () => {
    const error = failure('{"a": undefined}');
    expect(error.message).toBe("Unexpected character 'u'");
    expect(error.column).toBe(7);
  });

  it('rejects a number with a leading plus and a truncated exponent', () => {
    expect(failure('[+1]').message).toBe("Unexpected character '+'");
    expect(failure('[1e]').message).toBe("Expected a digit in the exponent, found ']'");
    expect(failure('[1.]').message).toBe("Expected a digit after the decimal point, found ']'");
  });

  it('rejects an incomplete unicode escape', () => {
    expect(failure('"\\u12"').message).toBe('Incomplete \\u escape: four hex digits are required');
    expect(failure('"\\q"').message).toBe("Unknown escape '\\q'");
  });

  it('rejects empty input and trailing content', () => {
    expect(failure('').message).toBe('Unexpected end of input');
    expect(failure('   ').message).toBe('Unexpected end of input');
    const trailing = failure('{} []');
    expect(trailing.message).toBe("Unexpected character '[' after the top-level value");
    expect(trailing.column).toBe(4);
  });

  it('reports the line of an error deep in a multi-line document', () => {
    const text = ['{', '  "one": 1,', '  "two": [', '    1,', '    2,,', '  ]', '}'].join('\n');
    const error = failure(text);
    expect(error.line).toBe(5);
    expect(error.column).toBe(7);
  });

  it('refuses a document nested past the depth limit instead of overflowing the stack', () => {
    const error = failure('['.repeat(600));
    expect(error.message).toBe('Nested too deeply');
  });
});

describe('quoteJsonString', () => {
  it('escapes the characters JSON requires and leaves the rest alone', () => {
    expect(quoteJsonString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd\\u0001"');
  });

  it('keeps a surrogate pair whole but escapes a lone surrogate', () => {
    expect(quoteJsonString('\u{1f680}')).toBe('"\u{1f680}"');
    expect(quoteJsonString('\ud83d')).toBe('"\\ud83d"');
    expect(quoteJsonString('\ude80')).toBe('"\\ude80"');
  });
});

describe('stringifyJson', () => {
  const value = parsed('{"b":1,"a":{"y":[1,2],"x":{}},"c":[]}');

  it('minifies to one line', () => {
    expect(stringifyJson(value, { indent: 'minified', sortKeys: false })).toBe(
      '{"b":1,"a":{"y":[1,2],"x":{}},"c":[]}',
    );
  });

  it('indents with the chosen unit', () => {
    expect(stringifyJson(parsed('{"a":[1]}'), { indent: '2', sortKeys: false })).toBe(
      '{\n  "a": [\n    1\n  ]\n}',
    );
    expect(stringifyJson(parsed('{"a":[1]}'), { indent: 'tab', sortKeys: false })).toBe(
      '{\n\t"a": [\n\t\t1\n\t]\n}',
    );
    expect(stringifyJson(parsed('{"a":[1]}'), { indent: '4', sortKeys: false })).toBe(
      '{\n    "a": [\n        1\n    ]\n}',
    );
  });

  it('sorts keys at every level when asked, and never reorders arrays', () => {
    expect(stringifyJson(value, { indent: 'minified', sortKeys: true })).toBe(
      '{"a":{"x":{},"y":[1,2]},"b":1,"c":[]}',
    );
  });

  it('keeps empty containers on one line', () => {
    expect(stringifyJson(parsed('{"a":{},"b":[]}'), { indent: '2', sortKeys: false })).toBe(
      '{\n  "a": {},\n  "b": []\n}',
    );
  });
});

describe('formatJson', () => {
  it('round-trips a document without changing its numbers', () => {
    const source = '{"id":12345678901234567890,"ratio":1.50}';
    const result = formatJson(source, { indent: 'minified', sortKeys: false });
    expect(result).toEqual({ ok: true, text: source });
  });

  it('passes the parse error through', () => {
    const result = formatJson('{,}', { indent: '2', sortKeys: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.column).toBe(2);
  });
});

describe('parsePath', () => {
  it('reads dotted names, indices, wildcards and slices', () => {
    expect(parsePath('$.a.b[0]')).toEqual({
      ok: true,
      steps: [
        { kind: 'member', name: 'a' },
        { kind: 'member', name: 'b' },
        { kind: 'index', index: 0 },
      ],
    });
    expect(parsePath('$[*].id')).toEqual({
      ok: true,
      steps: [{ kind: 'wildcard' }, { kind: 'member', name: 'id' }],
    });
    expect(parsePath('$.*')).toEqual({ ok: true, steps: [{ kind: 'wildcard' }] });
    expect(parsePath('$[1:5:2]')).toEqual({
      ok: true,
      steps: [{ kind: 'slice', start: 1, end: 5, step: 2 }],
    });
    expect(parsePath('$[:-1]')).toEqual({
      ok: true,
      steps: [{ kind: 'slice', start: null, end: -1, step: 1 }],
    });
    expect(parsePath("$['a key']")).toEqual({
      ok: true,
      steps: [{ kind: 'member', name: 'a key' }],
    });
  });

  it('reports the column of a bad path', () => {
    expect(parsePath('a.b')).toEqual({
      ok: false,
      error: { message: "A path starts with '$'", column: 1 },
    });
    expect(parsePath('$.')).toEqual({
      ok: false,
      error: { message: 'Expected a property name after the dot', column: 3 },
    });
    expect(parsePath('$[0')).toEqual({ ok: false, error: { message: "Expected ']'", column: 2 } });
    expect(parsePath('$[a]')).toEqual({
      ok: false,
      error: { message: "'a' is not an index, a slice or a name", column: 3 },
    });
    expect(parsePath('$[1:2:0]')).toEqual({
      ok: false,
      error: { message: 'A slice step cannot be 0', column: 3 },
    });
    expect(parsePath('$[1:2:3:4]')).toEqual({
      ok: false,
      error: { message: 'A slice takes at most start:end:step', column: 3 },
    });
    expect(parsePath("$['a]")).toEqual({
      ok: false,
      error: { message: 'Unterminated quoted name', column: 3 },
    });
    expect(parsePath('$#')).toEqual({
      ok: false,
      error: { message: "Unexpected character '#'", column: 2 },
    });
  });

  it('accepts the bare root', () => {
    expect(parsePath('$')).toEqual({ ok: true, steps: [] });
  });
});

describe('sliceIndices', () => {
  it('walks forwards like a Python slice', () => {
    expect(sliceIndices(5, null, null, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(sliceIndices(5, 1, 3, 1)).toEqual([1, 2]);
    expect(sliceIndices(5, -2, null, 1)).toEqual([3, 4]);
    expect(sliceIndices(5, 0, null, 2)).toEqual([0, 2, 4]);
    expect(sliceIndices(5, 4, 1, 1)).toEqual([]);
    expect(sliceIndices(5, 0, 99, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  it('walks backwards for a negative step', () => {
    expect(sliceIndices(5, null, null, -1)).toEqual([4, 3, 2, 1, 0]);
    expect(sliceIndices(5, 3, 0, -1)).toEqual([3, 2, 1]);
    expect(sliceIndices(5, -1, -3, -1)).toEqual([4, 3]);
  });
});

describe('queryJson', () => {
  const doc = parsed(`{
    "items": [
      { "id": 1, "tags": ["a", "b"] },
      { "id": 2, "tags": [] },
      { "id": 3 }
    ],
    "meta": { "a key": true }
  }`);

  it('reaches a nested value and reports its canonical path', () => {
    const result = queryJson(doc, '$.items[0].tags[1]');
    expect(result).toEqual({ ok: true, matches: [{ path: '$.items[0].tags[1]', value: 'b' }] });
  });

  it('spreads a wildcard over an array and skips objects without the key', () => {
    const result = queryJson(doc, '$.items[*].tags');
    expect(result.ok && result.matches.map((m) => m.path)).toEqual([
      '$.items[0].tags',
      '$.items[1].tags',
    ]);
  });

  it('spreads a wildcard over object values', () => {
    const result = queryJson(doc, '$.meta.*');
    expect(result.ok && result.matches).toEqual([{ path: '$.meta["a key"]', value: true }]);
  });

  it('counts a negative index from the end and drops one out of range', () => {
    expect(queryJson(doc, '$.items[-1].id').ok && queryJson(doc, '$.items[-1].id')).toMatchObject({
      matches: [{ path: '$.items[2].id' }],
    });
    const missing = queryJson(doc, '$.items[9]');
    expect(missing).toEqual({ ok: true, matches: [] });
  });

  it('slices an array', () => {
    const result = queryJson(doc, '$.items[0:2].id');
    expect(result.ok && result.matches.map((m) => toPlain(m.value))).toEqual([1, 2]);
  });

  it('returns nothing rather than failing when a step meets the wrong kind', () => {
    expect(queryJson(doc, '$.meta[0]')).toEqual({ ok: true, matches: [] });
    expect(queryJson(doc, '$.items.id')).toEqual({ ok: true, matches: [] });
  });

  it('returns the whole document for the bare root', () => {
    const result = queryJson(doc, '$');
    expect(result.ok && result.matches[0]?.path).toBe('$');
  });

  it('passes a path error through', () => {
    expect(queryJson(doc, '$..a')).toEqual({
      ok: false,
      error: { message: 'Expected a property name after the dot', column: 3 },
    });
  });
});

describe('renderMatches', () => {
  const doc = parsed('{"a":[{"x":1},{"x":2}]}');
  const options = { indent: '2', sortKeys: false } as const;

  it('prints a single match with the chosen indent', () => {
    const result = queryJson(doc, '$.a[0]');
    expect(result.ok && renderMatches(result.matches, options)).toBe('{\n  "x": 1\n}');
  });

  it('prints several matches one per line', () => {
    const result = queryJson(doc, '$.a[*]');
    expect(result.ok && renderMatches(result.matches, options)).toBe('{"x":1}\n{"x":2}');
  });

  it('prints nothing for no matches', () => {
    expect(renderMatches([], options)).toBe('');
  });
});
