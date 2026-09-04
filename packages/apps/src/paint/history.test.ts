import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  clear,
  createHistory,
  depth,
  type History,
  type HistoryLimits,
  push,
  redo,
  totalBytes,
  undo,
} from './history';

const limits: HistoryLimits<string> = { depth: 3 };

const pushAll = (start: History<string>, entries: string[], caps = limits) =>
  entries.reduce((history, entry) => push(history, entry, caps), start);

describe('createHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createHistory('a');
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(depth(history)).toBe(0);
  });
});

describe('push', () => {
  it('moves the old present onto the undo stack', () => {
    const history = push(createHistory('a'), 'b', limits);
    expect(history.present).toBe('b');
    expect(history.past).toEqual(['a']);
    expect(canUndo(history)).toBe(true);
  });

  it('caps the depth by dropping the oldest state', () => {
    const history = pushAll(createHistory('a'), ['b', 'c', 'd', 'e']);
    expect(history.past).toEqual(['b', 'c', 'd']);
    expect(depth(history)).toBe(3);
    expect(history.present).toBe('e');
  });

  it('keeps only the present at depth zero', () => {
    const history = pushAll(createHistory('a'), ['b', 'c'], { depth: 0 });
    expect(history.past).toEqual([]);
    expect(canUndo(history)).toBe(false);
    expect(history.present).toBe('c');
  });
});

describe('undo and redo', () => {
  it('walks back and forward through the states', () => {
    const start = pushAll(createHistory('a'), ['b', 'c']);
    const back = undo(start);
    expect(back.present).toBe('b');
    expect(canRedo(back)).toBe(true);
    const further = undo(back);
    expect(further.present).toBe('a');
    expect(canUndo(further)).toBe(false);
    expect(redo(redo(further)).present).toBe('c');
  });

  it('does nothing at either end, and says so by returning the same history', () => {
    const start = createHistory('a');
    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
    const one = push(start, 'b', limits);
    expect(redo(one)).toBe(one);
    expect(undo(undo(one))).toEqual({ past: [], present: 'a', future: ['b'] });
  });

  it('holds an undefined entry as a real state', () => {
    const start = createHistory<string | undefined>('a');
    const history = push(start, undefined, { depth: 3 });
    expect(history.present).toBeUndefined();
    expect(undo(history).present).toBe('a');
  });
});

describe('a push after an undo', () => {
  it('truncates the redo branch', () => {
    const start = pushAll(createHistory('a'), ['b', 'c']);
    const back = undo(start);
    expect(back.future).toEqual(['c']);
    const branched = push(back, 'x', limits);
    expect(branched.present).toBe('x');
    expect(branched.future).toEqual([]);
    expect(canRedo(branched)).toBe(false);
    expect(branched.past).toEqual(['a', 'b']);
    expect(undo(branched).present).toBe('b');
  });

  it('leaves the branch unreachable however far back the undo went', () => {
    const start = pushAll(createHistory('a'), ['b', 'c', 'd']);
    const branched = push(undo(undo(start)), 'x', limits);
    expect(branched.present).toBe('x');
    expect(branched.past).toEqual(['a', 'b']);
    expect(canRedo(branched)).toBe(false);
  });
});

describe('the byte budget', () => {
  const sizeOf = (entry: string) => entry.length;
  const budget: HistoryLimits<string> = { depth: 10, maxBytes: 10, sizeOf };

  it('drops the oldest states until the stack fits', () => {
    const history = pushAll(createHistory('aaaa'), ['bbbb', 'cccc', 'dddd'], budget);
    expect(totalBytes(history, sizeOf)).toBeLessThanOrEqual(10);
    expect(history.past).toEqual(['cccc']);
    expect(history.present).toBe('dddd');
  });

  it('keeps the present even when it alone breaks the budget', () => {
    const history = push(createHistory('aa'), 'z'.repeat(40), budget);
    expect(history.past).toEqual([]);
    expect(history.present).toHaveLength(40);
  });

  it('is inert without a sizeOf', () => {
    const history = pushAll(createHistory('aaaa'), ['bbbb', 'cccc'], {
      depth: 10,
      maxBytes: 1,
    });
    expect(history.past).toEqual(['aaaa', 'bbbb']);
  });

  it('counts the redo branch as well', () => {
    const full = pushAll(createHistory('aaaa'), ['bbbb', 'cccc'], budget);
    expect(totalBytes(undo(full), sizeOf)).toBe(totalBytes(full, sizeOf));
  });
});

describe('clear', () => {
  it('keeps what is on screen and forgets both stacks', () => {
    const history = clear(undo(pushAll(createHistory('a'), ['b', 'c'])));
    expect(history.present).toBe('b');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('can be handed a replacement present, for a newly opened file', () => {
    expect(clear(pushAll(createHistory('a'), ['b']), 'fresh')).toEqual({
      past: [],
      present: 'fresh',
      future: [],
    });
  });
});
