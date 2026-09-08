/**
 * Checking for updates, for real.
 *
 * "Check for updates" used to be a nine-hundred-millisecond wait followed by
 * the words "up to date", whatever was installed and whatever the store said.
 * There is a real source now: the catalogue lists a version for every package
 * and the library knows the version of everything installed from it, so a
 * check is a fetch and a comparison, and the answer is a list that can be
 * empty for the right reason rather than by construction.
 *
 * The system's own version is not checked here, because Lumen has no release
 * feed to check it against. Saying so is the honest answer; inventing a
 * "you are up to date" is not.
 */

import { useApps, useInstalledApps, useSetting } from '@lumen/kernel/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLibrary } from './library';
import { fetchCatalogue, type StoreError } from './remote';
import { resolveOrigin } from './source';
import { type AvailableUpdate, availableUpdates } from './updates';

export interface UpdatesController {
  /** The installed packages the catalogue has a newer version of. */
  updates: AvailableUpdate[];
  /** True while a check is in flight. */
  checking: boolean;
  /** When the last check finished, from Settings; null if there has been none. */
  lastChecked: number | null;
  /** Why the last check failed, if it did. */
  error: StoreError | null;
  /** Fetch the catalogue and compare it against what is installed. */
  check: () => void;
}

export function useUpdates(): UpdatesController {
  const [store] = useSetting('store');
  const [updateSettings, patchUpdates] = useSetting('updates');
  const registered = useApps({ includeHidden: true });
  const installed = useInstalledApps();
  const [updates, setUpdates] = useState<AvailableUpdate[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<StoreError | null>(null);
  /** Bumped by every check, so a slow one cannot land on a newer one. */
  const attempt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const entries = useMemo(
    () =>
      buildLibrary(
        registered.filter((a) => !a.hidden),
        installed,
      ),
    [registered, installed],
  );

  const base = resolveOrigin(store.origin, globalThis.location?.href);

  const check = useCallback(() => {
    attempt.current += 1;
    const id = attempt.current;
    setChecking(true);
    setError(null);
    void fetchCatalogue(base).then((result) => {
      if (!alive.current || id !== attempt.current) return;
      setChecking(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUpdates(availableUpdates(entries, result.value.packages));
      patchUpdates({ lastChecked: Date.now() });
    });
  }, [base, entries, patchUpdates]);

  return { updates, checking, lastChecked: updateSettings.lastChecked, error, check };
}
