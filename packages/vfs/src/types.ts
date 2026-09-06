export type FileKind = 'file' | 'directory';

export interface FileStat {
  path: string;
  name: string;
  kind: FileKind;
  /** Bytes; 0 for directories unless the adapter computes it. */
  size: number;
  /** Epoch milliseconds. */
  modifiedAt: number;
  createdAt: number;
}

export type DirEntry = FileStat;

export interface WriteOptions {
  /** Create parent directories as needed. */
  recursive?: boolean;
}

export interface RemoveOptions {
  recursive?: boolean;
}

/**
 * The minimal adapter contract. Paths are absolute VFS paths. Adapters throw
 * `VfsError` with POSIX-like codes. Higher-level helpers (copy trees, trash,
 * JSON) live in `Vfs` so every adapter stays small.
 */
export interface VfsAdapter {
  readonly id: string;
  stat(path: string): Promise<FileStat>;
  readDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array, options?: WriteOptions): Promise<void>;
  mkdir(path: string, options?: WriteOptions): Promise<void>;
  remove(path: string, options?: RemoveOptions): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Optional fast path; `Vfs` falls back to read+write. */
  copyFile?(from: string, to: string): Promise<void>;
  /** Optional: total/used bytes for Storage settings. */
  usage?(): Promise<{ used: number; quota: number | null }>;
}

export type VfsEventType = 'create' | 'change' | 'remove' | 'rename';

export interface VfsEvent {
  type: VfsEventType;
  path: string;
  /** Present for renames. */
  to?: string;
  kind?: FileKind;
}

export type VfsListener = (event: VfsEvent) => void;
