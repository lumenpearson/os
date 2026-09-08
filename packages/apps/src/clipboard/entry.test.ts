import type { ClipboardItem } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import {
  type ClipEntry,
  clipKey,
  contentOfItem,
  emptyMessage,
  entryTitle,
  filesTitle,
  kindLabel,
  listSummary,
  matchesQuery,
  mergeHistory,
  operationLabel,
  pinNote,
  previewLine,
  searchEntries,
  textShape,
  visibleEntries,
} from './entry';
import { type ClipboardData, DEFAULT_DATA, pinEntry, removeEntry } from './storage';

const copied = (body: string, copiedAt: number): ClipboardItem => ({
  kind: 'text',
  text: body,
  copiedAt,
});

const moved = (paths: string[], operation: 'copy' | 'cut', copiedAt: number): ClipboardItem => ({
  kind: 'files',
  files: { paths, operation },
  copiedAt,
});

const data = (patch: Partial<ClipboardData> = {}): ClipboardData => ({
  ...DEFAULT_DATA,
  pins: [],
  dismissed: [],
  ...patch,
});

describe('identity by content', () => {
  it('gives the same key to the same text, whenever it was copied', () => {
    const first = contentOfItem(copied('ssh lumen@host', 1_000));
    const second = contentOfItem(copied('ssh lumen@host', 9_000));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first && clipKey(first)).toBe(second && clipKey(second));
  });

  it('separates text from a file operation that spells the same', () => {
    const asText = clipKey({ kind: 'text', text: 'copy\n/a', files: null });
    const asFiles = clipKey({
      kind: 'files',
      text: '',
      files: { paths: ['/a'], operation: 'copy' },
    });
    expect(asText).not.toBe(asFiles);
  });

  it('separates a cut from a copy of the same paths, and one order from another', () => {
    const cut = clipKey({
      kind: 'files',
      text: '',
      files: { paths: ['/a', '/b'], operation: 'cut' },
    });
    const copy = clipKey({
      kind: 'files',
      text: '',
      files: { paths: ['/a', '/b'], operation: 'copy' },
    });
    const swapped = clipKey({
      kind: 'files',
      text: '',
      files: { paths: ['/b', '/a'], operation: 'copy' },
    });
    expect(new Set([cut, copy, swapped]).size).toBe(3);
  });

  it('does not collide across a spread of ordinary snippets', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      keys.add(clipKey({ kind: 'text', text: `line ${i}`, files: null }));
      keys.add(clipKey({ kind: 'text', text: `line ${i}\n`, files: null }));
    }
    expect(keys.size).toBe(1000);
  });
});

describe('reading the kernel’s items', () => {
  it('takes text and file operations as they are', () => {
    expect(contentOfItem(copied('hello', 1))).toEqual({ kind: 'text', text: 'hello', files: null });
    expect(contentOfItem(moved(['/home/ada/a.txt'], 'cut', 1))).toEqual({
      kind: 'files',
      text: '',
      files: { paths: ['/home/ada/a.txt'], operation: 'cut' },
    });
  });

  it('drops items with nothing in them', () => {
    expect(contentOfItem(copied('', 1))).toBeNull();
    expect(contentOfItem({ kind: 'text', copiedAt: 1 })).toBeNull();
    expect(contentOfItem({ kind: 'files', copiedAt: 1 })).toBeNull();
    expect(contentOfItem(moved([], 'copy', 1))).toBeNull();
  });
});

describe('folding the ring into rows', () => {
  it('shows one row per distinct content, at the newest time it was copied', () => {
    const rows = mergeHistory([copied('one', 300), copied('two', 200), copied('one', 100)]);
    expect(rows.map((row) => row.text)).toEqual(['one', 'two']);
    expect(rows[0]?.copiedAt).toBe(300);
  });

  it('keeps the newest time whatever order the ring arrives in', () => {
    // A plausible wrong implementation keeps the first or the last one seen.
    const times = [100, 900, 400, 250, 700];
    for (let seed = 0; seed < times.length; seed += 1) {
      const rotated = [...times.slice(seed), ...times.slice(0, seed)];
      const rows = mergeHistory(rotated.map((at) => copied('same', at)));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.copiedAt).toBe(900);
    }
  });

  it('sorts newest first and skips items with nothing in them', () => {
    const rows = mergeHistory([copied('older', 100), copied('', 500), copied('newer', 400)]);
    expect(rows.map((row) => row.text)).toEqual(['newer', 'older']);
  });
});

