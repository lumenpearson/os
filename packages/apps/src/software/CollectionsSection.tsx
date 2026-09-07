/**
 * The catalogue's own collections: a card each, with the packages it groups in
 * a row beneath it.
 *
 * A collection is the store's grouping, not one worked out here — the title,
 * the tagline and the artwork are fields of the document, and the row is
 * exactly the packages it names, in its order, minus any the catalogue does
 * not itself list. Opening one is handed back to the window, so the package
 * page stays the single place a package is read and installed.
 */

import { Button, cx, EmptyState, Spinner } from '@lumen/ui';
import { Layers, RefreshCw } from 'lucide-react';
import { type KeyboardEvent, useCallback, useMemo, useRef } from 'react';
import { ArtworkFill } from './ArtworkPanel';
import type { InstallJob } from './installer';
import { PackageTile } from './PackageTile';
import { type CatalogueView, emptyLines } from './source';
import {
  collectionShelves,
  type Listing,
  type ListingStatus,
  listingsById,
  type Shelf,
} from './storefront';

/** How each key moves along a row: a step, or one of its ends. */
const ROW_KEYS: Record<string, number | 'start' | 'end'> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: 'start',
  End: 'end',
};

/**
 * Where a key lands from the tile at `from`, or null when the key is not one
 * of the row's or the row ends there. The ends are ends: wrapping round would
 * throw the eye from the last tile to the first with nothing on screen to
 * account for the jump.
 */
export function nextTile(key: string, from: number, length: number): number | null {
  const move = ROW_KEYS[key];
  if (move === undefined) return null;
  const to = move === 'start' ? 0 : move === 'end' ? length - 1 : from + move;
  return to >= 0 && to < length ? to : null;
}

function packageCount(count: number): string {
  return count === 1 ? '1 package' : `${count} packages`;
}

/**
 * Why there is nothing to show, in one sentence.
 *
 * Three different facts get three different sentences. No catalogue arrived —
 * `emptyLines` already names the address that was asked. It arrived and groups
 * nothing. Or it names collections whose packages it does not list, which
 * `collectionShelves` drops: an empty page then means a store that contradicts
 * itself, not a store with nothing in it.
 */
export function collectionsEmptyLines(view: CatalogueView): {
  title: string;
  description: string;
} {
  const catalogue = view.catalogue;
  if (catalogue === null) return emptyLines(view);
  const address = view.base ?? view.address;
  const count = catalogue.collections.length;
  if (count === 0) {
    return {
      title: 'No collections',
      description: `A collection is a set of packages the store groups under one title; the catalogue at ${address} groups none.`,
    };
  }
  return {
    title: 'No collections to show',
    description:
      count === 1
        ? `The one collection at ${address} names packages the catalogue does not list.`
        : `The ${count} collections at ${address} name packages the catalogue does not list.`,
  };
}

/**
 * One collection's packages, in a row that scrolls.
 *
 * A real scroll port rather than a slideshow: every tile is in the document
 * and in the tab order, so nothing is on a timer and nothing is hidden from a
 * screen reader. The arrow keys move between tiles as well, because tabbing
 * through nine of them to reach the tenth is not navigation — and focusing a
 * tile is what brings it into view, which is the browser's own scrolling
 * rather than an animation of ours.
 */
function PackageRow({
  shelf,
  statusOf,
  busyIds,
  onOpen,
}: {
  shelf: Shelf;
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const tiles = [...(row.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const active = document.activeElement;
    const from = active instanceof HTMLButtonElement ? tiles.indexOf(active) : -1;
    if (from < 0) return;
    const to = nextTile(event.key, from, tiles.length);
    if (to === null) return;
    event.preventDefault();
    tiles[to]?.focus();
  }, []);

  return (
    // The padding is room for a tile's focus ring, which the scroll port would
    // otherwise clip at its ends.
    <div ref={row} onKeyDown={onKeyDown} className="lumen-scroll flex gap-3 px-1 pb-1">
      {shelf.listings.map((listing) => (
        <PackageTile
          key={listing.id}
          listing={listing}
          status={statusOf(listing)}
          busy={busyIds.has(listing.id)}
          onOpen={() => onOpen(listing.id)}
          className="w-52 shrink-0"
        />
      ))}
    </div>
  );
}

function CollectionCard({ shelf }: { shelf: Shelf }) {
  return (
    <div
      className={cx(
        // A card gets its own corner and its own depth: --radius-2xl, and
        // --shadow-card for the hairline plus one colourless drop, which is
        // why there is no second border here. Clipping is what holds the
        // drawing inside that corner.
        // deslop-ignore-next-line 21 22
        'relative overflow-hidden rounded-2xl bg-surface shadow-card',
      )}
    >
      {shelf.artwork && (
        <span className="pointer-events-none absolute inset-0">
          <ArtworkFill artwork={shelf.artwork} />
        </span>
      )}
      <div className="relative flex min-h-24 flex-col justify-end gap-1 p-4">
        <h2 className="text-md font-medium text-ink">{shelf.title}</h2>
        {shelf.tagline && <p className="text-sm text-ink-2">{shelf.tagline}</p>}
        <p className="mono text-2xs text-ink-3 tabular-nums">
          {packageCount(shelf.listings.length)}
        </p>
      </div>
    </div>
  );
}

export interface CollectionsSectionProps {
  view: CatalogueView;
  /** The catalogue and the built-in programs, merged — what a collection's ids resolve against. */
  listings: readonly Listing[];
  statusOf: (listing: Listing) => ListingStatus;
  /** Installs in flight, so a tile mid-install says so here as it does on Discover. */
  jobs: readonly InstallJob[];
  /** The package that was chosen, for the window to open its page. */
  onOpen: (id: string) => void;
  onRefresh: () => void;
}

export function CollectionsSection({
  view,
  listings,
  statusOf,
  jobs,
  onOpen,
  onRefresh,
}: CollectionsSectionProps) {
  const index = useMemo(() => listingsById(listings), [listings]);
  const collections = useMemo(
    () => collectionShelves(view.catalogue, index),
    [view.catalogue, index],
  );
  // A bundle installs its members, so every row of a running job is busy too.
  const busyIds = useMemo(
    () =>
      new Set(
        jobs
          .filter((job) => job.state === 'running')
          .flatMap((job) => [job.id, ...job.rows.map((r) => r.id)]),
      ),
    [jobs],
  );

  if (view.loading && view.catalogue === null) {
    return (
      <div className="lumen-scroll min-h-0 flex-1">
        <p className="flex items-center gap-2 px-4 py-4 text-base text-ink-2">
          <Spinner size={14} /> Fetching the catalogue…
        </p>
      </div>
    );
  }

  if (collections.length === 0) {
    const lines = collectionsEmptyLines(view);
    return (
      <EmptyState
        icon={<Layers />}
        title={lines.title}
        description={lines.description}
        action={
          view.catalogue === null ? (
            <Button size="sm" icon={<RefreshCw />} onClick={onRefresh}>
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="flex flex-col gap-7 px-4 py-4">
        {collections.map((shelf) => (
          // The row scrolls, so it fits a narrow window without a second
          // layout; only the card above it needs the width it is given.
          <section key={shelf.id} className="flex flex-col gap-3" aria-label={shelf.title}>
            <CollectionCard shelf={shelf} />
            <PackageRow shelf={shelf} statusOf={statusOf} busyIds={busyIds} onOpen={onOpen} />
          </section>
        ))}
      </div>
    </div>
  );
}
