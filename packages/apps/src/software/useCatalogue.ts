/**
 * The catalogue the window draws, and where it came from.
 *
 * The order is fixed: what was kept from last time is drawn first, because a
 * storefront that shows nothing while a request is in flight is a storefront
 * that looks broken on a slow connection. Then, if that copy is older than the
 * sync interval in Settings, a fetch runs behind it and replaces it. With no
 * cache and no network the copy that ships beside the OS is fetched instead,
 * and only when that fails too is there nothing to draw — at which point the
 * window says which address it tried.
 *
 * The cache is a file under the user's home, not browser storage, so it
 * belongs to the account and travels with it.
 */

import { BUNDLED_STORE_ORIGIN } from '@lumen/kernel';
import { useKernel, useSetting, useVfs } from '@lumen/kernel/react';
import { useLatest } from '@lumen/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CachedCatalogue,
  cacheEntry,
  deserialiseCache,
  fetchCatalogue,
  serialiseCache,
} from './remote';
import { cachePath } from './resources';
import {
  type CatalogueView,
  cacheMatches,
  emptyView,
  refreshOnOpen,
  resolveOrigin,
} from './source';

export interface CatalogueController {
  view: CatalogueView;
  /** Fetch now, behind whatever is already drawn. */
  refresh: () => void;
}

export function useCatalogue(): CatalogueController {
  const vfs = useVfs();
  const kernel = useKernel();
  const [settings, patchSettings] = useSetting('store');
  // The setting may be a path served beside the OS; the client takes URLs.
  const base = resolveOrigin(settings.origin, globalThis.location?.href);
  const bundled = resolveOrigin(BUNDLED_STORE_ORIGIN, globalThis.location?.href);
  const { autoSync, syncMinutes } = settings;
  const [view, setView] = useState<CatalogueView>(() => emptyView(base));
  const viewRef = useLatest(view);
  const patchRef = useLatest(patchSettings);
  /** Bumped by every attempt, so a slow one cannot land on a newer one. */
  const attempt = useRef(0);

  const fetchNow = useCallback(
    async (behind: boolean) => {
      attempt.current += 1;
      const id = attempt.current;
      setView((v) => ({ ...v, address: base, refreshing: behind, loading: !behind }));
      const result = await fetchCatalogue(base);
      if (id !== attempt.current) return;

      if (result.ok) {
        const now = Date.now();
        setView({
          catalogue: result.value,
          base,
          origin: 'network',
          fetchedAt: now,
          address: base,
          error: null,
          loading: false,
          refreshing: false,
        });
        patchRef.current({ lastSync: now });
        const text = serialiseCache(cacheEntry(base, result.value, now));
        // A cache that cannot be written costs the next launch a fetch and
        // nothing else, so it never interrupts the storefront.
        void vfs.writeText(cachePath(kernel.home), text, { recursive: true }).catch(() => {});
        return;
      }

      setView((v) => ({ ...v, error: result.error, loading: false, refreshing: false }));
      if (viewRef.current.catalogue !== null || base === bundled) return;

      // Nothing to draw: fall back to the catalogue that ships beside the OS.
      const fallback = await fetchCatalogue(bundled);
      if (id !== attempt.current || !fallback.ok) return;
      setView((v) => ({
        ...v,
        catalogue: fallback.value,
        base: bundled,
        origin: 'bundled',
        fetchedAt: null,
      }));
    },
    [base, bundled, kernel.home, vfs, patchRef, viewRef],
  );

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      let kept: CachedCatalogue | null = null;
      try {
        const parsed = deserialiseCache(await vfs.readText(cachePath(kernel.home)));
        if (parsed.ok && cacheMatches(parsed.value, base)) kept = parsed.value;
      } catch {
        /* nothing kept yet, or a file this version cannot read */
      }
      if (cancelled) return;
      if (kept !== null) {
        const entry = kept;
        setView((v) => ({
          ...v,
          catalogue: entry.catalogue,
          base: entry.base,
          origin: 'cache',
          fetchedAt: entry.fetchedAt,
          loading: false,
        }));
      }
      const decision = refreshOnOpen(kept, { now: Date.now(), autoSync, syncMinutes });
      if (decision.fetch) {
        await fetchNow(decision.behind);
      } else {
        setView((v) => ({ ...v, loading: false }));
      }
    };
    void open();
    return () => {
      cancelled = true;
    };
  }, [vfs, kernel.home, base, autoSync, syncMinutes, fetchNow]);

  const refresh = useCallback(() => {
    void fetchNow(viewRef.current.catalogue !== null);
  }, [fetchNow, viewRef]);

  return { view, refresh };
}
