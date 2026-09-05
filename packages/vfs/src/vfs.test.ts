import { beforeEach, describe, expect, it } from 'vitest';
import { VfsError } from './errors';
import { IndexedDbAdapter } from './idb';
import { MemoryAdapter } from './memory';
import { basename } from './path';
import type { VfsAdapter } from './types';
import { Vfs } from './vfs';

const adapters: Array<[string, () => VfsAdapter]> = [
  ['memory', () => new MemoryAdapter()],
  ['indexeddb', () => new IndexedDbAdapter(`test-${Math.random().toString(36).slice(2)}`)],
];

describe.each(adapters)('Vfs over %s adapter', (_name, make) => {
  let fs: Vfs;
  beforeEach(() => {
    fs = new Vfs(make());
  });

  it('creates directories recursively and lists them sorted', async () => {
    await fs.mkdir('/Users/me/Documents', { recursive: true });
    await fs.writeText('/Users/me/b.txt', 'b');
    await fs.writeText('/Users/me/a.txt', 'a');
    const names = (await fs.readDir('/Users/me')).map((e) => e.name);
    expect(names).toEqual(['Documents', 'a.txt', 'b.txt']);
  });

  it('round-trips text and json', async () => {
    await fs.writeJson('/System/settings.json', { theme: 'dark' }, { recursive: true });
    expect(await fs.readJson<{ theme: string }>('/System/settings.json')).toEqual({
      theme: 'dark',
    });
    expect(await fs.readText('/System/settings.json')).toContain('"theme": "dark"');
    const st = await fs.stat('/System/settings.json');
    expect(st.kind).toBe('file');
    expect(st.size).toBeGreaterThan(10);
  });

  it('throws typed errors', async () => {
    await expect(fs.readFile('/missing')).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.mkdir('/dir');
    await expect(fs.readFile('/dir')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(fs.mkdir('/dir')).rejects.toMatchObject({ code: 'EEXIST' });
    await fs.writeText('/dir/f', 'x');
    await expect(fs.adapter.remove('/dir')).rejects.toMatchObject({ code: 'ENOTEMPTY' });
    await expect(fs.readDir('/dir/f')).rejects.toMatchObject({ code: 'ENOTDIR' });
    expect(VfsError.is(new VfsError('ENOENT', '/x'), 'ENOENT')).toBe(true);
  });

  it('renames files and directories', async () => {
    await fs.mkdir('/a/b', { recursive: true });
    await fs.writeText('/a/b/c.txt', 'c');
    await fs.rename('/a', '/z');
    expect(await fs.readText('/z/b/c.txt')).toBe('c');
    expect(await fs.exists('/a')).toBe(false);
    await expect(fs.rename('/z', '/z/b/inner')).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('copies trees and resolves name collisions', async () => {
    await fs.mkdir('/src/sub', { recursive: true });
    await fs.writeText('/src/sub/file.txt', 'hi');
    await fs.mkdir('/dst');
    const first = await fs.copyInto('/src', '/dst');
    const second = await fs.copyInto('/src', '/dst');
    expect(first).toBe('/dst/src');
    expect(second).toBe('/dst/src 2');
    expect(await fs.readText('/dst/src 2/sub/file.txt')).toBe('hi');
    const dup = await fs.copyInto('/src/sub/file.txt', '/src/sub');
    expect(dup).toBe('/src/sub/file copy.txt');
  });

  it('trashes, restores and empties', async () => {
    await fs.mkdir('/Users/me', { recursive: true });
    await fs.writeText('/Users/me/note.txt', 'n');
    const trashed = await fs.trash('/Users/me/note.txt');
    expect(trashed).toBe('/Trash/note.txt');
    expect(await fs.trashOrigin(trashed)).toBe('/Users/me/note.txt');
    const restored = await fs.restoreFromTrash(trashed);
    expect(restored).toBe('/Users/me/note.txt');
    await fs.trash('/Users/me/note.txt');
    await fs.emptyTrash();
    expect((await fs.readDir('/Trash')).filter((e) => !e.name.startsWith('.'))).toHaveLength(0);
  });

  it('emits change events', async () => {
    const events: string[] = [];
    const off = fs.subscribe((e) => events.push(`${e.type}:${e.path}`));
    await fs.writeText('/x.txt', '1');
    await fs.writeText('/x.txt', '2');
    await fs.rename('/x.txt', '/y.txt');
    await fs.remove('/y.txt');
    off();
    await fs.writeText('/z.txt', '3');
    expect(events).toEqual(['create:/x.txt', 'change:/x.txt', 'rename:/x.txt', 'remove:/y.txt']);
  });

  it('searches and computes usage', async () => {
    await fs.mkdir('/Users/me/Documents', { recursive: true });
    await fs.writeText('/Users/me/Documents/Report.md', '# r');
    await fs.writeText('/Users/me/Documents/.hidden-report', '');
    await fs.writeText('/Users/me/other.txt', 'xx');
    const hits = await fs.search('/', { query: 'report' });
    expect(hits.map((h) => h.name)).toEqual(['Report.md']);
    expect(await fs.du('/Users')).toBe(5);
  });
});

describe('the trash index cannot be clobbered by a file of the same name', () => {
  it('moves a user file called .trash-index.json aside rather than onto the index', async () => {
    const fs = new Vfs(new MemoryAdapter());
    await fs.mkdir('/U', { recursive: true });
    await fs.writeText('/U/.trash-index.json', 'IMPORTANT USER DATA');

    const dest = await fs.trash('/U/.trash-index.json');

    expect(dest).not.toBe('/Trash/.trash-index.json');
    expect(await fs.readText(dest)).toBe('IMPORTANT USER DATA');
    // And the real index is still an index, holding the entry for that file.
    const index = await fs.readJson<Record<string, { origin: string }>>('/Trash/.trash-index.json');
    expect(index[basename(dest)]?.origin).toBe('/U/.trash-index.json');
  });

  it('restores it to where it came from', async () => {
    const fs = new Vfs(new MemoryAdapter());
    await fs.mkdir('/U', { recursive: true });
    await fs.writeText('/U/.trash-index.json', 'IMPORTANT USER DATA');
    const dest = await fs.trash('/U/.trash-index.json');

    const back = await fs.restoreFromTrash(dest);

    expect(back).toBe('/U/.trash-index.json');
    expect(await fs.readText(back)).toBe('IMPORTANT USER DATA');
  });
});

describe('renaming a directory onto a file', () => {
  it('is refused, rather than silently destroying the file', async () => {
    const fs = new Vfs(new MemoryAdapter());
    await fs.mkdir('/d');
    await fs.writeText('/d/inner.txt', 'i');
    await fs.writeText('/f.txt', 'PAYROLL');

    await expect(fs.rename('/d', '/f.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });

    expect(await fs.readText('/f.txt')).toBe('PAYROLL');
    expect((await fs.stat('/f.txt')).kind).toBe('file');
  });
});
