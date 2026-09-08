import { beforeEach, describe, expect, it } from 'vitest';
import { VfsError } from './errors';
import { IndexedDbAdapter } from './idb';
import { MemoryAdapter } from './memory';
import { basename } from './path';
import { type Elevation, elevate, NO_PROTECTION } from './protection';
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
    await fs.writeJson('/Users/ada/settings.json', { theme: 'dark' }, { recursive: true });
    expect(await fs.readJson<{ theme: string }>('/Users/ada/settings.json')).toEqual({
      theme: 'dark',
    });
    expect(await fs.readText('/Users/ada/settings.json')).toContain('"theme": "dark"');
    const st = await fs.stat('/Users/ada/settings.json');
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

describe('writing to the root', () => {
  it('reports EISDIR whichever adapter is underneath', async () => {
    // The three adapters each rejected this differently — EINVAL, EISDIR and
    // EIO — so a caller branching on the code was right on one platform only.
    for (const adapter of [new MemoryAdapter(), new IndexedDbAdapter('root-code-test')]) {
      const fs = new Vfs(adapter);
      await expect(fs.writeText('/', 'x')).rejects.toMatchObject({ code: 'EISDIR' });
    }
  });
});

describe('copying over a file that already exists', () => {
  /**
   * MemoryAdapter has no copyFile, so it takes the fallback path through
   * writeFile, which was always right. The bug lived in the fast path, which
   * only the Tauri adapter has — so the test has to provide one.
   */
  class CopyingAdapter extends MemoryAdapter {
    async copyFile(from: string, to: string): Promise<void> {
      await this.writeFile(to, await this.readFile(from));
    }
  }

  it('reports a change, not a create, on the adapter fast path', async () => {
    const fs = new Vfs(new CopyingAdapter());
    await fs.writeText('/a.txt', 'A');
    await fs.writeText('/b.txt', 'B');
    const seen: string[] = [];
    const off = fs.subscribe((e) => seen.push(`${e.type}:${e.path}`));

    await fs.copy('/a.txt', '/b.txt');
    await fs.copy('/a.txt', '/c.txt');
    off();

    expect(seen).toContain('change:/b.txt');
    expect(seen).toContain('create:/c.txt');
  });

  it('agrees with the adapter that has no fast path', async () => {
    const plain = new Vfs(new MemoryAdapter());
    await plain.writeText('/a.txt', 'A');
    await plain.writeText('/b.txt', 'B');
    const seen: string[] = [];
    const off = plain.subscribe((e) => seen.push(`${e.type}:${e.path}`));
    await plain.copy('/a.txt', '/b.txt');
    off();
    expect(seen).toContain('change:/b.txt');
  });
});

