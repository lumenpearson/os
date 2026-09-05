import { describe, expect, it } from 'vitest';
import {
  clip,
  describeThrown,
  exportFileName,
  flattenPayload,
  formatClock,
  formatConsoleArgs,
  formatStamp,
  payloadLineText,
  previewValue,
  serializeLog,
  serializeRecord,
  singleLine,
} from './format';
import type { LogRecord } from './types';

/** Built from local parts, so the expectations hold in any time zone. */
const AT = new Date(2026, 8, 4, 3, 4, 5, 6).getTime();

function record(patch: Partial<LogRecord> = {}): LogRecord {
  return {
    id: 1,
    timestamp: AT,
    level: 'info',
    source: 'kernel',
    message: 'launch lumen.notes pid=3',
    ...patch,
  };
}

describe('formatClock', () => {
  it('prints local time to the millisecond, zero padded', () => {
    expect(formatClock(AT)).toBe('03:04:05.006');
  });

  it('keeps a fixed width at every hour', () => {
    const late = new Date(2026, 8, 4, 23, 59, 59, 999).getTime();
    expect(formatClock(late)).toBe('23:59:59.999');
    expect(formatClock(late)).toHaveLength(formatClock(AT).length);
  });

  it('says so when the time is not a time', () => {
    expect(formatClock(Number.NaN)).toBe('--:--:--.---');
  });
});

describe('formatStamp', () => {
  it('prefixes the local date', () => {
    expect(formatStamp(AT)).toBe('2026-09-04 03:04:05.006');
  });

  it('says so when the time is not a time', () => {
    expect(formatStamp(Number.NaN)).toBe('unknown time');
  });
});

describe('clip and singleLine', () => {
  it('leaves short text alone', () => {
    expect(clip('short', 10)).toBe('short');
  });

  it('marks text it cut', () => {
    expect(clip('abcdef', 3)).toBe('abc…');
  });

  it('collapses newlines and runs of space into one line', () => {
    expect(singleLine('  two\n\tlines   here ')).toBe('two lines here');
  });
});

