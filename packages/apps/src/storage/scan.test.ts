import type { DirEntry } from '@lumen/vfs';
import { VfsError } from '@lumen/vfs';
import { describe, expect, it, vi } from 'vitest';
import { progressLabel, type ScanFs, scan } from './scan';

function entry(path: string, kind: DirEntry['kind'], size = 0): DirEntry {
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    kind,
    size,
    modifiedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
  };
}

/** A directory listing table, plus the paths that refuse to be read. */
function fakeFs(tree: Record<string, DirEntry[]>, denied: Record<string, string> = {}): ScanFs {
  return {
    async readDir(path) {
      const reason = denied[path];
      if (reason) throw new VfsError('EACCES', path, reason);
      const listing = tree[path];
      if (!listing) throw new VfsError('ENOENT', path);
      return listing;
    },
  };
}

const HOME = '/Users/ada';

const TREE: Record<string, DirEntry[]> = {
  [HOME]: [
    entry(`${HOME}/Documents`, 'directory'),
    entry(`${HOME}/Pictures`, 'directory'),
    entry(`${HOME}/todo.txt`, 'file', 10),
  ],
  [`${HOME}/Documents`]: [
    entry(`${HOME}/Documents/report.pdf`, 'file', 500),
    entry(`${HOME}/Documents/drafts`, 'directory'),
  ],
  [`${HOME}/Documents/drafts`]: [entry(`${HOME}/Documents/drafts/one.txt`, 'file', 40)],
  [`${HOME}/Pictures`]: [entry(`${HOME}/Pictures/sunset.png`, 'file', 2000)],
};

const immediate = { yieldTo: () => Promise.resolve(), batch: 1 };

describe('scan', () => {
  it('counts every file below the root', async () => {
    const result = await scan(fakeFs(TREE), HOME, immediate);
    expect(result.files.map((f) => f.path).sort()).toEqual([
      `${HOME}/Documents/drafts/one.txt`,
      `${HOME}/Documents/report.pdf`,
      `${HOME}/Pictures/sunset.png`,
      `${HOME}/todo.txt`,
    ]);
    expect(result.bytes).toBe(2550);
    expect(result.directories).toBe(4);
    expect(result.complete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('keeps each file size and modification time', async () => {
    const result = await scan(fakeFs(TREE), HOME, immediate);
    const file = result.files.find((f) => f.path.endsWith('sunset.png'));
    expect(file).toMatchObject({ size: 2000, modifiedAt: 1_700_000_000_000 });
  });

  it('yields to the event loop between batches', async () => {
    const yieldTo = vi.fn(() => Promise.resolve());
    await scan(fakeFs(TREE), HOME, { yieldTo, batch: 2 });
    expect(yieldTo).toHaveBeenCalled();
  });

  it('reports progress with the folder it is reading', async () => {
    const seen: string[] = [];
    const result = await scan(fakeFs(TREE), HOME, {
      ...immediate,
      onProgress: (p) => seen.push(p.path),
    });
    expect(seen[0]).toBe(HOME);
    expect(seen).toContain(`${HOME}/Documents`);
    expect(seen).toHaveLength(result.directories);
  });

  it('collects a refused directory and keeps walking', async () => {
    const denied = { [`${HOME}/Pictures`]: 'permission denied' };
    const result = await scan(fakeFs(TREE, denied), HOME, immediate);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe(`${HOME}/Pictures`);
    expect(result.errors[0]?.message).toContain('permission denied');
    expect(result.complete).toBe(true);
    expect(result.bytes).toBe(550);
  });

  it('reports a root it cannot read as an error, not as an empty home', async () => {
    const result = await scan(fakeFs({}), HOME, immediate);
    expect(result.errors).toHaveLength(1);
    expect(result.files).toEqual([]);
    expect(result.directories).toBe(0);
  });

  it('stops when the signal aborts and says the result is partial', async () => {
    const controller = new AbortController();
    const result = await scan(fakeFs(TREE), HOME, {
      batch: 1,
      signal: controller.signal,
      yieldTo: async () => controller.abort(),
    });
    expect(result.complete).toBe(false);
    expect(result.files.length).toBeLessThan(4);
  });

  it('stops at the entry ceiling and marks the result truncated', async () => {
    const result = await scan(fakeFs(TREE), HOME, { ...immediate, maxEntries: 2 });
    expect(result.truncated).toBe(true);
    expect(result.complete).toBe(false);
  });

  it('reads a directory once even if two listings mention it', async () => {
    const looped: Record<string, DirEntry[]> = {
      [HOME]: [entry(`${HOME}/a`, 'directory'), entry(`${HOME}/a`, 'directory')],
      [`${HOME}/a`]: [entry(`${HOME}/a/x.txt`, 'file', 7)],
    };
    const result = await scan(fakeFs(looped), HOME, immediate);
    expect(result.files).toHaveLength(1);
    expect(result.bytes).toBe(7);
  });

  it('treats a missing or negative size as zero rather than as a negative total', async () => {
    const odd: Record<string, DirEntry[]> = {
      [HOME]: [entry(`${HOME}/a.bin`, 'file', -3), entry(`${HOME}/b.bin`, 'file', Number.NaN)],
    };
    const result = await scan(fakeFs(odd), HOME, immediate);
    expect(result.bytes).toBe(0);
    expect(result.files.map((f) => f.size)).toEqual([0, 0]);
  });

  it('times the scan', async () => {
    let clock = 100;
    const result = await scan(fakeFs(TREE), HOME, { ...immediate, now: () => (clock += 50) });
    expect(result.finishedAt).toBeGreaterThan(result.startedAt);
  });
});

describe('progressLabel', () => {
  it('reads as a sentence in both singular and plural', () => {
    expect(progressLabel({ files: 1, directories: 1, bytes: 0, path: '/' })).toBe(
      '1 file in 1 folder',
    );
    expect(progressLabel({ files: 0, directories: 12, bytes: 0, path: '/' })).toBe(
      '0 files in 12 folders',
    );
  });
});