describe('the paths the system owns', () => {
  const authority = () => ({ elevation: elevate('vfs test') });

  async function withSystem(): Promise<Vfs> {
    const fs = new Vfs(new MemoryAdapter());
    // Even the fixture has to say who it is: creating /System is refused too,
    // or the terminal could put files there that nothing could ever remove.
    await fs.ensureDir('/System/Wallpapers', authority());
    await fs.writeText('/System/kernel.bin', 'boot', authority());
    await fs.mkdir('/Applications', authority());
    await fs.writeText('/Applications/Files.app', '{}');
    await fs.ensureDir('/Users/ada');
    await fs.writeText('/Users/ada/notes.txt', 'mine');
    return fs;
  }

  it('refuses rm -r /System, which is the whole point', async () => {
    const fs = await withSystem();
    const seen: string[] = [];
    const off = fs.subscribe((e) => seen.push(e.type));

    await expect(fs.remove('/System', { recursive: true })).rejects.toMatchObject({
      code: 'EACCES',
    });

    off();
    // Nothing happened: no partial delete, and nothing told the open windows
    // that anything had.
    expect(await fs.exists('/System/kernel.bin')).toBe(true);
    expect(seen).toEqual([]);
  });

  it('refuses to write, remove, rename, or move anything onto a system path', async () => {
    const fs = await withSystem();
    await expect(fs.writeText('/System/kernel.bin', 'x')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.writeText('/System/new.txt', 'x')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.mkdir('/System/Extra')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.remove('/System/kernel.bin')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.rename('/System/kernel.bin', '/Users/ada/k')).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(fs.rename('/Users/ada/notes.txt', '/System/kernel.bin')).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(fs.copy('/Users/ada/notes.txt', '/System/notes.txt')).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(fs.trash('/System')).rejects.toMatchObject({ code: 'EACCES' });
    expect(await fs.readText('/System/kernel.bin')).toBe('boot');
  });

  it('protects the Applications folder without freezing what is installed in it', async () => {
    const fs = await withSystem();
    await expect(fs.remove('/Applications', { recursive: true })).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(fs.rename('/Applications', '/Apps')).rejects.toMatchObject({ code: 'EACCES' });
    // Installing and uninstalling a program is ordinary work.
    await fs.writeText('/Applications/Quick Notes.app', '{}');
    await fs.remove('/Applications/Quick Notes.app');
    expect(await fs.exists('/Applications/Files.app')).toBe(true);
  });

  it('always allows reading', async () => {
    const fs = await withSystem();
    expect(await fs.readText('/System/kernel.bin')).toBe('boot');
    expect((await fs.readDir('/System')).map((e) => e.name)).toEqual(['Wallpapers', 'kernel.bin']);
    expect((await fs.stat('/System')).kind).toBe('directory');
    expect(await fs.du('/System')).toBe(4);
    await fs.copy('/System/kernel.bin', '/Users/ada/copy.bin');
    expect(await fs.readText('/Users/ada/copy.bin')).toBe('boot');
  });

  it('goes through for a caller that passes its authority', async () => {
    const fs = await withSystem();
    await fs.writeText('/System/kernel.bin', 'newer', authority());
    await fs.mkdir('/System/Extra', authority());
    await fs.copy('/Users/ada/notes.txt', '/System/Extra/notes.txt', authority());
    await fs.rename('/System/Extra', '/System/Spare', authority());
    await fs.remove('/System/Spare', { recursive: true, ...authority() });
    expect(await fs.readText('/System/kernel.bin')).toBe('newer');
    expect(await fs.exists('/System/Spare')).toBe(false);

    await fs.remove('/System', { recursive: true, ...authority() });
    expect(await fs.exists('/System')).toBe(false);
  });

  it('does not take a look-alike token for authority', async () => {
    const fs = await withSystem();
    // What a forged options object would look like coming out of JSON.
    const forged = { elevation: { reason: 'sudo', grantedAt: Date.now() } } as unknown as {
      elevation: Elevation;
    };
    await expect(fs.remove('/System', { recursive: true, ...forged })).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(await fs.exists('/System')).toBe(true);
  });

  it('refuses even the kernel state files to a caller with no authority', async () => {
    // The kernel rewrites settings, accounts and window state as the OS runs,
    // and passes authority for each of those saves. Nothing is exempt by path.
    const fs = await withSystem();
    await expect(fs.writeJson('/System/settings.json', { theme: 'dark' })).rejects.toMatchObject({
      code: 'EACCES',
    });
    await expect(fs.remove('/System/settings.json')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.rename('/System/settings.json', '/System/old.json')).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  /**
   * The composites are where a guard is usually forgotten: each of these
   * reaches a protected path through two or three calls rather than one, and
   * a rule applied only at `remove` would let every one of them through.
   */
  it('refuses every route into the system tree, not only the direct ones', async () => {
    const fs = await withSystem();
    const code = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return 'allowed';
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };
    expect(await code(() => fs.trash('/System'))).toBe('EACCES');
    expect(await code(() => fs.trash('/System/kernel.bin'))).toBe('EACCES');
    expect(await code(() => fs.moveInto('/Users/ada/notes.txt', '/System'))).toBe('EACCES');
    expect(await code(() => fs.copyInto('/Users/ada/notes.txt', '/System'))).toBe('EACCES');
    expect(await code(() => fs.createFolder('/System', 'New Folder'))).toBe('EACCES');
    expect(await code(() => fs.copy('/Users/ada/notes.txt', '/System/kernel.bin'))).toBe('EACCES');
    expect(await fs.readText('/System/kernel.bin')).toBe('boot');
  });

  it('normalises before it decides, so .. and a trailing slash are the same path', async () => {
    const fs = await withSystem();
    await expect(fs.remove('/Users/../System')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.remove('/System/')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fs.writeText('/Users/ada/../../System/z', 'z')).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('lets the kernel through when it says so', async () => {
    const fs = await withSystem();
    const authority = { elevation: elevate('test: the kernel saving settings') };
    await fs.writeJson('/System/settings.json', { theme: 'dark' }, authority);
    expect(await fs.readJson('/System/settings.json')).toEqual({ theme: 'dark' });
  });

  it('protects nothing when the policy says so', async () => {
    const fs = new Vfs(new MemoryAdapter(), '/Trash', NO_PROTECTION);
    await fs.ensureDir('/System');
    await fs.writeText('/System/kernel.bin', 'boot');
    await fs.remove('/System', { recursive: true });
    expect(await fs.exists('/System')).toBe(false);
  });
});
