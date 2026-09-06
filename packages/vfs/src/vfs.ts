import { VfsError } from './errors';
import { fileCategory } from './mime';
import { basename, dirname, isInside, join, normalize, SEP, uniqueName } from './path';
import {
  type Authority,
  isElevated,
  type ProtectedOperation,
  type ProtectionPolicy,
  protectionError,
  requiresElevation,
  SYSTEM_PROTECTION,
} from './protection';
import type {
  DirEntry,
  FileStat,
  RemoveOptions,
  VfsAdapter,
  VfsEvent,
  VfsListener,
  WriteOptions,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SearchOptions {
  /** Case-insensitive substring match on the file name. */
  query: string;
  /** Stop after this many results. */
  limit?: number;
  /** Skip directories whose name starts with a dot. */
  includeHidden?: boolean;
  signal?: AbortSignal;
}

/**
 * High-level file system used by the kernel and every app. Wraps an adapter
 * with text/JSON helpers, recursive operations, a trash, and change events
 * so open windows refresh when another window edits the same folder.
 */
export class Vfs {
  readonly adapter: VfsAdapter;
  readonly trashPath: string;
  /** Which paths the system owns. Data, so a test can hand in another set. */
  readonly protection: ProtectionPolicy;
  private readonly listeners = new Set<VfsListener>();

  constructor(
    adapter: VfsAdapter,
    trashPath = '/Trash',
    protection: ProtectionPolicy = SYSTEM_PROTECTION,
  ) {
    this.adapter = adapter;
    this.trashPath = normalize(trashPath);
    this.protection = protection;
  }

  /**
   * Refuse a change to a path the system owns unless the caller passed
   * authority for it. Every operation that writes, removes or renames goes
   * through here before the adapter is touched, so a refusal changes nothing
   * and emits nothing.
   */
  private guard(operation: ProtectedOperation, path: string, authority?: Authority): void {
    if (isElevated(authority?.elevation)) return;
    if (requiresElevation(operation, path, this.protection)) throw protectionError(operation, path);
  }

  // ── events ─────────────────────────────────────────────────────────────

  subscribe(listener: VfsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: VfsEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error('[vfs] listener failed', e);
      }
    }
  }

  // ── primitives ─────────────────────────────────────────────────────────

  stat(path: string): Promise<FileStat> {
    return this.adapter.stat(normalize(path));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.adapter.stat(normalize(path));
      return true;
    } catch (e) {
      if (VfsError.is(e, 'ENOENT') || VfsError.is(e, 'ENOTDIR')) return false;
      throw e;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return (await this.stat(path)).kind === 'directory';
    } catch {
      return false;
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await this.adapter.readDir(normalize(path));
    return entries.sort(compareEntries);
  }

  readFile(path: string): Promise<Uint8Array> {
    return this.adapter.readFile(normalize(path));
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.readFile(path));
  }

  async readJson<T>(path: string): Promise<T> {
    const text = await this.readText(path);
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      throw new VfsError('EINVAL', normalize(path), `invalid JSON: ${(e as Error).message}`);
    }
  }

  async writeFile(
    path: string,
    data: Uint8Array | ArrayBuffer | Blob,
    options?: WriteOptions & Authority,
  ): Promise<void> {
    const n = normalize(path);
    // The three adapters each rejected this differently — EINVAL, EISDIR and
    // EIO — so a caller branching on the code to say "that is a folder" was
    // right on one platform and wrong on the others. Decide it here, once.
    if (n === SEP) throw new VfsError('EISDIR', n);
    this.guard('write', n, options);
    const existed = await this.exists(n);
    const bytes = await toBytes(data);
    await this.adapter.writeFile(n, bytes, forAdapter(options));
    this.emit({ type: existed ? 'change' : 'create', path: n, kind: 'file' });
  }

  writeText(path: string, text: string, options?: WriteOptions & Authority): Promise<void> {
    return this.writeFile(path, encoder.encode(text), options);
  }

  writeJson(path: string, value: unknown, options?: WriteOptions & Authority): Promise<void> {
    return this.writeText(path, `${JSON.stringify(value, null, 2)}\n`, options);
  }

  async mkdir(path: string, options?: WriteOptions & Authority): Promise<void> {
    const n = normalize(path);
    // Creating inside a protected tree is refused too: what it left behind
    // could not be removed again, since removing is refused as well.
    this.guard('write', n, options);
    await this.adapter.mkdir(n, forAdapter(options));
    this.emit({ type: 'create', path: n, kind: 'directory' });
  }

  async ensureDir(path: string, options?: Authority): Promise<void> {
    const n = normalize(path);
    if (await this.isDirectory(n)) return;
    await this.mkdir(n, { recursive: true, ...options });
  }

  async remove(path: string, options?: RemoveOptions & Authority): Promise<void> {
    const n = normalize(path);
    this.guard('remove', n, options);
    const st = await this.stat(n);
    await this.adapter.remove(n, { recursive: true, ...forAdapter(options) });
    this.emit({ type: 'remove', path: n, kind: st.kind });
  }

  async rename(from: string, to: string, options?: Authority): Promise<void> {
    const nf = normalize(from);
    const nt = normalize(to);
    if (nf === nt) return;
    this.guard('rename', nf, options);
    // Both ends matter: moving an ordinary file onto a system path replaces it
    // just as surely as editing it.
    this.guard('overwrite', nt, options);
    const st = await this.stat(nf);
    await this.adapter.rename(nf, nt);
    this.emit({ type: 'rename', path: nf, to: nt, kind: st.kind });
  }

  // ── composite operations ───────────────────────────────────────────────

  /** Copy a file or a whole tree. `to` is the destination path (not the parent). */
  async copy(from: string, to: string, options?: Authority): Promise<void> {
    const nf = normalize(from);
    const nt = normalize(to);
    if (isInside(nf, nt, true))
      throw new VfsError('EINVAL', nt, 'cannot copy a folder into itself');
    // The adapter's copyFile skips writeFile, so the destination is checked
    // here rather than left to the slow path alone.
    this.guard('write', nt, options);
    const st = await this.stat(nf);
    if (st.kind === 'file') {
      if (this.adapter.copyFile) {
        // Ask before copying: the fast path used to report 'create'
        // unconditionally while the fallback, which goes through writeFile,
        // reported 'change' for an overwrite — so the same `cp` said
        // different things on the desktop and on the web.
        const existed = await this.exists(nt);
        await this.adapter.copyFile(nf, nt);
        this.emit({ type: existed ? 'change' : 'create', path: nt, kind: 'file' });
      } else {
        await this.writeFile(nt, await this.readFile(nf), options);
      }
      return;
    }
    await this.mkdir(nt, { recursive: true, ...options });
    for (const entry of await this.readDir(nf)) {
      await this.copy(entry.path, join(nt, entry.name), options);
    }
  }

  /** Move into a directory, resolving name collisions with " 2", " 3", …; returns the final path. */
  async moveInto(source: string, targetDir: string): Promise<string> {
    const name = await this.freeName(targetDir, basename(source));
    const dest = join(targetDir, name);
    await this.rename(source, dest);
    return dest;
  }

  async copyInto(source: string, targetDir: string): Promise<string> {
    const ns = normalize(source);
    const base = basename(ns);
    const sameDir = dirname(ns) === normalize(targetDir);
    const name = await this.freeName(targetDir, sameDir ? withCopySuffix(base) : base);
    const dest = join(targetDir, name);
    await this.copy(ns, dest);
    return dest;
  }

  async freeName(dir: string, name: string): Promise<string> {
    const taken = new Set((await this.readDir(dir)).map((e) => e.name.toLowerCase()));
    return uniqueName(name, (c) => taken.has(c.toLowerCase()));
  }

  /** Create "untitled folder", "untitled folder 2"… and return its path. */
  async createFolder(dir: string, name = 'untitled folder'): Promise<string> {
    const free = await this.freeName(dir, name);
    const path = join(dir, free);
    await this.mkdir(path);
    return path;
  }

  async createFile(dir: string, name: string, content: string | Uint8Array = ''): Promise<string> {
    const free = await this.freeName(dir, name);
    const path = join(dir, free);
    if (typeof content === 'string') await this.writeText(path, content);
    else await this.writeFile(path, content);
    return path;
  }

  /** Move to the trash, remembering the origin so it can be restored. */
  async trash(path: string): Promise<string> {
    const n = normalize(path);
    if (isInside(this.trashPath, n, true)) {
      await this.remove(n);
      return n;
    }
    await this.ensureDir(this.trashPath);
    // Reserve the index's own name. On the first ever trash operation the
    // index file does not exist yet, so a user file called .trash-index.json
    // would be moved to exactly that path and then overwritten by the index
    // written two lines below — destroying it with no way back.
    const taken = new Set((await this.readDir(this.trashPath)).map((e) => e.name.toLowerCase()));
    taken.add(TRASH_INDEX.toLowerCase());
    const free = uniqueName(basename(n), (candidate) => taken.has(candidate.toLowerCase()));
    const dest = join(this.trashPath, free);
    await this.rename(n, dest);
    const index = await this.readTrashIndex();
    index[basename(dest)] = { origin: n, deletedAt: Date.now() };
    await this.writeTrashIndex(index);
    return dest;
  }

  async restoreFromTrash(path: string): Promise<string> {
    const n = normalize(path);
    const index = await this.readTrashIndex();
    const entry = index[basename(n)];
    const origin = entry?.origin ?? join(SEP, basename(n));
    await this.ensureDir(dirname(origin));
    const name = await this.freeName(dirname(origin), basename(origin));
    const dest = join(dirname(origin), name);
    await this.rename(n, dest);
    delete index[basename(n)];
    await this.writeTrashIndex(index);
    return dest;
  }

  async emptyTrash(): Promise<void> {
    if (!(await this.exists(this.trashPath))) return;
    for (const entry of await this.readDir(this.trashPath)) {
      if (entry.name === TRASH_INDEX) continue;
      await this.remove(entry.path, { recursive: true });
    }
    await this.writeTrashIndex({});
  }

  async trashOrigin(path: string): Promise<string | null> {
    const index = await this.readTrashIndex();
    return index[basename(path)]?.origin ?? null;
  }

  private async readTrashIndex(): Promise<TrashIndex> {
    try {
      return await this.readJson<TrashIndex>(join(this.trashPath, TRASH_INDEX));
    } catch {
      return {};
    }
  }

  private async writeTrashIndex(index: TrashIndex): Promise<void> {
    await this.ensureDir(this.trashPath);
    await this.adapter.writeFile(
      join(this.trashPath, TRASH_INDEX),
      encoder.encode(JSON.stringify(index)),
    );
  }

  /** Total bytes under a path (files only). */
  async du(path: string): Promise<number> {
    const st = await this.stat(path);
    if (st.kind === 'file') return st.size;
    let total = 0;
    for (const e of await this.readDir(path)) total += await this.du(e.path);
    return total;
  }

  /** Depth-first walk. The callback returns `false` to skip descending into a directory. */
  async walk(
    path: string,
    visit: (entry: DirEntry) => boolean | undefined | Promise<boolean | undefined>,
  ): Promise<void> {
    for (const entry of await this.readDir(path)) {
      const descend = await visit(entry);
      if (entry.kind === 'directory' && descend !== false) await this.walk(entry.path, visit);
    }
  }

  async search(root: string, options: SearchOptions): Promise<DirEntry[]> {
    const q = options.query.trim().toLowerCase();
    const limit = options.limit ?? 200;
    const out: DirEntry[] = [];
    if (!q) return out;
    await this.walk(root, (entry) => {
      if (options.signal?.aborted || out.length >= limit) return false;
      if (!options.includeHidden && entry.name.startsWith('.')) return false;
      if (entry.name.toLowerCase().includes(q)) out.push(entry);
      return true;
    });
    return out;
  }

  async usage(): Promise<{ used: number; quota: number | null }> {
    if (this.adapter.usage) return this.adapter.usage();
    return { used: await this.du(SEP), quota: null };
  }

  /** Blob URL for a file, for `<img>`, `<audio>`, `<iframe>`. Caller revokes. */
  async objectUrl(path: string, mime?: string): Promise<string> {
    const data = await this.readFile(path);
    const type = mime ?? (await import('./mime')).mimeType(path);
    return URL.createObjectURL(new Blob([data as BlobPart], { type }));
  }
}

const TRASH_INDEX = '.trash-index.json';

interface TrashIndex {
  [name: string]: { origin: string; deletedAt: number };
}

function withCopySuffix(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return `${name} copy`;
  return `${name.slice(0, idx)} copy${name.slice(idx)}`;
}

/**
 * Adapters never see the authority: whether a change is allowed is a policy
 * decision taken above them, and passing the token down would invite one of
 * them to make that decision differently.
 */
function forAdapter<T extends object>(options: (T & Authority) | undefined): T | undefined {
  if (!options) return undefined;
  const { elevation: _elevation, ...rest } = options;
  // `Omit<T & Authority, 'elevation'>` is T for every T the callers use here.
  return rest as T;
}

async function toBytes(data: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/** Directories first, then natural, case-insensitive name order. */
export function compareEntries(a: DirEntry, b: DirEntry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isHidden(entry: DirEntry): boolean {
  return entry.name.startsWith('.');
}

export function entryCategory(entry: DirEntry) {
  return entry.kind === 'directory' ? 'directory' : fileCategory(entry.path);
}
