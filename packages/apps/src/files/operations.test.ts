import { MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  describeFailures,
  duplicateAll,
  importHostFiles,
  readTextPreview,
  restoreAll,
  transferInto,
  trashAll,
} from './operations';

let vfs: Vfs;

beforeEach(async () => {
  vfs = new Vfs(new MemoryAdapter());
  await vfs.mkdir('/home/docs', { recursive: true });
  await vfs.mkdir('/home/pics', { recursive: true });
  await vfs.writeText('/home/docs/a.txt', 'hello');
  await vfs.writeText('/home/docs/b.txt', 'world');
  await vfs.writeText('/home/pics/p.png', 'png');
});

const names = async (dir: string) => (await vfs.readDir(dir)).map((e) => e.name);

describe('createDocument', () => {
  it('creates each document type with its template and a free name', async () => {
    expect(await createDocument(vfs, '/home', 'text')).toBe('/home/untitled.txt');
    expect(await createDocument(vfs, '/home', 'text')).toBe('/home/untitled 2.txt');
    const writer = await createDocument(vfs, '/home', 'writer');
    expect(await vfs.readJson(writer)).toEqual({ version: 1, html: '' });
    const sheet = await createDocument(vfs, '/home', 'sheet');
    expect(await vfs.readJson(sheet)).toEqual({
      version: 1,
      sheets: [{ name: 'Sheet 1', cells: {} }],
    });
    const slides = await createDocument(vfs, '/home', 'slides');
    expect(await vfs.readJson(slides)).toEqual({ version: 1, title: 'Untitled', slides: [] });
  });
});

describe('transferInto', () => {
  it('moves items and skips ones already in the target', async () => {
    const r = await transferInto(
      vfs,
      ['/home/docs/a.txt', '/home/pics/p.png'],
      '/home/pics',
      'move',
    );
    expect(r.done).toEqual(['/home/pics/a.txt']);
    expect(r.failed).toEqual([]);
    expect(await names('/home/docs')).toEqual(['b.txt']);
    expect(await names('/home/pics')).toEqual(['a.txt', 'p.png']);
  });

  it('copies with collision-safe names', async () => {
    await vfs.writeText('/home/pics/a.txt', 'other');
    const r = await transferInto(vfs, ['/home/docs/a.txt'], '/home/pics', 'copy');
    expect(r.done).toEqual(['/home/pics/a 2.txt']);
    expect(await vfs.readText('/home/docs/a.txt')).toBe('hello');
    expect(await vfs.readText('/home/pics/a 2.txt')).toBe('hello');
  });

  it('refuses a folder into itself but continues with the rest', async () => {
    const r = await transferInto(vfs, ['/home/docs', '/home/pics/p.png'], '/home/docs', 'move');
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]?.path).toBe('/home/docs');
    expect(r.done).toEqual(['/home/docs/p.png']);
  });

  it('reports missing sources', async () => {
    const r = await transferInto(vfs, ['/nope'], '/home', 'move');
    expect(r.failed[0]?.path).toBe('/nope');
    expect(describeFailures(r, 'move')).toMatch(/Could not move nope/);
    expect(describeFailures({ done: [], failed: [] }, 'move')).toBeNull();
  });
});

describe('duplicate, trash, restore', () => {
  it('duplicates next to the original', async () => {
    const r = await duplicateAll(vfs, ['/home/docs/a.txt']);
    expect(r.done).toEqual(['/home/docs/a copy.txt']);
    expect(await vfs.readText('/home/docs/a copy.txt')).toBe('hello');
  });

  it('trashes and puts back to the origin', async () => {
    const t = await trashAll(vfs, ['/home/docs/a.txt', '/home/pics']);
    expect(t.done).toEqual(['/Trash/a.txt', '/Trash/pics']);
    expect(await names('/home/docs')).toEqual(['b.txt']);
    const r = await restoreAll(vfs, t.done);
    expect(r.done).toEqual(['/home/docs/a.txt', '/home/pics']);
    expect(await vfs.readText('/home/docs/a.txt')).toBe('hello');
    expect(await vfs.exists('/home/pics/p.png')).toBe(true);
  });

  it('deletes permanently when trashing inside the trash', async () => {
    await trashAll(vfs, ['/home/docs/a.txt']);
    await trashAll(vfs, ['/Trash/a.txt']);
    expect(await vfs.exists('/Trash/a.txt')).toBe(false);
  });
});

describe('importHostFiles', () => {
  it('writes each host file into the folder', async () => {
    const files = [
      new File(['abc'], 'note.txt'),
      new File([new Uint8Array([1, 2, 3])], 'blob.bin'),
    ];
    const r = await importHostFiles(vfs, '/home', files);
    expect(r.done).toEqual(['/home/note.txt', '/home/blob.bin']);
    expect(await vfs.readText('/home/note.txt')).toBe('abc');
    expect((await vfs.stat('/home/blob.bin')).size).toBe(3);
  });
});

describe('readTextPreview', () => {
  it('returns the text, truncates long files and refuses big ones', async () => {
    expect(await readTextPreview(vfs, '/home/docs/a.txt')).toBe('hello');
    await vfs.writeText(
      '/home/long.txt',
      Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'),
    );
    const long = await readTextPreview(vfs, '/home/long.txt', { maxLines: 5 });
    expect(long?.split('\n')).toHaveLength(6);
    expect(long?.endsWith('…')).toBe(true);
    expect(await readTextPreview(vfs, '/home/long.txt', { maxBytes: 10 })).toBeNull();
  });
});
