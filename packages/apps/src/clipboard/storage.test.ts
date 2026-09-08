import { describe, expect, it } from 'vitest';
import { type ClipEntry, clipKey, mergeHistory } from './entry';
import {
  type ClipboardData,
  clearHistory,
  DEFAULT_DATA,
  DISMISSED_LIMIT,
  normalizeData,
  PIN_LIMIT,
  pinEntry,
  removeEntry,
  unpinEntry,
} from './storage';

const entry = (text: string, copiedAt: number): ClipEntry =>
  mergeHistory([{ kind: 'text', text, copiedAt }])[0] as ClipEntry;

const fileEntry = (paths: string[], operation: 'copy' | 'cut', copiedAt: number): ClipEntry =>
  mergeHistory([{ kind: 'files', files: { paths, operation }, copiedAt }])[0] as ClipEntry;

const data = (patch: Partial<ClipboardData> = {}): ClipboardData => ({
  ...DEFAULT_DATA,
  pins: [],
  dismissed: [],
  ...patch,
});

describe('reading the file back', () => {
  it('takes anything that is not the shape it expects as an empty file', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('nonsense')).toEqual(DEFAULT_DATA);
    expect(normalizeData({ pins: 'no', dismissed: 7, clearedBefore: 'soon' })).toEqual(
      DEFAULT_DATA,
    );
  });

  it('drops pins with nothing in them and keeps the ones that hold something', () => {
    const read = normalizeData({
      pins: [
        { kind: 'text', text: 'keep me', copiedAt: 10, pinnedAt: 20 },
        { kind: 'text', text: '', copiedAt: 10, pinnedAt: 21 },
        { kind: 'files', files: { paths: [], operation: 'copy' }, copiedAt: 10, pinnedAt: 22 },
        {
          kind: 'files',
          files: { paths: ['/a/b.txt'], operation: 'cut' },
          copiedAt: 10,
          pinnedAt: 23,
        },
        'not an object',
      ],
    });
    expect(read.pins.map((pin) => pin.kind)).toEqual(['files', 'text']);
  });

  it('recomputes the key from the content instead of believing the file', () => {
    const read = normalizeData({
      pins: [{ kind: 'text', text: 'hello', key: 'text:0:lies', copiedAt: 1, pinnedAt: 2 }],
    });
    expect(read.pins[0]?.key).toBe(clipKey({ kind: 'text', text: 'hello', files: null }));
  });

  it('keeps one pin per content, newest pin first, and caps the list', () => {
    const many = Array.from({ length: PIN_LIMIT + 10 }, (_, i) => ({
      kind: 'text',
      text: `snippet ${i}`,
      copiedAt: i,
      pinnedAt: i,
    }));
    const read = normalizeData({
      pins: [...many, { kind: 'text', text: 'snippet 0', pinnedAt: 999 }],
    });
    expect(read.pins).toHaveLength(PIN_LIMIT);
    expect(read.pins[0]?.pinnedAt).toBe(PIN_LIMIT + 9);
  });

  it('keeps the latest removal per content and forgets those Clear All covers', () => {
    const read = normalizeData({
      clearedBefore: 100,
      dismissed: [
        { key: 'a', at: 50 },
        { key: 'a', at: 400 },
        { key: 'a', at: 200 },
        { key: 'b', at: 90 },
        { key: 'c' },
        { at: 300 },
      ],
    });
    expect(read.dismissed).toEqual([{ key: 'a', at: 400 }]);
  });

  it('caps how many removals it remembers, keeping the most recent', () => {
    const dismissed = Array.from({ length: DISMISSED_LIMIT + 25 }, (_, i) => ({
      key: `k${i}`,
      at: i + 1,
    }));
    const read = normalizeData({ dismissed });
    expect(read.dismissed).toHaveLength(DISMISSED_LIMIT);
    expect(read.dismissed[0]?.at).toBe(DISMISSED_LIMIT + 25);
  });

  it('refuses a negative or unreadable Clear All time', () => {
    expect(normalizeData({ clearedBefore: -5 }).clearedBefore).toBe(0);
    expect(normalizeData({ clearedBefore: Number.NaN }).clearedBefore).toBe(0);
  });

  it('reads back exactly what it wrote, through JSON', () => {
    let file = data();
    file = pinEntry(file, entry('pinned text', 10), 11);
    file = pinEntry(file, fileEntry(['/a/one.txt', '/a/two.txt'], 'cut', 20), 21);
    file = removeEntry(file, entry('unwanted', 30));
    file = clearHistory(file, 5);
    expect(normalizeData(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });
});

describe('pinning', () => {
  it('keeps this app’s own copy of the item, with the time it was pinned', () => {
    const after = pinEntry(data(), entry('remember', 10), 99);
    expect(after.pins).toHaveLength(1);
    expect(after.pins[0]).toMatchObject({
      kind: 'text',
      text: 'remember',
      copiedAt: 10,
      pinnedAt: 99,
    });
  });

  it('does nothing the second time', () => {
    const once = pinEntry(data(), entry('remember', 10), 99);
    expect(pinEntry(once, entry('remember', 40), 120)).toBe(once);
  });

  it('cancels an earlier removal of the same content', () => {
    const removed = removeEntry(data(), entry('remember', 10));
    expect(removed.dismissed).toHaveLength(1);
    expect(pinEntry(removed, entry('remember', 10), 99).dismissed).toEqual([]);
  });

  it('unpins by key, and leaves the file alone when there is no such pin', () => {
    const pinned = pinEntry(data(), entry('remember', 10), 99);
    expect(unpinEntry(pinned, pinned.pins[0]?.key ?? '').pins).toEqual([]);
    expect(unpinEntry(pinned, 'text:0:nothing')).toBe(pinned);
  });
});

describe('removing', () => {
  it('drops the pin and hides the ring’s copy up to the moment it was copied', () => {
    const target = entry('gone', 500);
    const pinned = pinEntry(data(), target, 600);
    const after = removeEntry(pinned, target);
    expect(after.pins).toEqual([]);
    expect(after.dismissed).toEqual([{ key: target.key, at: 500 }]);
  });

  it('moves an existing removal forward rather than adding a second one', () => {
    const first = removeEntry(data(), entry('gone', 100));
    const second = removeEntry(first, entry('gone', 700));
    expect(second.dismissed).toEqual([{ key: entry('gone', 700).key, at: 700 }]);
  });

  it('records nothing when Clear All already covers the item', () => {
    const cleared = clearHistory(data(), 1_000);
    expect(removeEntry(cleared, entry('gone', 400)).dismissed).toEqual([]);
  });
});

describe('Clear All', () => {
  it('keeps the pins and moves the line forward', () => {
    const pinned = pinEntry(data(), entry('kept', 10), 11);
    const after = clearHistory(pinned, 5_000);
    expect(after.pins).toEqual(pinned.pins);
    expect(after.clearedBefore).toBe(5_000);
  });

  it('never moves the line backwards', () => {
    const late = clearHistory(data(), 5_000);
    expect(clearHistory(late, 1_000).clearedBefore).toBe(5_000);
  });

  it('forgets removals it now covers and keeps any that it does not', () => {
    let file = removeEntry(data(), entry('old', 100));
    file = removeEntry(file, entry('later', 9_000));
    const after = clearHistory(file, 5_000);
    expect(after.dismissed).toEqual([{ key: entry('later', 9_000).key, at: 9_000 }]);
  });
});
