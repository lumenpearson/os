import { VfsError } from './errors';
import { basename, dirname, normalize, SEP } from './path';
import type { DirEntry, FileStat, RemoveOptions, VfsAdapter, WriteOptions } from './types';

interface MemNode {
  kind: 'file' | 'directory';
  data?: Uint8Array;
  children?: Map<string, MemNode>;
  createdAt: number;
  modifiedAt: number;
}

/**
 * In-memory adapter. Used for unit tests, for the boot fallback when no
 * persistent storage is available, and as the reference implementation of
 * the adapter semantics.
 */
export class MemoryAdapter implements VfsAdapter {
  readonly id = 'memory';
  private readonly root: MemNode;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    const t = now();
    this.root = { kind: 'directory', children: new Map(), createdAt: t, modifiedAt: t };
  }

  private lookup(path: string): MemNode | undefined {
    const n = normalize(path);
    if (n === SEP) return this.root;
    let cur: MemNode = this.root;
    for (const seg of n.slice(1).split(SEP)) {
      const next = cur.children?.get(seg);
      if (!next) return undefined;
      cur = next;
    }
    return cur;
  }

  private parentOf(path: string): { parent: MemNode; name: string } {
    const n = normalize(path);
    if (n === SEP) throw new VfsError('EINVAL', path, 'cannot modify root');
    const parent = this.lookup(dirname(n));
    if (!parent) throw new VfsError('ENOENT', dirname(n));
    if (parent.kind !== 'directory') throw new VfsError('ENOTDIR', dirname(n));
    return { parent, name: basename(n) };
  }

  private toStat(path: string, node: MemNode): FileStat {
    const n = normalize(path);
    return {
      path: n,
      name: basename(n),
      kind: node.kind,
      size: node.kind === 'file' ? (node.data?.byteLength ?? 0) : 0,
      createdAt: node.createdAt,
      modifiedAt: node.modifiedAt,
    };
  }

  async stat(path: string): Promise<FileStat> {
    const node = this.lookup(path);
    if (!node) throw new VfsError('ENOENT', path);
    return this.toStat(path, node);
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const node = this.lookup(path);
    if (!node) throw new VfsError('ENOENT', path);
    if (node.kind !== 'directory') throw new VfsError('ENOTDIR', path);
    const n = normalize(path);
    const out: DirEntry[] = [];
    for (const [name, child] of node.children ?? []) {
      out.push(this.toStat(n === SEP ? `${SEP}${name}` : `${n}${SEP}${name}`, child));
    }
    return out;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const node = this.lookup(path);
    if (!node) throw new VfsError('ENOENT', path);
    if (node.kind !== 'file') throw new VfsError('EISDIR', path);
    return node.data ? node.data.slice() : new Uint8Array();
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    if (options?.recursive) await this.mkdir(dirname(path), { recursive: true });
    const { parent, name } = this.parentOf(path);
    const existing = parent.children?.get(name);
    if (existing?.kind === 'directory') throw new VfsError('EISDIR', path);
    const t = this.now();
    parent.children?.set(name, {
      kind: 'file',
      data: data.slice(),
      createdAt: existing?.createdAt ?? t,
      modifiedAt: t,
    });
    parent.modifiedAt = t;
  }

  async mkdir(path: string, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) return;
    if (options?.recursive) {
      let cur = this.root;
      for (const seg of n.slice(1).split(SEP)) {
        let next = cur.children?.get(seg);
        if (!next) {
          const t = this.now();
          next = { kind: 'directory', children: new Map(), createdAt: t, modifiedAt: t };
          cur.children?.set(seg, next);
          cur.modifiedAt = t;
        } else if (next.kind !== 'directory') {
          throw new VfsError('ENOTDIR', n);
        }
        cur = next;
      }
      return;
    }
    const { parent, name } = this.parentOf(n);
    if (parent.children?.has(name)) throw new VfsError('EEXIST', n);
    const t = this.now();
    parent.children?.set(name, {
      kind: 'directory',
      children: new Map(),
      createdAt: t,
      modifiedAt: t,
    });
    parent.modifiedAt = t;
  }

  async remove(path: string, options?: RemoveOptions): Promise<void> {
    const { parent, name } = this.parentOf(path);
    const node = parent.children?.get(name);
    if (!node) throw new VfsError('ENOENT', path);
    if (node.kind === 'directory' && (node.children?.size ?? 0) > 0 && !options?.recursive) {
      throw new VfsError('ENOTEMPTY', path);
    }
    parent.children?.delete(name);
    parent.modifiedAt = this.now();
  }

  async rename(from: string, to: string): Promise<void> {
    const src = this.parentOf(from);
    const node = src.parent.children?.get(src.name);
    if (!node) throw new VfsError('ENOENT', from);
    const nf = normalize(from);
    const nt = normalize(to);
    if (nt === nf) return;
    if (nt.startsWith(`${nf}${SEP}`))
      throw new VfsError('EINVAL', to, 'cannot move a directory into itself');
    const dst = this.parentOf(nt);
    const existing = dst.parent.children?.get(dst.name);
    if (existing) {
      if (existing.kind === 'directory' && node.kind === 'file') throw new VfsError('EISDIR', to);
      if (existing.kind === 'directory' && (existing.children?.size ?? 0) > 0)
        throw new VfsError('ENOTEMPTY', to);
    }
    src.parent.children?.delete(src.name);
    dst.parent.children?.set(dst.name, node);
    const t = this.now();
    src.parent.modifiedAt = t;
    dst.parent.modifiedAt = t;
  }

  async usage(): Promise<{ used: number; quota: number | null }> {
    let used = 0;
    const walk = (n: MemNode) => {
      if (n.kind === 'file') used += n.data?.byteLength ?? 0;
      else for (const c of n.children?.values() ?? []) walk(c);
    };
    walk(this.root);
    return { used, quota: null };
  }
}