describe('what the window shows', () => {
  const history = [copied('third', 300), copied('second', 200), copied('first', 100)];

  it('lists the ring newest first when nothing has been pinned or removed', () => {
    const { pinned, recent } = visibleEntries(history, data());
    expect(pinned).toEqual([]);
    expect(recent.map((entry) => entry.text)).toEqual(['third', 'second', 'first']);
  });

  it('moves a pinned item into its own group rather than showing it twice', () => {
    const entry = mergeHistory(history)[1] as ClipEntry;
    const after = pinEntry(data(), entry, 5_000);
    const { pinned, recent } = visibleEntries(history, after);
    expect(pinned.map((row) => row.text)).toEqual(['second']);
    expect(pinned[0]?.inHistory).toBe(true);
    expect(recent.map((row) => row.text)).toEqual(['third', 'first']);
  });

  it('keeps a pin the ring has rolled past, and says the ring no longer has it', () => {
    const entry = mergeHistory(history)[0] as ClipEntry;
    const after = pinEntry(data(), entry, 5_000);
    const { pinned } = visibleEntries([], after);
    expect(pinned.map((row) => row.text)).toEqual(['third']);
    expect(pinned[0]?.inHistory).toBe(false);
  });

  it('hides a removed item but brings it back when it is copied again', () => {
    const entry = mergeHistory(history)[1] as ClipEntry;
    const after = removeEntry(data(), entry);
    expect(visibleEntries(history, after).recent.map((row) => row.text)).toEqual([
      'third',
      'first',
    ]);

    const recopied = [copied('second', 900), ...history];
    expect(visibleEntries(recopied, after).recent.map((row) => row.text)).toEqual([
      'second',
      'third',
      'first',
    ]);
  });

  it('hides everything copied before Clear All, and keeps the pins', () => {
    const entry = mergeHistory(history)[0] as ClipEntry;
    const after = { ...pinEntry(data(), entry, 5_000), clearedBefore: 250 };
    const { pinned, recent } = visibleEntries(history, after);
    expect(pinned.map((row) => row.text)).toEqual(['third']);
    expect(recent).toEqual([]);
  });
});

describe('searching', () => {
  const entries = mergeHistory([
    copied('The quick brown fox', 300),
    moved(['/home/ada/Documents/report.pdf'], 'copy', 200),
    copied('another line', 100),
  ]);

  it('matches text without minding case, and matches a file by its path', () => {
    expect(searchEntries(entries, 'QUICK').map(entryTitle)).toEqual(['The quick brown fox']);
    expect(searchEntries(entries, 'report').map(entryTitle)).toEqual(['report.pdf']);
  });

  it('treats an empty or blank query as no filter at all', () => {
    expect(searchEntries(entries, '')).toHaveLength(3);
    expect(searchEntries(entries, '   ')).toHaveLength(3);
  });

  it('matches nothing when nothing holds the words', () => {
    expect(searchEntries(entries, 'kangaroo')).toEqual([]);
    const [first] = entries;
    expect(first && matchesQuery(first, 'fox')).toBe(true);
  });
});

describe('what a row prints', () => {
  it('takes the first line with something on it, trimmed', () => {
    expect(previewLine('\n\n   hello  \nworld')).toBe('hello');
    expect(previewLine('one line')).toBe('one line');
  });

  it('has nothing to print for whitespace alone', () => {
    expect(previewLine('   \n\t\n')).toBe('');
  });

  it('cuts a very long first line rather than letting it run', () => {
    const line = previewLine('x'.repeat(500));
    expect(line).toHaveLength(201);
    expect(line.endsWith('…')).toBe(true);
  });

  it('counts characters and lines as they are', () => {
    expect(textShape('a\nb\n')).toEqual({ characters: 4, lines: 3 });
    expect(textShape('')).toEqual({ characters: 0, lines: 0 });
  });

  it('names a file entry by its file, or by the first and a count', () => {
    expect(filesTitle({ paths: ['/home/ada/notes.md'], operation: 'copy' })).toBe('notes.md');
    expect(
      filesTitle({ paths: ['/a/one.txt', '/a/two.txt', '/a/three.txt'], operation: 'copy' }),
    ).toBe('one.txt and 2 more');
    expect(operationLabel({ paths: ['/a'], operation: 'cut' })).toBe('Cut');
  });

  it('says how many files were copied or cut', () => {
    const [one, two] = mergeHistory([
      moved(['/a/one.txt'], 'copy', 200),
      moved(['/a/one.txt', '/a/two.txt'], 'cut', 100),
    ]);
    expect(one && kindLabel(one)).toBe('1 file copied');
    expect(two && kindLabel(two)).toBe('2 files cut');
    expect(kindLabel(mergeHistory([copied('x', 1)])[0] as ClipEntry)).toBe('Text');
  });
});

describe('what the app admits to', () => {
  it('says nothing about pinning for an item that is not pinned', () => {
    expect(pinNote(mergeHistory([copied('x', 1)])[0] as ClipEntry)).toBeNull();
  });

  it('distinguishes a pin the system still holds from one it has rolled past', () => {
    const entry = mergeHistory([copied('x', 1)])[0] as ClipEntry;
    const held = pinNote({ ...entry, pinned: true, pinnedAt: 2, inHistory: true });
    const rolled = pinNote({ ...entry, pinned: true, pinnedAt: 2, inHistory: false });
    expect(held).toContain('still has it');
    expect(rolled).toContain('rolled past');
    expect(held).not.toBe(rolled);
  });

  it('explains the one thing it cannot do only when there is nothing to show', () => {
    const fresh = emptyMessage({ searching: false, nothingCopied: true });
    expect(fresh.description).toContain('cannot read what you copy in another application');
    expect(emptyMessage({ searching: true, nothingCopied: true }).title).toBe('No matches');
    expect(emptyMessage({ searching: false, nothingCopied: false }).description).not.toContain(
      'cannot read',
    );
  });
});

describe('the count in the status bar', () => {
  it('counts what is there, and what a search has left', () => {
    expect(listSummary({ shown: 4, total: 4, pinned: 0 })).toBe('4 items');
    expect(listSummary({ shown: 1, total: 1, pinned: 0 })).toBe('1 item');
    expect(listSummary({ shown: 2, total: 9, pinned: 0 })).toBe('2 of 9 items');
    expect(listSummary({ shown: 9, total: 9, pinned: 3 })).toBe('9 items · 3 pinned');
  });
});
