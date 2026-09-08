/**
 * Reading the library. One walk of Pictures produces every picture under it;
 * a change anywhere in that tree walks it again, coalesced, because a copy of
 * twenty files arrives as twenty separate events.
 */
import { useVfs } from '@lumen/kernel/react';
import { VfsError } from '@lumen/vfs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useVfsWatch } from '../_sdk';
import { type Photo, scanPictures } from './library';

/** How long a burst of file-system events is allowed to settle. */
const SETTLE_MS = 120;

export interface Library {
  photos: Photo[];
  loading: boolean;
  /** There is no Pictures folder at all, which is not the same as an empty one. */
  missing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLibrary(root: string): Library {
  const vfs = useVfs();
  const [state, setState] = useState<Omit<Library, 'refresh'>>({
    photos: [],
    loading: true,
    missing: false,
    error: null,
  });
  const [token, setToken] = useState(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setToken((t) => t + 1), []);

  // `token` is what Refresh and the watcher increment to re-run the walk.
  // biome-ignore lint/correctness/useExhaustiveDependencies: token is the trigger, not an input
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    scanPictures(vfs, root)
      .then((photos) => {
        if (cancelled) return;
        setState({ photos, loading: false, missing: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const missing = VfsError.is(error, 'ENOENT') || VfsError.is(error, 'ENOTDIR');
        setState({
          photos: [],
          loading: false,
          missing,
          error: missing ? null : VfsError.is(error) ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, root, token]);

  useVfsWatch(root, () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      refresh();
    }, SETTLE_MS);
  });

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  return { ...state, refresh };
}
