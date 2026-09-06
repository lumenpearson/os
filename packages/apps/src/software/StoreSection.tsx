import type { AppManifest } from '@lumen/kernel';
import { Button, cx, EmptyState, Select, Spinner } from '@lumen/ui';
import { PackageSearch, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { ArtworkPanel } from './ArtworkPanel';
import { InstallJobs } from './InstallJobs';
import type { InstallJob } from './installer';
import { PackagePage } from './PackagePage';
import { PackageTile } from './PackageTile';
import type { Banner, PackageDocument } from './remote';
import { type CatalogueView, emptyLines, freshnessLine } from './source';
import {
  collectionShelves,
  type FilterOption,
  filterListings,
  isFiltered,
  type Listing,
  type ListingFilter,
  type ListingStatus,
  listingsById,
  type Shelf,
  sectionShelves,
  systemShelf,
} from './storefront';
import type { JobListener } from './useInstalls';

/** Where the storefront is: the shelves, one collection, or one package. */
export type StoreRoute =
  | { kind: 'browse' }
  | { kind: 'collection'; id: string }
  | { kind: 'package'; id: string };

/** Below this the window shows one column and keeps the filters out of the toolbar. */
export const COMPACT_AT = 560;

function BannerCard({ banner, onSelect }: { banner: Banner; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'relative overflow-hidden rounded-md border border-rule bg-surface text-left lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:border-rule-strong',
      )}
    >
      <span className="pointer-events-none absolute inset-0">
        <ArtworkPanel artwork={banner.artwork} className="h-full w-full rounded-none border-0" />
      </span>
      <span className="relative flex min-h-24 flex-col justify-end gap-1 p-3">
        <span className="text-md font-medium text-ink">{banner.title}</span>
        <span className="text-sm text-ink-2">{banner.text}</span>
      </span>
    </button>
  );
}

function TileGrid({
  listings,
  statusOf,
  busyIds,
  onOpen,
  compact,
}: {
  listings: readonly Listing[];
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  onOpen: (listing: Listing) => void;
  compact: boolean;
}) {
  return (
    <div
      className={cx(
        'grid gap-3',
        compact ? 'grid-cols-1' : '[grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]',
      )}
    >
      {listings.map((listing) => (
        <PackageTile
          key={listing.id}
          listing={listing}
          status={statusOf(listing)}
          busy={busyIds.has(listing.id)}
          onOpen={() => onOpen(listing)}
        />
      ))}
    </div>
  );
}

export interface StoreSectionProps {
  view: CatalogueView;
  base: string;
  listings: readonly Listing[];
  filter: ListingFilter;
  statusOf: (listing: Listing) => ListingStatus;
  jobs: readonly InstallJob[];
  subscribe: (listener: JobListener) => () => void;
  /** True when the window is too narrow for a row of tiles and a toolbar of filters. */
  compact: boolean;
  kinds: readonly FilterOption[];
  categories: readonly FilterOption[];
  route: StoreRoute;
  onRoute: (route: StoreRoute) => void;
  onKind: (kind: string) => void;
  onCategory: (category: string) => void;
  onRefresh: () => void;
  onStop: (id: string) => void;
  onDismiss: (id: string) => void;
  onInstall: (document: PackageDocument) => void;
  onInstallSystem: (manifest: AppManifest) => void;
  onOpenApp: (id: string) => void;
}

