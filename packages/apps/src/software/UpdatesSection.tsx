/**
 * Updates: the packages installed from the store that the catalogue has a
 * newer version of.
 *
 * The source is real — `useUpdates` fetches the catalogue and compares it
 * against the version of everything installed — so this list can be empty for
 * the right reason rather than by construction. Applying one is the ordinary
 * install path: fetch `packages/<id>.json`, hand the document to the
 * installer, which replaces what is there.
 *
 * The system's own version is not here. Lumen has no release feed to check it
 * against, and a "Lumen is up to date" with nothing behind it would be the
 * one line on this screen that is not true.
 */

import { Button, EmptyState, Spinner } from '@lumen/ui';
import { ArrowUpCircle, CircleCheck, RefreshCw } from 'lucide-react';
import type { StoreError } from './remote';
import { errorHeadline } from './source';
import { KIND_LABELS } from './storefront';
import type { AvailableUpdate } from './updates';
import { updateCountLabel } from './updates';

export interface UpdatesSectionProps {
  updates: readonly AvailableUpdate[];
  /** True while the catalogue is being fetched — which is what a check is. */
  checking: boolean;
  lastChecked: number | null;
  error: StoreError | null;
  locale: string;
  /** Settings > Store: whether a found update installs itself. */
  automatic: boolean;
  onCheck: () => void;
  onUpdate: (update: AvailableUpdate) => void;
  onUpdateAll: () => void;
  /** Ids with an install already running, so a row cannot be started twice. */
  busyIds: ReadonlySet<string>;
}

/** When the last check happened, or that there has not been one. */
export function checkedAt(at: number | null, locale: string): string {
  if (at === null) return 'Not checked yet';
  return `Checked ${new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export function UpdatesSection({
  updates,
  checking,
  lastChecked,
  error,
  locale,
  automatic,
  onCheck,
  onUpdate,
  onUpdateAll,
  busyIds,
}: UpdatesSectionProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-rule bg-canvas px-4 py-2">
        <span className="text-base text-ink">{updateCountLabel(updates.length)}</span>
        <span className="mono text-sm text-ink-3 tabular-nums">
          {checkedAt(lastChecked, locale)}
        </span>
        <div className="flex-1" />
        {updates.length > 1 && (
          <Button size="sm" onClick={onUpdateAll}>
            Update All
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          icon={checking ? <Spinner size={14} /> : <RefreshCw className="size-3.5" />}
          disabled={checking}
          onClick={onCheck}
        >
          {checking ? 'Checking…' : 'Check for Updates'}
        </Button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-rule bg-surface-2 px-4 py-2">
          <p className="text-base text-ink">{errorHeadline(error)}</p>
          <p className="text-sm text-ink-2">{error.message}</p>
        </div>
      )}

      <div className="lumen-scroll flex-1 p-4">
        {updates.length === 0 ? (
          <EmptyState
            icon={lastChecked === null ? <ArrowUpCircle /> : <CircleCheck />}
            title={lastChecked === null ? 'Not checked yet' : 'Everything is up to date'}
            description={
              lastChecked === null
                ? 'A check fetches the catalogue and compares it against what is installed.'
                : automatic
                  ? 'Every package installed from the store is the version the catalogue lists, and a newer one installs itself.'
                  : 'Every package installed from the store is the version the catalogue lists.'
            }
          />
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col divide-y divide-rule rounded-md border border-rule bg-surface">
            {updates.map((update) => {
              const busy = busyIds.has(update.id);
              return (
                <li key={update.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="mono shrink-0 rounded-sm border border-rule px-1.5 py-0.5 text-2xs uppercase text-ink-3">
                    {KIND_LABELS[update.summary.kind]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate-1 text-base text-ink">{update.name}</span>
                    <span className="mono text-sm text-ink-2 tabular-nums">
                      {update.from} <span aria-hidden>→</span> {update.to}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => onUpdate(update)}
                  >
                    {busy ? 'Updating…' : 'Update'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
