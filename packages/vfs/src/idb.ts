import { VfsError } from './errors';
import { basename, dirname, normalize, SEP } from './path';
import type { DirEntry, FileStat, RemoveOptions, VfsAdapter, WriteOptions } from './types';

interface Row {
  path: string;
  parent: string;
  name: string;
  kind: 'file' | 'directory';
  size: number;
  createdAt: number;
  modifiedAt: number;
}

const STORE_META = 'meta';
const STORE_DATA = 'data';

/**
 * IndexedDB adapter — the fallback for browsers without OPFS (older Safari,
 * Firefox private windows). Metadata rows are indexed by parent path so
 * directory listings are one index scan.
 */
export class IndexedDbAdapter implements VfsAdapter {
  readonly id = 'indexeddb';
  private db: IDBDatabase | null = null;
  private readonly name: string;

  constructor(name = 'lumen-os') {
    this.name = name;
  }

  static isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const meta = db.createObjectStore(STORE_META, { keyPath: 'path' });
        meta.createIndex('parent', 'parent');
        db.createObjectStore(STORE_DATA);
      };
      req.onsuccess = () => {
        this.db = req.result;
        const now = Date.now();
        const tx = this.db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put({
          path: SEP,
          parent: '',
          name: '',
          kind: 'directory',
          size: 0,
          createdAt: now,
          modifiedAt: now,
        } satisfies Row);
        tx.oncomplete = () => resolve(this.db as IDBDatabase);
        tx.onerror = () => reject(new VfsError('EIO', SEP, String(tx.error)));
      };
      req.onerror = () => reject(new VfsError('EIO', SEP, String(req.error)));
    });
  }

  private async tx<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(stores, mode);
    const result = await run(tx);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new VfsError('EIO', '', String(tx.error)));
      tx.onabort = () => reject(new VfsError('EIO', '', String(tx.error)));
    });
    return result;
  }

  private getRow(tx: IDBTransaction, path: string): Promise<Row | undefined> {
    return req<Row | undefined>(tx.objectStore(STORE_META).get(path));
  }

  private async requireDir(tx: IDBTransaction, path: string): Promise<Row> {
    const row = await this.getRow(tx, path);
    if (!row) throw new VfsError('ENOENT', path);
    if (row.kind !== 'directory') throw new VfsError('ENOTDIR', path);
    return row;
  }

  private children(tx: IDBTransaction, parent: string): Promise<Row[]> {
    return req<Row[]>(tx.objectStore(STORE_META).index('parent').getAll(parent));
  }

  async stat(path: string): Promise<FileStat> {
    const n = normalize(path);
    const row = await this.tx([STORE_META], 'readonly', (tx) => this.getRow(tx, n));
    if (!row) throw new VfsError('ENOENT', n);
    return toStat(row);
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const n = normalize(path);
    return this.tx([STORE_META], 'readonly', async (tx) => {
      await this.requireDir(tx, n);
      return (await this.children(tx, n)).map(toStat);
    });
  }

  async readFile(path: string): Promise<Uint8Array> {
    const n = normalize(path);
    return this.tx([STORE_META, STORE_DATA], 'readonly', async (tx) => {
      const row = await this.getRow(tx, n);
      if (!row) throw new VfsError('ENOENT', n);
      if (row.kind !== 'file') throw new VfsError('EISDIR', n);
      const data = await req<ArrayBuffer | undefined>(tx.objectStore(STORE_DATA).get(n));
      return data ? new Uint8Array(data) : new Uint8Array();
    });
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) throw new VfsError('EISDIR', n);
    if (options?.recursive) await this.mkdir(dirname(n), { recursive: true });
    await this.tx([STORE_META, STORE_DATA], 'readwrite', async (tx) => {
      const parent = await this.requireDir(tx, dirname(n));
      const existing = await this.getRow(tx, n);
      if (existing?.kind === 'directory') throw new VfsError('EISDIR', n);
      const now = Date.now();
      const copy = data.slice();
      tx.objectStore(STORE_DATA).put(copy.buffer, n);
      tx.objectStore(STORE_META).put({
        path: n,
        parent: dirname(n),
        name: basename(n),
        kind: 'file',
        size: data.byteLength,
        createdAt: existing?.createdAt ?? now,
        modifiedAt: now,
      } satisfies Row);
      tx.objectStore(STORE_META).put({ ...parent, modifiedAt: now });
    });
  }

  async mkdir(path: string, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) return;
    await this.tx([STORE_META], 'readwrite', async (tx) => {
      const now = Date.now();
      if (options?.recursive) {
        let cur = SEP;
        for (const seg of n.slice(1).split(SEP)) {
          const next = cur === SEP ? `${SEP}${seg}` : `${cur}${SEP}${seg}`;
          const row = await this.getRow(tx, next);
          if (!row) {
            tx.objectStore(STORE_META).put({
              path: next,
              parent: cur,
              name: seg,
              kind: 'directory',
              size: 0,
              createdAt: now,
              modifiedAt: now,
            } satisfies Row);
          } else if (row.kind !== 'directory') {
            throw new VfsError('ENOTDIR', next);
          }
          cur = next;
        }
        return;
      }
      const parent = await this.requireDir(tx, dirname(n));
      if (await this.getRow(tx, n)) throw new VfsError('EEXIST', n);
      tx.objectStore(STORE_META).put({
        path: n,
        parent: dirname(n),
        name: basename(n),
        kind: 'directory',
        size: 0,
        createdAt: now,
        modifiedAt: now,
      } satisfies Row);
      tx.objectStore(STORE_META).put({ ...parent, modifiedAt: now });
    });
  }

  async remove(path: string, options?: RemoveOptions): Promise<void> {
    const n = normalize(path);
    if (n === SEP) throw new VfsError('EINVAL', n);
    await this.tx([STORE_META, STORE_DATA], 'readwrite', async (tx) => {
      const row = await this.getRow(tx, n);
      if (!row) throw new VfsError('ENOENT', n);
      const meta = tx.objectStore(STORE_META);
      const data = tx.objectStore(STORE_DATA);
      const removeRow = async (r: Row) => {
        if (r.kind === 'directory') {
          const kids = await this.children(tx, r.path);
          if (kids.length > 0 && !options?.recursive) throw new VfsError('ENOTEMPTY', r.path);
          for (const k of kids) await removeRow(k);
        } else {
          data.delete(r.path);
        }
        meta.delete(r.path);
      };
      await removeRow(row);
      const parent = await this.getRow(tx, dirname(n));
      if (parent) meta.put({ ...parent, modifiedAt: Date.now() });
    });
  }

  async rename(from: string, to: string): Promise<void> {
    const nf = normalize(from);
    const nt = normalize(to);
    if (nf === nt) return;
    if (nt.startsWith(`${nf}${SEP}`))
      throw new VfsError('EINVAL', to, 'cannot move a directory into itself');
    await this.tx([STORE_META, STORE_DATA], 'readwrite', async (tx) => {
      const row = await this.getRow(tx, nf);
      if (!row) throw new VfsError('ENOENT', nf);
      await this.requireDir(tx, dirname(nt));
      const existing = await this.getRow(tx, nt);
      if (existing) {
        if (existing.kind === 'directory') {
          if (row.kind === 'file') throw new VfsError('EISDIR', nt);
          if ((await this.children(tx, nt)).length > 0) throw new VfsError('ENOTEMPTY', nt);
        } else if (row.kind === 'directory') {
          throw new VfsError('ENOTDIR', nt);
        }
      }
      const meta = tx.objectStore(STORE_META);
      const data = tx.objectStore(STORE_DATA);
      const move = async (r: Row, target: string) => {
        if (r.kind === 'directory') {
          const kids = await this.children(tx, r.path);
          for (const k of kids) await move(k, `${target}${SEP}${k.name}`);
        } else {
          const buf = await req<ArrayBuffer | undefined>(data.get(r.path));
          data.delete(r.path);
          if (buf) data.put(buf, target);
        }
        meta.delete(r.path);
        meta.put({
          ...r,
          path: target,
          parent: dirname(target),
          name: basename(target),
        } satisfies Row);
      };
      await move(row, nt);
      const now = Date.now();
      for (const p of new Set([dirname(nf), dirname(nt)])) {
        const parent = await this.getRow(tx, p);
        if (parent) meta.put({ ...parent, modifiedAt: now });
      }
    });
  }

  async usage(): Promise<{ used: number; quota: number | null }> {
    const used = await this.tx([STORE_META], 'readonly', async (tx) => {
      const rows = await req<Row[]>(tx.objectStore(STORE_META).getAll());
      return rows.reduce((sum, r) => sum + r.size, 0);
    });
    let quota: number | null = null;
    try {
      quota = (await navigator.storage?.estimate())?.quota ?? null;
    } catch {
      /* unsupported */
    }
    return { used, quota };
  }
}

function toStat(row: Row): FileStat {
  return {
    path: row.path,
    name: row.name,
    kind: row.kind,
    size: row.size,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
  };
}

function req<T>(r: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(new VfsError('EIO', '', String(r.error)));
  });
}