/** The storefront: banners, shelves, collections, and one package at a time. */
export function StoreSection(props: StoreSectionProps) {
  const {
    view,
    base,
    listings,
    filter,
    statusOf,
    jobs,
    subscribe,
    compact,
    kinds,
    categories,
    route,
    onRoute,
    onKind,
    onCategory,
    onRefresh,
    onStop,
    onDismiss,
    onInstall,
    onInstallSystem,
    onOpenApp,
  } = props;

  const index = useMemo(() => listingsById(listings), [listings]);
  const visible = useMemo(() => filterListings(listings, filter), [listings, filter]);
  const sections = useMemo(() => sectionShelves(view.catalogue, index), [view.catalogue, index]);
  const collections = useMemo(
    () => collectionShelves(view.catalogue, index),
    [view.catalogue, index],
  );
  const system = useMemo(() => systemShelf(index), [index]);
  const busyIds = useMemo(
    () =>
      new Set(
        jobs
          .filter((job) => job.state === 'running')
          .flatMap((job) => [job.id, ...job.rows.map((r) => r.id)]),
      ),
    [jobs],
  );
  const searching = isFiltered(filter);
  const banners = view.catalogue?.banners ?? [];

  const shelfRefs = useRef(new Map<string, HTMLElement | null>());
  const registerShelf = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      shelfRefs.current.set(id, element);
    },
    [],
  );

  const openListing = useCallback(
    (listing: Listing) => onRoute({ kind: 'package', id: listing.id }),
    [onRoute],
  );

  const followBanner = useCallback(
    (banner: Banner) => {
      if (banner.target.kind === 'package') {
        if (index.has(banner.target.id)) onRoute({ kind: 'package', id: banner.target.id });
        return;
      }
      if (banner.target.kind === 'collection') {
        onRoute({ kind: 'collection', id: banner.target.id });
        return;
      }
      shelfRefs.current.get(banner.target.id)?.scrollIntoView({ block: 'start' });
    },
    [index, onRoute],
  );

  const tray = (
    <InstallJobs jobs={jobs} subscribe={subscribe} onStop={onStop} onDismiss={onDismiss} />
  );

  if (route.kind === 'package') {
    const listing = index.get(route.id);
    if (listing) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          {tray}
          <PackagePage
            listing={listing}
            base={listing.origin === 'system' ? base : (view.base ?? base)}
            status={statusOf(listing)}
            job={jobs.find((job) => job.id === listing.id)}
            index={index}
            statusOf={statusOf}
            compact={compact}
            onBack={() => onRoute({ kind: 'browse' })}
            onOpenListing={openListing}
            onInstall={onInstall}
            onInstallSystem={onInstallSystem}
            onOpenApp={onOpenApp}
          />
        </div>
      );
    }
  }

  const collection =
    route.kind === 'collection' ? collections.find((c) => c.id === route.id) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-canvas px-4 py-1.5">
        <p className="truncate-1 text-sm text-ink-2">{freshnessLine(view, Date.now())}</p>
        {view.refreshing && <Spinner size={12} />}
        <span className="ms-auto shrink-0" />
        <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {tray}

      <div className="lumen-scroll min-h-0 flex-1">
        <div className="flex flex-col gap-7 px-4 py-4">
          {compact && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                size="sm"
                aria-label="Kind"
                options={kinds.map((k) => ({ value: k.value, label: k.label }))}
                value={filter.kind ?? 'all'}
                onChange={onKind}
              />
              <Select
                size="sm"
                aria-label="Category"
                options={categories.map((c) => ({ value: c.value, label: c.label }))}
                value={filter.category ?? 'all'}
                onChange={onCategory}
              />
            </div>
          )}

          {view.catalogue === null && !view.loading && (
            <section className="flex flex-col items-start gap-2 rounded-md border border-rule bg-canvas p-4">
              <h2 className="text-md font-medium text-ink">{emptyLines(view).title}</h2>
              <p className="max-w-2xl text-base text-ink-2">{emptyLines(view).description}</p>
              <Button size="sm" icon={<RefreshCw />} onClick={onRefresh}>
                Try again
              </Button>
            </section>
          )}

          {view.loading && view.catalogue === null && (
            <p className="flex items-center gap-2 text-base text-ink-2">
              <Spinner size={14} /> Fetching the catalogue…
            </p>
          )}

          {collection !== undefined ? (
            <CollectionView
              shelf={collection}
              statusOf={statusOf}
              busyIds={busyIds}
              compact={compact}
              onOpen={openListing}
              onBack={() => onRoute({ kind: 'browse' })}
            />
          ) : searching ? (
            visible.length === 0 ? (
              <EmptyState
                icon={<PackageSearch />}
                title="No package matches"
                description="Try another search, or a different kind or category."
              />
            ) : (
              <section className="flex flex-col gap-3">
                <h2 className="text-md font-medium text-ink">
                  {visible.length === 1 ? '1 package' : `${visible.length} packages`}
                </h2>
                <TileGrid
                  listings={visible}
                  statusOf={statusOf}
                  busyIds={busyIds}
                  onOpen={openListing}
                  compact={compact}
                />
              </section>
            )
          ) : (
            <>
              {banners.length > 0 && (
                <div
                  className={cx(
                    'grid gap-3',
                    compact
                      ? 'grid-cols-1'
                      : '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
                  )}
                >
                  {banners.map((banner) => (
                    <BannerCard
                      key={banner.id}
                      banner={banner}
                      onSelect={() => followBanner(banner)}
                    />
                  ))}
                </div>
              )}

              {[...sections, system].map((shelf) => (
                <ShelfRow
                  key={shelf.id}
                  shelf={shelf}
                  statusOf={statusOf}
                  busyIds={busyIds}
                  compact={compact}
                  onOpen={openListing}
                  register={registerShelf(shelf.id)}
                />
              ))}

              {collections.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-md font-medium text-ink">Collections</h2>
                  <div
                    className={cx(
                      'grid gap-3',
                      compact
                        ? 'grid-cols-1'
                        : '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
                    )}
                  >
                    {collections.map((shelf) => (
                      <CollectionCard
                        key={shelf.id}
                        shelf={shelf}
                        onOpen={() => onRoute({ kind: 'collection', id: shelf.id })}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShelfRow({
  shelf,
  statusOf,
  busyIds,
  compact,
  onOpen,
  register,
}: {
  shelf: Shelf;
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  compact: boolean;
  onOpen: (listing: Listing) => void;
  register: (element: HTMLElement | null) => void;
}) {
  return (
    <section ref={register} className="flex flex-col gap-3" aria-label={shelf.title}>
      <h2 className="text-md font-medium text-ink">{shelf.title}</h2>
      {compact ? (
        <TileGrid
          listings={shelf.listings}
          statusOf={statusOf}
          busyIds={busyIds}
          onOpen={onOpen}
          compact
        />
      ) : (
        <div className="lumen-scroll -mx-1 flex gap-3 px-1 pb-1">
          {shelf.listings.map((listing) => (
            <PackageTile
              key={listing.id}
              listing={listing}
              status={statusOf(listing)}
              busy={busyIds.has(listing.id)}
              onOpen={() => onOpen(listing)}
              className="w-52 shrink-0"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CollectionCard({ shelf, onOpen }: { shelf: Shelf; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex flex-col overflow-hidden rounded-md border border-rule bg-surface text-left lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:border-rule-strong',
      )}
    >
      {shelf.artwork && (
        <span className="block h-16 w-full border-b border-rule">
          <ArtworkPanel artwork={shelf.artwork} className="h-full w-full rounded-none border-0" />
        </span>
      )}
      <span className="flex flex-col gap-1 p-3">
        <span className="text-base font-medium text-ink">{shelf.title}</span>
        {shelf.tagline && <span className="line-clamp-2 text-sm text-ink-2">{shelf.tagline}</span>}
        <span className="mono text-2xs text-ink-3 tabular-nums">
          {shelf.listings.length} packages
        </span>
      </span>
    </button>
  );
}

function CollectionView({
  shelf,
  statusOf,
  busyIds,
  compact,
  onOpen,
  onBack,
}: {
  shelf: Shelf;
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  compact: boolean;
  onOpen: (listing: Listing) => void;
  onBack: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <Button size="sm" variant="ghost" className="self-start" onClick={onBack}>
        All shelves
      </Button>
      {shelf.artwork ? (
        <ArtworkPanel artwork={shelf.artwork}>
          <div className="flex min-h-20 flex-col justify-end gap-1 p-3">
            <h2 className="text-md font-medium text-ink">{shelf.title}</h2>
            {shelf.tagline && <p className="text-sm text-ink-2">{shelf.tagline}</p>}
          </div>
        </ArtworkPanel>
      ) : (
        <h2 className="text-md font-medium text-ink">{shelf.title}</h2>
      )}
      <TileGrid
        listings={shelf.listings}
        statusOf={statusOf}
        busyIds={busyIds}
        onOpen={onOpen}
        compact={compact}
      />
    </section>
  );
}
