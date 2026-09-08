import { VfsError } from './errors';
import { basename, dirname, normalize, SEP, segments } from './path';
import type { DirEntry, FileStat, RemoveOptions, VfsAdapter, WriteOptions } from './types';

/**
 * Origin Private File System adapter for the web build. Everything lives under
 * a single directory (`root`, default "lumen-os") in the origin's private
 * storage so multiple installs on one origin can coexist.
 *
 * Directory timestamps are not exposed by OPFS; we keep them in a small
 * sidecar index so Files can sort by date.
 */
export class OpfsAdapter implements VfsAdapter {
  readonly id = 'opfs';
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private readonly rootName: string;
  private readonly dirTimes = new Map<string, { createdAt: number; modifiedAt: number }>();

  constructor(rootName = 'lumen-os') {
    this.rootName = rootName;
  }

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.storage?.getDirectory === 'function' &&
      typeof FileSystemDirectoryHandle !== 'undefined'
    );
  }

  private async root(): Promise<FileSystemDirectoryHandle> {
    if (this.rootHandle) return this.rootHandle;
    const origin = await navigator.storage.getDirectory();
    this.rootHandle = await origin.getDirectoryHandle(this.rootName, { create: true });
    return this.rootHandle;
  }

  private async dirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let cur = await this.root();
    for (const seg of segments(path)) {
      try {
        cur = await cur.getDirectoryHandle(seg, { create });
      } catch (e) {
        throw mapError(e, path);
      }
    }
    return cur;
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const dir = await this.dirHandle(dirname(path), create);
    try {
      return await dir.getFileHandle(basename(path), { create });
    } catch (e) {
      throw mapError(e, path);
    }
  }

  private touchDir(path: string) {
    const n = normalize(path);
    const now = Date.now();
    const cur = this.dirTimes.get(n);
    if (cur) cur.modifiedAt = now;
    else this.dirTimes.set(n, { createdAt: now, modifiedAt: now });
  }

  async stat(path: string): Promise<FileStat> {
    const n = normalize(path);
    if (n === SEP) {
      return { path: n, name: '', kind: 'directory', size: 0, createdAt: 0, modifiedAt: 0 };
    }
    const parent = await this.dirHandle(dirname(n));
    const name = basename(n);
    try {
      const fh = await parent.getFileHandle(name);
      const file = await fh.getFile();
      return {
        path: n,
        name,
        kind: 'file',
        size: file.size,
        modifiedAt: file.lastModified,
        createdAt: file.lastModified,
      };
    } catch (e) {
      if (!isNotFound(e) && !isTypeMismatch(e)) throw mapError(e, n);
    }
    try {
      await parent.getDirectoryHandle(name);
      const t = this.dirTimes.get(n) ?? { createdAt: 0, modifiedAt: 0 };
      return { path: n, name, kind: 'directory', size: 0, ...t };
    } catch (e) {
      throw mapError(e, n);
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const n = normalize(path);
    const dir = await this.dirHandle(n);
    const out: DirEntry[] = [];
    // `entries()` is part of the async-iterable directory handle spec but missing from lib.dom.
    const iterable = dir as unknown as {
      entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    };
    for await (const [name, handle] of iterable.entries()) {
      const childPath = n === SEP ? `${SEP}${name}` : `${n}${SEP}${name}`;
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({
          path: childPath,
          name,
          kind: 'file',
          size: file.size,
          modifiedAt: file.lastModified,
          createdAt: file.lastModified,
        });
      } else {
        const t = this.dirTimes.get(childPath) ?? { createdAt: 0, modifiedAt: 0 };
        out.push({ path: childPath, name, kind: 'directory', size: 0, ...t });
      }
    }
    return out;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const fh = await this.fileHandle(path);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    if (options?.recursive) await this.dirHandle(dirname(n), true);
    const fh = await this.fileHandle(n, true);
    const writable = await fh.createWritable();
    try {
      await writable.write(data as unknown as BufferSource);
    } finally {
      await writable.close();
    }
    this.touchDir(dirname(n));
  }

  async mkdir(path: string, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) return;
    if (!options?.recursive) {
      const parent = await this.dirHandle(dirname(n));
      let exists = false;
      try {
        await parent.getDirectoryHandle(basename(n));
        exists = true;
      } catch {
        /* not found */
      }
      if (!exists) {
        try {
          await parent.getFileHandle(basename(n));
          exists = true;
        } catch {
          /* not found */
        }
      }
      if (exists) throw new VfsError('EEXIST', n);
    }
    await this.dirHandle(n, true);
    this.touchDir(n);
    this.touchDir(dirname(n));
  }

  async remove(path: string, options?: RemoveOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) throw new VfsError('EINVAL', n);
    const parent = await this.dirHandle(dirname(n));
    const name = basename(n);
    const st = await this.stat(n);
    if (st.kind === 'directory' && !options?.recursive) {
      const entries = await this.readDir(n);
      if (entries.length > 0) throw new VfsError('ENOTEMPTY', n);
    }
    try {
      await parent.removeEntry(name, { recursive: true });
    } catch (e) {
      throw mapError(e, n);
    }
    for (const key of [...this.dirTimes.keys()]) {
      if (key === n || key.startsWith(`${n}${SEP}`)) this.dirTimes.delete(key);
    }
    this.touchDir(dirname(n));
  }

  async rename(from: string, to: string): Promise<void> {
    const nf = normalize(from);
    const nt = normalize(to);
    if (nf === nt) return;
    if (nt.startsWith(`${nf}${SEP}`))
      throw new VfsError('EINVAL', to, 'cannot move a directory into itself');
    const st = await this.stat(nf);
    const targetParent = await this.dirHandle(dirname(nt));
    const targetName = basename(nt);
    let exists = false;
    try {
      await this.stat(nt);
      exists = true;
    } catch {
      /* free */
    }
    if (exists) {
      const ts = await this.stat(nt);
      if (ts.kind === 'directory') {
        if (st.kind === 'file') throw new VfsError('EISDIR', nt);
        if ((await this.readDir(nt)).length > 0) throw new VfsError('ENOTEMPTY', nt);
        await targetParent.removeEntry(targetName, { recursive: true });
      } else if (st.kind === 'directory') {
        throw new VfsError('ENOTDIR', nt);
      }
    }
    if (st.kind === 'file') {
      const data = await this.readFile(nf);
      await this.writeFile(nt, data);
      await this.remove(nf);
      return;
    }
    // Directory move: copy tree then remove. OPFS has no native move for directories.
    await this.copyTree(nf, nt);
    await this.remove(nf, { recursive: true });
  }

  private async copyTree(from: string, to: string): Promise<void> {
    await this.mkdir(to, { recursive: true });
    const created = this.dirTimes.get(from);
    if (created) this.dirTimes.set(to, { ...created });
    for (const entry of await this.readDir(from)) {
      const target = `${to}${SEP}${entry.name}`;
      if (entry.kind === 'file') await this.writeFile(target, await this.readFile(entry.path));
      else await this.copyTree(entry.path, target);
    }
  }

  async usage(): Promise<{ used: number; quota: number | null }> {
    try {
      const est = await navigator.storage.estimate();
      return { used: est.usage ?? 0, quota: est.quota ?? null };
    } catch {
      return { used: 0, quota: null };
    }
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}
function isTypeMismatch(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'TypeMismatchError';
}

function mapError(e: unknown, path: string): VfsError {
  if (e instanceof VfsError) return e;
  if (e instanceof DOMException) {
    switch (e.name) {
      case 'NotFoundError':
        return new VfsError('ENOENT', path);
      case 'TypeMismatchError':
        return new VfsError('ENOTDIR', path);
      case 'NotAllowedError':
      case 'SecurityError':
        return new VfsError('EACCES', path);
      case 'QuotaExceededError':
        return new VfsError('ENOSPC', path);
      case 'InvalidModificationError':
        return new VfsError('ENOTEMPTY', path);
      default:
        return new VfsError('EIO', path, `${e.name}: ${e.message}`);
    }
  }
  return new VfsError('EIO', path, e instanceof Error ? e.message : String(e));
}
