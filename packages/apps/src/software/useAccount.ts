/**
 * The store account, read from the user's home and written back on every
 * change.
 *
 * A file rather than browser storage, for the same reason the catalogue cache
 * is one: it belongs to the account and travels with it. `SIGNED_OUT` is what
 * a fresh machine has, and it is also what an unreadable or corrupt file
 * becomes — `parseAccountFile` already refuses anything it does not
 * recognise, and a store that will not open because its own bookkeeping is
 * malformed would be worse than one that starts over.
 *
 * Writes are fire-and-forget. Signing in, subscribing and cancelling all
 * change what is on screen from state that is already in hand; waiting for a
 * file to land before drawing the result would make an instant action feel
 * like a network call.
 */

import { useKernel, useVfs } from '@lumen/kernel/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccountState,
  accountPath,
  cancel as applyCancel,
  signIn as applySignIn,
  signOut as applySignOut,
  subscribe as applySubscribe,
  type Identity,
  type PaidPlanId,
  parseAccountFile,
  SIGNED_OUT,
  toAccountFile,
} from './account';

export interface AccountController {
  state: AccountState;
  /** False until the file has been read, so the page can wait rather than flash signed-out. */
  loaded: boolean;
  signIn: (identity: Identity, now: number) => void;
  signOut: () => void;
  subscribe: (planId: PaidPlanId, now: number) => void;
  cancel: (now: number) => void;
}

export function useAccount(): AccountController {
  const vfs = useVfs();
  const kernel = useKernel();
  const [state, setState] = useState<AccountState>(SIGNED_OUT);
  const [loaded, setLoaded] = useState(false);
  const path = accountPath(kernel.home);
  /** The latest path, so a write started by an old render still lands in the right place. */
  const at = useRef(path);
  at.current = path;

  useEffect(() => {
    let alive = true;
    void vfs
      .readText(path)
      .then((text) => {
        if (alive) setState(parseAccountFile(text));
      })
      .catch(() => {
        // No file yet is the ordinary case on a new machine, and a file this
        // build cannot read is handled the same way: start signed out.
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [vfs, path]);

  const commit = useCallback(
    (next: AccountState) => {
      setState(next);
      const text = `${JSON.stringify(toAccountFile(next), null, 2)}\n`;
      void vfs.writeText(at.current, text, { recursive: true }).catch(() => {});
    },
    [vfs],
  );

  return {
    state,
    loaded,
    signIn: useCallback(
      (identity, now) => commit(applySignIn(state, identity, now)),
      [commit, state],
    ),
    signOut: useCallback(() => commit(applySignOut()), [commit]),
    subscribe: useCallback(
      (planId, now) => commit(applySubscribe(state, planId, now)),
      [commit, state],
    ),
    cancel: useCallback((now) => commit(applyCancel(state, now)), [commit, state]),
  };
}