describe('previewValue', () => {
  it('prints primitives the way a console does', () => {
    expect(previewValue(null)).toBe('null');
    expect(previewValue(undefined)).toBe('undefined');
    expect(previewValue(42)).toBe('42');
    expect(previewValue(-0)).toBe('-0');
    expect(previewValue(Number.NaN)).toBe('NaN');
    expect(previewValue(true)).toBe('true');
    expect(previewValue(10n)).toBe('10n');
    expect(previewValue(Symbol('x'))).toBe('Symbol(x)');
  });

  it('quotes strings and cuts long ones', () => {
    expect(previewValue('hi')).toBe('"hi"');
    expect(previewValue('a'.repeat(200))).toBe(`"${'a'.repeat(160)}…"`);
  });

  it('names functions', () => {
    expect(previewValue(function named() {})).toBe('[function named]');
    expect(previewValue(() => {})).toBe('[function]');
  });

  it('summarises containers by their size', () => {
    expect(previewValue([1, 2, 3])).toBe('Array(3)');
    expect(previewValue({})).toBe('{}');
    expect(previewValue({ a: 1 })).toBe('{…}');
    expect(previewValue(new Map([[1, 1]]))).toBe('Map(1)');
    expect(previewValue(new Set([1, 2]))).toBe('Set(2)');
    expect(previewValue(/ab+/gi)).toBe('/ab+/gi');
  });

  it('names a class instance', () => {
    class Box {
      value = 1;
    }
    expect(previewValue(new Box())).toBe('Box {…}');
  });

  it('prints an error as its name and message', () => {
    expect(previewValue(new TypeError('bad'))).toBe('TypeError: bad');
  });

  it('prints dates as ISO, and says when one is invalid', () => {
    expect(previewValue(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(previewValue(new Date(Number.NaN))).toBe('Invalid Date');
  });
});

describe('flattenPayload', () => {
  it('puts the entries of a root object at the left margin', () => {
    expect(flattenPayload({ appId: 'lumen.notes', pid: 3 })).toEqual([
      { depth: 0, key: 'appId', value: '"lumen.notes"' },
      { depth: 0, key: 'pid', value: '3' },
    ]);
  });

  it('indexes the entries of a root array', () => {
    expect(flattenPayload([true, 'x'])).toEqual([
      { depth: 0, key: '[0]', value: 'true' },
      { depth: 0, key: '[1]', value: '"x"' },
    ]);
  });

  it('prints an empty container as one line', () => {
    expect(flattenPayload({})).toEqual([{ depth: 0, key: null, value: '{}' }]);
    expect(flattenPayload([])).toEqual([{ depth: 0, key: null, value: '[]' }]);
  });

  it('prints a bare value as one line', () => {
    expect(flattenPayload('note')).toEqual([{ depth: 0, key: null, value: '"note"' }]);
  });

  it('heads a nested container and indents its entries', () => {
    expect(flattenPayload({ args: { path: '/home' } })).toEqual([
      { depth: 0, key: 'args', value: '{…}' },
      { depth: 1, key: 'path', value: '"/home"' },
    ]);
  });

  it('stops walking at the depth limit and prints the container instead', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    expect(flattenPayload(deep, { maxDepth: 2 })).toEqual([
      { depth: 0, key: 'a', value: '{…}' },
      { depth: 1, key: 'b', value: '{…}' },
      { depth: 2, key: 'c', value: '{…}' },
    ]);
  });

  it('marks a cycle rather than following it', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;
    expect(flattenPayload(node)).toEqual([
      { depth: 0, key: 'name', value: '"root"' },
      { depth: 0, key: 'self', value: '[circular]' },
    ]);
  });

  it('does not call a repeated sibling a cycle', () => {
    const shared = { id: 1 };
    const lines = flattenPayload({ a: shared, b: shared });
    expect(lines.map((l) => l.value)).not.toContain('[circular]');
  });

  it('flattens an error with its stack frames', () => {
    const error = new TypeError('x is not a function');
    error.stack = 'TypeError: x is not a function\n    at run (app.ts:1:1)\n    at go (app.ts:2:2)';
    expect(flattenPayload(error)).toEqual([
      { depth: 0, key: null, value: 'TypeError: x is not a function' },
      { depth: 1, key: 'message', value: '"x is not a function"' },
      { depth: 1, key: 'stack', value: '' },
      { depth: 2, key: null, value: 'at run (app.ts:1:1)' },
      { depth: 2, key: null, value: 'at go (app.ts:2:2)' },
    ]);
  });

  it('keeps the own properties hung on an error', () => {
    const error = new Error('failed');
    error.stack = 'Error: failed';
    Object.assign(error, { code: 'ENOENT' });
    expect(flattenPayload(error)).toEqual([
      { depth: 0, key: null, value: 'Error: failed' },
      { depth: 1, key: 'message', value: '"failed"' },
      { depth: 2, key: 'code', value: '"ENOENT"' },
    ]);
  });

  it('flattens an error nested inside a payload', () => {
    const error = new Error('nope');
    error.stack = 'Error: nope';
    const lines = flattenPayload({ cause: error });
    expect(lines[0]).toEqual({ depth: 0, key: 'cause', value: 'Error: nope' });
    expect(lines[1]).toEqual({ depth: 1, key: 'message', value: '"nope"' });
  });

  it('summarises the lines it did not print', () => {
    const lines = flattenPayload([1, 2, 3, 4, 5], { maxLines: 3 });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toEqual({ depth: 0, key: null, value: '+2 more' });
  });
});

