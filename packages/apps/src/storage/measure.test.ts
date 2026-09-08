import type { DirEntry } from '@lumen/vfs';
import { VfsError } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import { readBrowserEstimate, readTrash, readUsageSources, type TrashVfs } from './measure';
import { REASONS } from './usage';

describe('readBrowserEstimate', () => {
  it('reads usage and quota when the browser offers them', async () => {
    const reading = await readBrowserEstimate({
      estimate: async () => ({ usage: 10, quota: 100 }),
    });
    expect(reading.browser).toEqual({ usage: 10, quota: 100 });
    expect(reading.browserReason).toBeUndefined();
  });

  it('says the API is missing rather than reporting zero', async () => {
    const reading = await readBrowserEstimate(undefined);
    expect(reading.browser).toBeNull();
    expect(reading.browserReason).toBe(REASONS.estimateMissing);
  });

  it('says the estimate was refused when the call throws', async () => {
    const reading = await readBrowserEstimate({
      estimate: () => Promise.reject(new Error('denied')),
    });
    expect(reading.browser).toBeNull();
    expect(reading.browserReason).toBe(REASONS.estimateFailed);
  });

  it('keeps a partial estimate partial', async () => {
    const reading = await readBrowserEstimate({ estimate: async () => ({ usage: 5 }) });
    expect(reading.browser).toEqual({ usage: 5, quota: null });
  });
});

describe('readUsageSources', () => {
  const vfs = {
    adapter: { id: 'indexeddb' },
    usage: async () => ({ used: 20, quota: 200 }),
  };

  it('gathers both sources under the adapter that answered', async () => {
    const sources = await readUsageSources(vfs, { estimate: async () => ({ usage: 25 }) });
    expect(sources).toMatchObject({
      adapterId: 'indexeddb',
      adapter: { used: 20, quota: 200 },
      browser: { usage: 25, quota: null },
    });
  });

  it('keeps going when the file system will not answer', async () => {
    const sources = await readUsageSources(
      { adapter: { id: 'memory' }, usage: () => Promise.reject(new Error('nope')) },
      undefined,
    );
    expect(sources.adapter).toBeNull();
    expect(sources.browserReason).toBe(REASONS.estimateMissing);
  });
});

function entry(path: string, kind: DirEntry['kind'], size = 0): DirEntry {
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    kind,
    size,
    modifiedAt: 0,
    createdAt: 0,
  };
}

function trashVfs(options: { exists: boolean; deny?: boolean }): TrashVfs {
  return {
    trashPath: '/Trash',
    exists: async () => options.exists,
    async readDir(path) {
      if (options.deny) throw new VfsError('EACCES', path, 'permission denied');
      return path === '/Trash'
        ? [entry('/Trash/old.zip', 'file', 300), entry('/Trash/notes.txt', 'file', 40)]
        : [];
    },
  };
}

const immediate = { yieldTo: () => Promise.resolve() };

describe('readTrash', () => {
  it('measures what is in the Trash', async () => {
    const reading = await readTrash(trashVfs({ exists: true }), immediate);
    expect(reading.total).toEqual({ bytes: 340, files: 2 });
  });

  it('treats a Trash that was never created as empty, not unknown', async () => {
    const reading = await readTrash(trashVfs({ exists: false }), immediate);
    expect(reading.total).toEqual({ bytes: 0, files: 0 });
    expect(reading.reason).toBeUndefined();
  });

  it('reports a Trash it cannot read as unknown, with the reason', async () => {
    const reading = await readTrash(trashVfs({ exists: true, deny: true }), immediate);
    expect(reading.total).toBeNull();
    expect(reading.reason).toContain('permission denied');
  });
});
