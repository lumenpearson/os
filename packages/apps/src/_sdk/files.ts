import { useKernel, useVfs } from '@lumen/kernel/react';
import { type DirEntry, dirname, normalize, VfsError, type VfsEvent } from '@lumen/vfs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowControls } from './context';

/** Re-run `callback` when anything under `path` (or the path itself) changes. */
export function useVfsWatch(path: string | null, callback: (event: VfsEvent) => void) {
  const vfs = useVfs();
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (path === null) return;
    const p = normalize(path);
    return vfs.subscribe((e) => {
      const hits = (x: string) => x === p || x.startsWith(`${p}/`) || dirname(x) === p;
      if (hits(e.path) || (e.to && hits(e.to))) latest.current(e);
    });
  }, [vfs, path]);
}

export interface DirectoryState {
  entries: DirEntry[];
  loading: boolean;
  error: VfsError | null;
  refresh: () => void;
}

/** Live directory listing: refreshes when the folder changes. */
export function useDirectory(
  path: string | null,
  options: { showHidden?: boolean } = {},
): DirectoryState {
  const vfs = useVfs();
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<VfsError | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(() => {
    if (path === null) return;
    const id = ++seq.current;
    setLoading(true);
    vfs
      .readDir(path)
      .then((list) => {
        if (id !== seq.current) return;
        setEntries(options.showHidden ? list : list.filter((e) => !e.name.startsWith('.')));
        setError(null);
      })
      .catch((e) => {
        if (id !== seq.current) return;
        setError(VfsError.is(e) ? e : new VfsError('EIO', path, String(e)));
        setEntries([]);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [vfs, path, options.showHidden]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useVfsWatch(path, refresh);

  return { entries, loading, error, refresh };
}

export interface TextDocument {
  path: string | null;
  text: string;
  setText: (text: string) => void;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  /** Save to the current path; returns false if there is no path. */
  save: () => Promise<boolean>;
  saveAs: (path: string) => Promise<void>;
  /** Replace the document with a file from disk. */
  load: (path: string | null) => Promise<void>;
  /** Discard changes and reset to an empty document. */
  reset: (initialText?: string) => void;
}

/**
 * A text document bound to a VFS path with dirty tracking. Keeps the window's
 * title, dirty dot and document proxy in sync.
 */
export function useTextDocument(
  initialPath: string | null,
  defaultTitle = 'Untitled',
): TextDocument {
  const vfs = useVfs();
  const kernel = useKernel();
  const { setTitle, setDirty, setDocument } = useWindowControls();
  const [path, setPath] = useState<string | null>(initialPath);
  const [text, setTextState] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(Boolean(initialPath));
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== saved;

  const load = useCallback(
    async (p: string | null) => {
      setPath(p);
      if (!p) {
        setTextState('');
        setSaved('');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const t = await vfs.readText(p);
        setTextState(t);
        setSaved(t);
        setError(null);
        kernel.addRecent(p, 'lumen.editor');
      } catch (e) {
        setError(VfsError.is(e) ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [vfs, kernel],
  );

  useEffect(() => {
    void load(initialPath);
  }, [initialPath, load]);

  useEffect(() => {
    const name = path ? path.slice(path.lastIndexOf('/') + 1) : defaultTitle;
    setTitle(name);
    setDirty(dirty);
    setDocument(path);
  }, [path, dirty, defaultTitle, setTitle, setDirty, setDocument]);

  const saveAs = useCallback(
    async (p: string) => {
      await vfs.writeText(p, text, { recursive: true });
      setPath(p);
      setSaved(text);
      setError(null);
    },
    [vfs, text],
  );

  const save = useCallback(async () => {
    if (!path) return false;
    await saveAs(path);
    return true;
  }, [path, saveAs]);

  const reset = useCallback((initialText = '') => {
    setPath(null);
    setTextState(initialText);
    setSaved(initialText);
    setError(null);
  }, []);

  return { path, text, setText: setTextState, dirty, loading, error, save, saveAs, load, reset };
}

/** Object URL for a VFS file, revoked on unmount / path change. */
export function useObjectUrl(path: string | null): {
  url: string | null;
  error: string | null;
  loading: boolean;
} {
  const vfs = useVfs();
  const [state, setState] = useState<{
    url: string | null;
    error: string | null;
    loading: boolean;
  }>({ url: null, error: null, loading: Boolean(path) });
  useEffect(() => {
    if (!path) {
      setState({ url: null, error: null, loading: false });
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, error: null, loading: true });
    vfs
      .objectUrl(path)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setState({ url: u, error: null, loading: false });
      })
      .catch((e) => !cancelled && setState({ url: null, error: String(e), loading: false }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [vfs, path]);
  return state;
}

/** Read and write a JSON document, e.g. an app's own data file under the home directory. */
export function useJsonFile<T>(
  path: string | null,
  fallback: T,
): [T, (next: T | ((prev: T) => T)) => void, { loading: boolean; loaded: boolean }] {
  const vfs = useVfs();
  const [value, setValue] = useState<T>(fallback);
  const [loading, setLoading] = useState(Boolean(path));
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set as soon as the caller writes, and never cleared for this path. The
   * read below started before that write and therefore knows less, so it must
   * not land on top of it — including its `catch`, which is the common case on
   * a first run where the file does not exist yet. Without this, a value set
   * in the first few milliseconds after launch (a launch argument, or a fast
   * click) is reverted on screen while the debounced write still reaches disk,
   * leaving the state and the file disagreeing.
   */
  const written = useRef(false);

  // `fallback` is typically an inline literal, so it changes identity every
  // render; only the path should re-read the file.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fallback is a stable default by contract
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    written.current = false;
    setLoading(true);
    const stale = () => cancelled || written.current;
    vfs
      .readJson<T>(path)
      .then((v) => !stale() && setValue(v))
      .catch(() => !stale() && setValue(fallback))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, path]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      written.current = true;
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (path) {
          if (pending.current) clearTimeout(pending.current);
          pending.current = setTimeout(() => void vfs.writeJson(path, v, { recursive: true }), 250);
        }
        return v;
      });
    },
    [vfs, path],
  );

  return [value, update, { loading, loaded }];
}