describe('payloadLineText', () => {
  it('indents by depth and names the key', () => {
    expect(payloadLineText({ depth: 0, key: 'pid', value: '3' })).toBe('    pid: 3');
    expect(payloadLineText({ depth: 2, key: null, value: 'at run' })).toBe('        at run');
    expect(payloadLineText({ depth: 1, key: 'stack', value: '' })).toBe('      stack:');
  });
});

describe('formatConsoleArgs', () => {
  it('joins the arguments the way they were printed', () => {
    expect(formatConsoleArgs(['count', 3, true])).toEqual({ message: 'count 3 true' });
  });

  it('keeps a single object as the payload', () => {
    const data = { pid: 3 };
    expect(formatConsoleArgs(['start', data])).toEqual({ message: 'start {…}', data });
  });

  it('keeps several objects as a list', () => {
    const a = { a: 1 };
    const b = [2];
    expect(formatConsoleArgs([a, b])).toEqual({ message: '{…} Array(1)', data: [a, b] });
  });

  it('has an empty message when nothing was printed', () => {
    expect(formatConsoleArgs([])).toEqual({ message: '' });
  });

  it('does not treat null as a payload', () => {
    expect(formatConsoleArgs([null])).toEqual({ message: 'null' });
  });
});

describe('describeThrown', () => {
  it('names an error and keeps it as the payload', () => {
    const error = new RangeError('out of range');
    expect(describeThrown(error)).toEqual({ message: 'RangeError: out of range', data: error });
  });

  it('takes a thrown string as the message', () => {
    expect(describeThrown('boom')).toEqual({ message: 'boom' });
  });

  it('previews anything else', () => {
    expect(describeThrown(7)).toEqual({ message: '7' });
    const value = { reason: 'x' };
    expect(describeThrown(value)).toEqual({ message: '{…}', data: value });
  });
});

describe('serializeRecord', () => {
  it('writes one line when there is no payload', () => {
    expect(serializeRecord(record())).toBe(
      '2026-09-04 03:04:05.006  info   kernel  launch lumen.notes pid=3',
    );
  });

  it('indents the payload under the entry', () => {
    const text = serializeRecord(record({ level: 'error', data: { pid: 3 } }));
    expect(text.split('\n')).toEqual([
      '2026-09-04 03:04:05.006  error  kernel  launch lumen.notes pid=3',
      '    pid: 3',
    ]);
  });

  it('indents the continuation of a multi-line message', () => {
    const text = serializeRecord(record({ message: 'first\nsecond' }));
    expect(text.endsWith('kernel  first\n    second')).toBe(true);
  });
});

describe('serializeLog', () => {
  const meta = {
    exportedAt: AT,
    captured: 12,
    levels: ['warn', 'error'] as const,
    sources: null,
    search: '',
  };

  it('heads the file with what was kept', () => {
    const text = serializeLog([record()], meta);
    expect(text.split('\n').slice(0, 5)).toEqual([
      '# Lumen Console',
      '# exported 2026-09-04 03:04:05.006',
      '# 1 of 12 captured entries',
      '# levels warn,error',
      '# sources all',
    ]);
  });

  it('names the sources and the search when they narrow the view', () => {
    const text = serializeLog([], { ...meta, sources: ['kernel'], search: '/fail/i' });
    expect(text).toContain('# sources kernel');
    expect(text).toContain('# search /fail/i');
  });

  it('says when no level is shown', () => {
    expect(serializeLog([], { ...meta, levels: [] })).toContain('# levels none');
  });

  it('ends with a newline and writes every record', () => {
    const text = serializeLog([record({ id: 1 }), record({ id: 2, message: 'second' })], meta);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('second');
    expect(text.trimEnd().split('\n')).toHaveLength(7);
  });
});

describe('exportFileName', () => {
  it('names the file after the moment it was written', () => {
    expect(exportFileName(AT)).toBe('console-2026-09-04-030405.log');
  });

  it('still has a name when the clock does not', () => {
    expect(exportFileName(Number.NaN)).toBe('console.log');
  });
});
